import { getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'

// Public web config (safe to ship). Secrets never use the VITE_ prefix.
const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Boolean(cfg.apiKey && cfg.projectId)

export const auth = firebaseConfigured ? getAuth(getApps()[0] ?? initializeApp(cfg)) : null

const emulator = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL
if (auth && emulator) connectAuthEmulator(auth, emulator, { disableWarnings: true })
