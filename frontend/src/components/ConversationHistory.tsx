import { useState } from 'react'
import { Modal } from './ui'

export interface ConversationSummary { id: string; title: string; savedAt: string }

export function ConversationHistory({ items, onSelect, disabled }: {
  items: ConversationSummary[]; onSelect: (id: string) => void; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(true)} disabled={disabled}>History ({items.length})</button>
    <Modal open={open} onClose={() => setOpen(false)} title="Conversation history">
      <p className="muted small">Conversations are kept on this device, not synced to your account.</p>
      {items.length ? <ul className="conversation-history">{items.map(item => <li key={item.id}>
        <button type="button" className="btn" onClick={() => { onSelect(item.id); setOpen(false) }}><span>{item.title}</span><small>{new Date(item.savedAt).toLocaleString()}</small></button>
      </li>)}</ul> : <p>No earlier conversations yet. Starting a new conversation saves the current one here.</p>}
    </Modal>
  </>
}
