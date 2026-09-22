import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { KeyManagementServiceClient } from '@google-cloud/kms'
import { config } from './config.js'
import { paths } from './firebase.js'
import { cloudAuthClient } from './cloud-auth.js'

/* Envelope encryption for private bodies (REQUIREMENTS §11).
   Each user has a random 256-bit data key, wrapped by Cloud KMS and stored on the
   user document. Bodies are sealed locally with AES-256-GCM using that key.
   Without KMS, APP_ENCRYPTION_KEY wraps data keys using AES-256-GCM.
   Unwrapped keys are allowed only in local development. */

let kms: KeyManagementServiceClient | null = null
const kmsClient = () => (kms ??= new KeyManagementServiceClient({ authClient: cloudAuthClient() }))

type Wrapped = { wrapped: string; kms: string }
const cache = new Map<string, { key: Buffer; exp: number }>()
const TTL = 5 * 60_000

function environmentWrappingKey(): Buffer {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(config.appEncryptionKey)) {
    throw new Error('A 32-byte base64 APP_ENCRYPTION_KEY is required to wrap private data keys')
  }
  return Buffer.from(config.appEncryptionKey, 'base64')
}

export async function wrapDataKey(key: Buffer): Promise<Wrapped> {
  if (!config.kmsKeyName) {
    if (config.appEncryptionKey) return { wrapped: seal(environmentWrappingKey(), key.toString('base64')), kms: 'env:v1' }
    // Unwrapped keys only ever go to the local emulator, never to a real database.
    if (config.appEnv === 'production' || !process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error('Private data keys must be wrapped: set APP_ENCRYPTION_KEY or KMS_KEY_NAME')
    }
    return { wrapped: key.toString('base64'), kms: 'none' }
  }
  const [res] = await kmsClient().encrypt({ name: config.kmsKeyName, plaintext: key })
  return { wrapped: Buffer.from(res.ciphertext as Uint8Array).toString('base64'), kms: config.kmsKeyName }
}

export async function unwrapDataKey(w: Wrapped): Promise<Buffer> {
  if (w.kms === 'env:v1') {
    if (!w.wrapped.startsWith('v1:')) throw new Error('Invalid wrapped data key')
    const key = Buffer.from(open(environmentWrappingKey(), w.wrapped), 'base64')
    if (key.length !== 32) throw new Error('Invalid private data key')
    return key
  }
  if (w.kms === 'none') {
    if (config.appEnv === 'production') throw new Error('Unwrapped data key found in production')
    return Buffer.from(w.wrapped, 'base64')
  }
  const [res] = await kmsClient().decrypt({ name: w.kms, ciphertext: Buffer.from(w.wrapped, 'base64') })
  return Buffer.from(res.plaintext as Uint8Array)
}

const canWrap = () => !!config.kmsKeyName || /^[A-Za-z0-9+/]{43}=$/.test(config.appEncryptionKey)

/** The caller's data key, created on first use. */
export async function userKey(tenantId: string, uid: string): Promise<Buffer> {
  const id = `${tenantId}/${uid}`
  const hit = cache.get(id)
  if (hit && hit.exp > Date.now()) return hit.key
  const ref = paths.userCol(tenantId, uid, 'secrets').doc('dek')
  const snap = await ref.get()
  let key: Buffer
  if (snap.exists && (snap.data() as Wrapped).kms === 'none' && canWrap()) {
    // Legacy key written unwrapped by a local run: wrap it in place. The key itself is
    // unchanged, so everything already sealed with it stays readable.
    key = Buffer.from((snap.data() as Wrapped).wrapped, 'base64')
    await ref.set(await wrapDataKey(key))
  } else if (snap.exists) {
    key = await unwrapDataKey(snap.data() as Wrapped)
  } else {
    key = randomBytes(32)
    await ref.create(await wrapDataKey(key)).catch(async () => { key = await unwrapDataKey((await ref.get()).data() as Wrapped) })
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
