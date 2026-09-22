import { getAuth } from 'firebase-admin/auth'
import { assertBootable, config } from '../src/config.js'
import { cloudAuthClient } from '../src/cloud-auth.js'
import { adminApp, db } from '../src/firebase.js'
import { randomBytes } from 'node:crypto'
import { unwrapDataKey, wrapDataKey } from '../src/crypto.js'
import { getVercelOidcToken } from '@vercel/oidc'

// Read-only preflight. It does not create users, change claims, or write data.
if (process.env.VERCEL_ENV !== 'production') {
  console.log('Cloud preflight skipped outside Vercel production.')
} else {
  let stage = 'configuration'
  try {
    assertBootable()
    const client = cloudAuthClient()
    if (!client) throw new Error('Missing production federation configuration')
    stage = 'Google Cloud token exchange'
    // Log identity claims only, never the bearer token or request headers.
    const oidc = await getVercelOidcToken()
    const claims = JSON.parse(Buffer.from(oidc.split('.')[1], 'base64url').toString())
    console.log('OIDC identity:', JSON.stringify({
      issuer: claims.iss, audience: claims.aud, subject: claims.sub,
      project: claims.project_id, owner: claims.owner_id,
    }))
    await client.getAccessToken()
    console.log('Google Cloud token exchange passed.')
    stage = 'Firestore read'
    await db().doc(`tenants/${config.pilotTenantId}`).get()
    console.log('Firestore read passed.')
    stage = 'Firebase Auth read'
    try {
      await getAuth(adminApp()).getUserByEmail('modo-deployment-check@invalid.example')
    } catch (error) {
      if ((error as { code?: string }).code !== 'auth/user-not-found') throw error
    }
    console.log('Firebase Auth read passed.')
    stage = 'data-key encryption'
    const key = randomBytes(32)
    if (!(await unwrapDataKey(await wrapDataKey(key))).equals(key)) throw new Error('Key round-trip failed')
    console.log('Data-key encryption passed.')
    await db().terminate()
  } catch (error) {
    // Never print SDK request objects, which can contain credentials/headers.
    const code = (error as { code?: string | number }).code
    console.error(`Cloud preflight failed at ${stage}${code ? ` (code ${code})` : ''}. Check the production configuration and IAM grants.`)
    const data = (error as { response?: { data?: { error?: string | { message?: string }; error_description?: string } } }).response?.data
    const reason = data?.error_description ?? (typeof data?.error === 'object' ? data.error.message : data?.error)
    if (typeof reason === 'string') {
      console.error('Google rejection:', reason.replace(/eyJ[\w-]*\.[\w-]+\.[\w-]+/g, '[redacted token]').slice(0, 1000))
    }
    process.exit(1)
  }
}
