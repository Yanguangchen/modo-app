import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { KeyManagementServiceClient } from '@google-cloud/kms'
import { config } from './config.js'
import { paths } from './firebase.js'

/* Envelope encryption for private bodies (REQUIREMENTS §11).
   Each user has a random 256-bit data key, wrapped by Cloud KMS and stored on the
   user document. Bodies are sealed locally with AES-256-GCM using that key.
   Without KMS_KEY_NAME (local only; production refuses to boot) the key is stored unwrapped. */

let kms: KeyManagementServiceClient | null = null
const kmsClient = () => (kms ??= new KeyManagementServiceClient())

type Wrapped = { wrapped: string; kms: string }
const cache = new Map<string, { key: Buffer; exp: number }>()
const TTL = 5 * 60_000

async function wrap(key: Buffer): Promise<Wrapped> {
  if (!config.kmsKeyName) return { wrapped: key.toString('base64'), kms: 'none' }
  const [res] = await kmsClient().encrypt({ name: config.kmsKeyName, plaintext: key })
  return { wrapped: Buffer.from(res.ciphertext as Uint8Array).toString('base64'), kms: config.kmsKeyName }
}

async function unwrap(w: Wrapped): Promise<Buffer> {
  if (w.kms === 'none') {
    if (config.appEnv === 'production') throw new Error('Unwrapped data key found in production')
    return Buffer.from(w.wrapped, 'base64')
  }
  const [res] = await kmsClient().decrypt({ name: w.kms, ciphertext: Buffer.from(w.wrapped, 'base64') })
  return Buffer.from(res.plaintext as Uint8Array)
}

/** The caller's data key, created on first use. */
export async function userKey(tenantId: string, uid: string): Promise<Buffer> {
  const id = `${tenantId}/${uid}`
  const hit = cache.get(id)
  if (hit && hit.exp > Date.now()) return hit.key
  const ref = paths.userCol(tenantId, uid, 'secrets').doc('dek')
  const snap = await ref.get()
  let key: Buffer
  if (snap.exists) {
    key = await unwrap(snap.data() as Wrapped)
  } else {
    key = randomBytes(32)
    await ref.create(await wrap(key)).catch(async () => { key = await unwrap((await ref.get()).data() as Wrapped) })
  }
  cache.set(id, { key, exp: Date.now() + TTL })
  return key
}

export function forgetKey(tenantId: string, uid: string) { cache.delete(`${tenantId}/${uid}`) }

export function seal(key: Buffer, plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return `v1:${Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')}`
}

export function open(key: Buffer, sealed: string): string {
  if (!sealed.startsWith('v1:')) return sealed
  const raw = Buffer.from(sealed.slice(3), 'base64')
  const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
  d.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
}

/** Seal the listed string fields of an object; other fields pass through. */
export function sealFields<T extends Record<string, unknown>>(key: Buffer, obj: T, fields: readonly string[]): T {
  const out: Record<string, unknown> = { ...obj }
  for (const f of fields) {
    const v = out[f]
    if (typeof v === 'string' && v) out[f] = seal(key, v)
    else if (Array.isArray(v)) out[f] = v.map(x => (typeof x === 'string' ? seal(key, x) : x))
  }
  return out as T
}

export function openFields<T extends Record<string, unknown>>(key: Buffer, obj: T, fields: readonly string[]): T {
  const out: Record<string, unknown> = { ...obj }
  for (const f of fields) {
    const v = out[f]
    if (typeof v === 'string') out[f] = open(key, v)
    else if (Array.isArray(v)) out[f] = v.map(x => (typeof x === 'string' ? open(key, x) : x))
  }
  return out as T
}
