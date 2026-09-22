import { randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory stand-in for the one Firestore document this module touches.
const store = new Map<string, Record<string, unknown>>()
vi.mock('./firebase.js', () => ({
  paths: {
    userCol: (t: string, u: string, c: string) => ({
      doc: (d: string) => {
        const key = `${t}/${u}/${c}/${d}`
        return {
          get: async () => ({ exists: store.has(key), data: () => store.get(key) }),
          set: async (v: Record<string, unknown>) => { store.set(key, v) },
          create: async (v: Record<string, unknown>) => { if (store.has(key)) throw new Error('exists'); store.set(key, v) },
        }
      },
    }),
  },
}))
vi.mock('./cloud-auth.js', () => ({ cloudAuthClient: () => undefined }))

const { config } = await import('./config.js')
const { forgetKey, open, seal, userKey } = await import('./crypto.js')

describe('data keys', () => {
  beforeEach(() => {
    store.clear()
    forgetKey('t', 'u')
    config.kmsKeyName = ''
    config.appEncryptionKey = randomBytes(32).toString('base64')
    config.appEnv = 'production'
  })

  it('wraps a legacy unwrapped key in place and keeps old data readable', async () => {
    const legacy = randomBytes(32)
    store.set('t/u/secrets/dek', { wrapped: legacy.toString('base64'), kms: 'none' })
    const sealedBefore = seal(legacy, 'Secret plan')

    const key = await userKey('t', 'u')
    expect(open(key, sealedBefore)).toBe('Secret plan')
    expect(store.get('t/u/secrets/dek')!.kms).toBe('env:v1')
    expect(JSON.stringify(store.get('t/u/secrets/dek'))).not.toContain(legacy.toString('base64'))

    forgetKey('t', 'u')
    expect((await userKey('t', 'u')).equals(legacy)).toBe(true)
  })

  it('refuses to write an unwrapped key outside the emulator', async () => {
    config.appEncryptionKey = ''
    config.appEnv = 'local'
    const was = process.env.FIRESTORE_EMULATOR_HOST
    delete process.env.FIRESTORE_EMULATOR_HOST
    await expect(userKey('t', 'u')).rejects.toThrow(/must be wrapped/)
    if (was) process.env.FIRESTORE_EMULATOR_HOST = was
  })
})
