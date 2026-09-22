import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useStore } from '../lib/store'
import { Icon } from './Icon'

/** Top-bar account control: Sign in, or the signed-in user's initial with Sign out. */
export function AccountButton() {
  const { user, ready, available, signIn, signOut, error } = useAuth()
  const { notify } = useStore()
  const [open, setOpen] = useState(false)
  useEffect(() => { if (error) notify(error) }, [error, notify])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target && !target.closest('.account')) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

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
