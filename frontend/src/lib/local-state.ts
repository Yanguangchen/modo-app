import { useCallback, useSyncExternalStore } from 'react'
import type { Dispatch, SetStateAction } from 'react'

// Browser-only UI state. Keep the in-memory copy when storage is unavailable,
// and keep pending chat updates alive when their page is temporarily unmounted.
const entries = new Map<string, { value: unknown; listeners: Set<() => void> }>()

export function useLocalState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  if (!entries.has(key)) {
    let value = typeof initial === 'function' ? (initial as () => T)() : initial
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) value = JSON.parse(raw) as T
    } catch { /* fall back to the initial value */ }
    entries.set(key, { value, listeners: new Set() })
  }
  const entry = entries.get(key)!
  const subscribe = useCallback((listener: () => void) => {
    entry.listeners.add(listener)
    return () => { entry.listeners.delete(listener) }
  }, [entry])
  const snapshot = useCallback(() => entry.value as T, [entry])
  const value = useSyncExternalStore(subscribe, snapshot)
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(next => {
    entry.value = typeof next === 'function' ? (next as (previous: T) => T)(entry.value as T) : next
    try { localStorage.setItem(key, JSON.stringify(entry.value)) } catch { /* retain in memory */ }
    entry.listeners.forEach(listener => listener())
  }, [entry, key])
  return [value, setValue]
}
