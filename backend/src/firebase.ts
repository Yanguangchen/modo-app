import { getApps, initializeApp } from 'firebase-admin/app'
import type { App } from 'firebase-admin/app'
import { Firestore, getFirestore } from 'firebase-admin/firestore'
import { cloudAuthClient, firebaseCredential } from './cloud-auth.js'
import { config } from './config.js'

// Vercel uses short-lived, federated credentials. Local/Cloud Run keep ADC.
export function adminApp(): App {
  const existing = getApps()[0]
  if (existing) return existing
  const authClient = cloudAuthClient()
  return initializeApp({
    projectId: config.firebaseProjectId,
    ...(authClient ? { credential: firebaseCredential(authClient) } : {}),
  })
}

let firestore: Firestore | null = null
export function db(): Firestore {
  if (!firestore) {
    const authClient = cloudAuthClient()
    // Firebase's getFirestore() accepts only certificate/ADC credentials.
    // Its exported Google Cloud client supports an explicit federated client.
    firestore = authClient ? new Firestore({
      projectId: config.firebaseProjectId,
      databaseId: config.firestoreDatabaseId || '(default)',
      authClient,
    }) : config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)'
      ? getFirestore(adminApp(), config.firestoreDatabaseId)
      : getFirestore(adminApp())
    firestore.settings({ ignoreUndefinedProperties: true })
  }
  return firestore
}

export const paths = {
  tenant: (t: string) => db().doc(`tenants/${t}`),
  user: (t: string, u: string) => db().doc(`tenants/${t}/users/${u}`),
  users: (t: string) => db().collection(`tenants/${t}/users`),
  userCol: (t: string, u: string, name: 'sources' | 'transformations' | 'tasks' | 'meetings' | 'secrets') => db().collection(`tenants/${t}/users/${u}/${name}`),
  guideFields: (t: string, u: string) => db().collection(`tenants/${t}/guides/${u}/fields`),
  guideSnapshots: (t: string, u: string) => db().collection(`tenants/${t}/guides/${u}/snapshots`),
  knowledge: (t: string) => db().collection(`tenants/${t}/knowledge`),
  audit: (t: string) => db().collection(`tenants/${t}/audit`),
  auditHead: (t: string) => db().doc(`tenants/${t}/meta/auditHead`),
}

/** Client-chosen document ids are accepted only in this shape. */
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
