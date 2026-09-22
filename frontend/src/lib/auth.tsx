import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  GoogleAuthProvider, TotpMultiFactorGenerator, getMultiFactorResolver, multiFactor,
  onAuthStateChanged, signInWithPopup, signOut as fbSignOut,
} from 'firebase/auth'
import type { MultiFactorResolver, TotpSecret, User } from 'firebase/auth'
import { auth } from './firebase'

/* Dialog states for two-step sign-in (TOTP authenticator apps). */
export type MfaStep =
  | { kind: 'verify'; resolver: MultiFactorResolver }
  | { kind: 'enroll'; secret: TotpSecret; qrUrl: string }
  | { kind: 'reauth' }
  | null

interface AuthState {
  user: User | null
  ready: boolean
  available: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  mfa: MfaStep
  setMfa: (s: MfaStep) => void
  startEnrollment: () => Promise<void>
  submitCode: (code: string) => Promise<void>
  error: string
}

const Ctx = createContext<AuthState | null>(null)

const friendly = (err: unknown) => {
  const code = (err as { code?: string }).code ?? ''
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return ''
  if (code === 'auth/invalid-verification-code') return 'That code did not match. Check your authenticator app and try again.'
  if (code === 'auth/requires-recent-login') return 'For your security, sign in again first.'
  if (code === 'auth/operation-not-allowed') return 'Two-step sign-in with an authenticator app is not enabled for this project yet.'
  if (code === 'auth/unauthorized-domain') return 'This web address is not authorized for sign-in yet.'
  return 'Sign-in did not complete. Try again.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(!auth)
  const [mfa, setMfa] = useState<MfaStep>(null)
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
      setMfa(null)
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/multi-factor-auth-required') {
        setMfa({ kind: 'verify', resolver: getMultiFactorResolver(auth, err as Parameters<typeof getMultiFactorResolver>[1]) })
        return
      }
      setError(friendly(err))
    }
  }, [])

  const signOut = useCallback(async () => { if (auth) await fbSignOut(auth) }, [])

  const startEnrollment = useCallback(async () => {
    const u = auth?.currentUser
    if (!u) return
    setError('')
    try {
      const session = await multiFactor(u).getSession()
      const secret = await TotpMultiFactorGenerator.generateSecret(session)
      setMfa({ kind: 'enroll', secret, qrUrl: secret.generateQrCodeUrl(u.email ?? 'account', 'Clarity Workspace') })
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/requires-recent-login') { setMfa({ kind: 'reauth' }); return }
      setError(friendly(err))
    }
  }, [])

  const submitCode = useCallback(async (code: string) => {
    if (!auth || !mfa) return
    setError('')
    try {
      if (mfa.kind === 'verify') {
        const hint = mfa.resolver.hints.find(h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID)
        if (!hint) { setError('This account uses a second factor this app does not support yet.'); return }
        await mfa.resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code))
        setMfa(null)
      } else if (mfa.kind === 'enroll' && auth.currentUser) {
        await multiFactor(auth.currentUser).enroll(TotpMultiFactorGenerator.assertionForEnrollment(mfa.secret, code), 'Authenticator app')
        // The current session predates the second factor; a fresh two-step sign-in is needed.
        await fbSignOut(auth)
        setMfa({ kind: 'reauth' })
      }
    } catch (err) {
      setError(friendly(err))
    }
  }, [mfa])

  const value = useMemo<AuthState>(() => ({
    user, ready, available: !!auth, signIn, signOut, mfa, setMfa, startEnrollment, submitCode, error,
  }), [user, ready, signIn, signOut, mfa, startEnrollment, submitCode, error])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
