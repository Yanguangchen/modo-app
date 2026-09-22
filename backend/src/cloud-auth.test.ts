import { describe, expect, it, vi } from 'vitest'
import { createFederatedClient, firebaseCredential } from './cloud-auth.js'

const oidc = vi.hoisted(() => vi.fn(async () => 'test-oidc-token'))
vi.mock('@vercel/oidc', () => ({ getVercelOidcToken: oidc }))

const settings = {
  projectNumber: '123456789', serviceAccountEmail: 'runtime@test-project.iam.gserviceaccount.com',
  poolId: 'production', providerId: 'vercel',
}

describe('keyless Google Cloud credentials', () => {
  it('leaves ADC intact when federation is not configured', () => {
    expect(createFederatedClient({ projectNumber: '', serviceAccountEmail: '', poolId: '', providerId: '' })).toBeUndefined()
  })
  it('rejects incomplete or malformed configuration', () => {
    expect(() => createFederatedClient({ ...settings, poolId: '' })).toThrow('incomplete')
    expect(() => createFederatedClient({ ...settings, projectNumber: '../other' })).toThrow('invalid')
    expect(() => createFederatedClient({ ...settings, serviceAccountEmail: 'https://untrusted.example/' })).toThrow('invalid')
  })
  it('fetches the OIDC token on demand, not during construction', async () => {
    oidc.mockClear()
    const client = createFederatedClient(settings)!
    expect(oidc).not.toHaveBeenCalled()
    expect(await client.retrieveSubjectToken()).toBe('test-oidc-token')
    expect(oidc).toHaveBeenCalledTimes(1)
  })
  it('adapts expiring Google tokens to Firebase without exposing them', async () => {
    const client = createFederatedClient(settings)!
    vi.spyOn(client, 'getAccessToken').mockResolvedValue({ token: 'test-access-token' })
    client.credentials = { expiry_date: Date.now() + 3600_000 }
    const result = await firebaseCredential(client).getAccessToken()
    expect(result.access_token).toBe('test-access-token')
    expect(result.expires_in).toBeGreaterThan(3590)
    client.credentials = { expiry_date: Date.now() - 1 }
    await expect(firebaseCredential(client).getAccessToken()).rejects.toThrow('no usable access token')
  })
})
