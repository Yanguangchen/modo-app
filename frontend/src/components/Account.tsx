import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import QRCode from 'qrcode'
import { useAuth } from '../lib/auth'
import { Icon } from './Icon'
import { Modal } from './ui'

/** Top-bar account control: Sign in, or the signed-in user's initial with Sign out. */
export function AccountButton() {
  const { user, ready, available, signIn, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  if (!available || !ready) return null
  if (!user) {
    return (
      <button type="button" className="btn btn-sm" onClick={() => void signIn()}>
        <Icon name="user" size={16} />Sign in
      </button>
    )
  }
  const initial = (user.displayName ?? user.email ?? '?').trim().charAt(0).toUpperCase()
  return (
    <div className="account">
      <button type="button" className="account-chip" aria-expanded={open} aria-label={`Account: ${user.email ?? ''}`} onClick={() => setOpen(o => !o)}>
        {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span>{initial}</span>}
      </button>
      {open && (
        <div className="account-menu glass glass-strong fade" role="menu">
          <div className="account-who"><strong>{user.displayName ?? 'Signed in'}</strong><span className="faint">{user.email}</span></div>
          <button type="button" role="menuitem" className="btn btn-quiet btn-sm" onClick={() => { setOpen(false); void signOut() }}>
            <Icon name="arrowRight" size={16} />Sign out
          </button>
        </div>
      )}
    </div>
  )
}

/** Two-step sign-in: verify a code, or set up an authenticator app. */
export function MfaDialog() {
  const { mfa, setMfa, submitCode, signIn, error } = useAuth()
  const [code, setCode] = useState('')
  const [qr, setQr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setCode('')
    if (mfa?.kind === 'enroll') QRCode.toDataURL(mfa.qrUrl, { margin: 1, width: 200 }).then(setQr, () => setQr(''))
  }, [mfa])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (code.length !== 6) return
    setBusy(true)
    await submitCode(code)
    setBusy(false)
  }

  const title = mfa?.kind === 'enroll' ? 'Set up two-step sign-in' : mfa?.kind === 'reauth' ? 'Sign in again' : 'Enter your code'

  return (
    <Modal open={!!mfa} onClose={() => setMfa(null)} title={title}>
      {mfa?.kind === 'reauth' ? (
        <div className="stack">
          <p className="muted small">Sign in once more with Google and your authenticator code to finish.</p>
          <div className="modal-foot">
            <button type="button" className="btn btn-primary" onClick={() => void signIn()}><Icon name="user" size={18} />Sign in with Google</button>
          </div>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          {mfa?.kind === 'enroll' && (
            <div className="mfa-setup">
              {qr ? <img src={qr} alt="QR code for your authenticator app" width={180} height={180} /> : null}
              <div className="stack-sm">
                <p className="small"><strong>1.</strong> Scan with an authenticator app.</p>
                <p className="small"><strong>2.</strong> Or enter this key:</p>
                <code className="mfa-key">{mfa.secret.secretKey}</code>
                <p className="small"><strong>3.</strong> Type the 6-digit code it shows.</p>
              </div>
            </div>
          )}
          <div className="field">
            <label htmlFor="mfa-code">6-digit code</label>
            <input
              id="mfa-code" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus
              maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              className="mfa-input"
            />
          </div>
          {error && <p className="small" role="alert" style={{ color: 'var(--warn)' }}>{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn btn-quiet" onClick={() => setMfa(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={code.length !== 6 || busy}><Icon name="lock" size={18} />{mfa?.kind === 'enroll' ? 'Turn on' : 'Verify'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
