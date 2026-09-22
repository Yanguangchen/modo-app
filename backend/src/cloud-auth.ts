import { getVercelOidcToken } from '@vercel/oidc'
import { IdentityPoolClient } from 'google-auth-library'
import type { Credential } from 'firebase-admin/app'
import { config } from './config.js'

export type FederationConfig = {
  projectNumber: string
  serviceAccountEmail: string
  poolId: string
  providerId: string
}

export function createFederatedClient(settings: FederationConfig): IdentityPoolClient | undefined {
  const values = Object.values(settings)
  if (values.every(value => !value)) return undefined // Local/Cloud Run ADC.
  if (values.some(value => !value)) throw new Error('Google Cloud federation configuration is incomplete')
  if (!/^\d+$/.test(settings.projectNumber)
    || !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(settings.serviceAccountEmail)
    || !/^[a-z0-9-]+$/.test(settings.poolId)
    || !/^[a-z0-9-]+$/.test(settings.providerId)) {
    throw new Error('Google Cloud federation configuration is invalid')
  }
  return new IdentityPoolClient({
    audience: `//iam.googleapis.com/projects/${settings.projectNumber}/locations/global/workloadIdentityPools/${settings.poolId}/providers/${settings.providerId}`,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${settings.serviceAccountEmail}:generateAccessToken`,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    // Resolve on demand inside the current request, never at module startup.
    subject_token_supplier: { getSubjectToken: async () => getVercelOidcToken() },
  })
}

let client: IdentityPoolClient | undefined
export function cloudAuthClient(): IdentityPoolClient | undefined {
  return client ??= createFederatedClient(config.federation)
}

export function firebaseCredential(authClient: IdentityPoolClient): Credential {
  return {
    async getAccessToken() {
      const { token } = await authClient.getAccessToken()
      const expiry = authClient.credentials.expiry_date
      if (!token || !expiry || expiry <= Date.now()) throw new Error('Google Cloud returned no usable access token')
      return { access_token: token, expires_in: Math.floor((expiry - Date.now()) / 1000) }
    },
  }
}
