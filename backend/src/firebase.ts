import { getApps, initializeApp } from 'firebase-admin/app'
import type { App } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'
import { config } from './config.js'

// Admin SDK with Application Default Credentials. FIRESTORE_EMULATOR_HOST and
// FIREBASE_AUTH_EMULATOR_HOST are honoured automatically for local runs.
export function adminApp(): App {
  return getApps()[0] ?? initializeApp({ projectId: config.firebaseProjectId })
}

let firestore: Firestore | null = null
export function db(): Firestore {
  if (!firestore) {
    firestore = config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)'
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
  userCol: (t: string, u: string, name: 'sources' | 'transformations' | 'tasks' | 'meetings' | 'calendarBlocks' | 'notifications' | 'secrets') => db().collection(`tenants/${t}/users/${u}/${name}`),
  guideFields: (t: string, u: string) => db().collection(`tenants/${t}/guides/${u}/fields`),
  guideSnapshots: (t: string, u: string) => db().collection(`tenants/${t}/guides/${u}/snapshots`),
  knowledge: (t: string) => db().collection(`tenants/${t}/knowledge`),
  audit: (t: string) => db().collection(`tenants/${t}/audit`),
  auditHead: (t: string) => db().doc(`tenants/${t}/meta/auditHead`),
}

/** Client-chosen document ids are accepted only in this shape. */
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
