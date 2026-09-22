import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from './firebase'

/* Google sign-in only. There is no second factor. */
interface AuthState {
  user: User | null
  ready: boolean
  available: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  error: string
}

const Ctx = createContext<AuthState | null>(null)

const friendly = (err: unknown) => {
  const code = (err as { code?: string }).code ?? ''
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return ''
  if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.'
  if (code === 'auth/unauthorized-domain') return 'This web address is not authorized for sign-in yet.'
  return 'Sign-in did not complete. Try again.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(!auth)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, u => { setUser(u); setReady(true) })
  }, [])

  const signIn = useCallback(async () => {
    if (!auth) return
    setError('')
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (err) {
      setError(friendly(err))
    }
  }, [])

  const signOut = useCallback(async () => { if (auth) await fbSignOut(auth) }, [])

  const value = useMemo<AuthState>(() => ({ user, ready, available: !!auth, signIn, signOut, error }), [user, ready, signIn, signOut, error])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
