import { createHash, randomUUID } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { db, paths } from './firebase.js'

export type AuditInput = {
  actor: string
  action: string
  objectId?: string
  destination?: string
  result: 'ok' | 'denied' | 'failed'
  policy?: string
}

/* Append-only, hash-chained audit events (REQUIREMENTS §6 AuditEvent).
   Each event stores the previous event's hash; a transaction serializes the chain.
   No private bodies are ever written here. */
const FIELDS = ['seq', 'at', 'prevHash', 'actor', 'action', 'objectId', 'destination', 'result', 'policy'] as const

/** Fixed field order, undefined dropped — so the hash never depends on how a caller built the object. */
export function canonical(e: Record<string, unknown>) {
  return JSON.stringify(FIELDS.filter(f => e[f] !== undefined).map(f => [f, e[f]]))
}
const hashOf = (e: Record<string, unknown>) => createHash('sha256').update(canonical(e)).digest('hex')

export async function audit(tenantId: string, input: AuditInput) {
  const headRef = paths.auditHead(tenantId)
  const id = randomUUID()
  await db().runTransaction(async tx => {
    const head = await tx.get(headRef)
    const prevHash = (head.data()?.lastHash as string | undefined) ?? 'genesis'
    const seq = ((head.data()?.seq as number | undefined) ?? 0) + 1
    const at = new Date().toISOString()
    const body = { seq, at, prevHash, ...input }
    const hash = hashOf(body)
    tx.set(paths.audit(tenantId).doc(id), { ...body, hash, createdAt: FieldValue.serverTimestamp() })
    tx.set(headRef, { lastHash: hash, seq }, { merge: true })
  })
  return id
}

/** Recomputes the chain; true when no event in the range was altered, removed, or reordered. */
export function verifyChain(events: { seq: number; prevHash: string; hash: string; [k: string]: unknown }[]) {
  const sorted = [...events].sort((a, b) => a.seq - b.seq)
  return sorted.every((e, i) => hashOf(e) === e.hash && (i === 0 || e.prevHash === sorted[i - 1].hash))
}
