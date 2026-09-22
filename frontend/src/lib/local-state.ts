import { useCallback, useSyncExternalStore } from 'react'
import type { Dispatch, SetStateAction } from 'react'

// Browser-only UI state. Keep the in-memory copy when storage is unavailable,
// and keep pending chat updates alive when their page is temporarily unmounted.
const entries = new Map<string, { value: unknown; listeners: Set<() => void> }>()
const failedKeys = new Set<string>()
const healthListeners = new Set<() => void>()
const subscribeHealth = (listener: () => void) => { healthListeners.add(listener); return () => { healthListeners.delete(listener) } }
const healthy = () => failedKeys.size === 0
export const useLocalStorageHealth = () => useSyncExternalStore(subscribeHealth, healthy)

export function useLocalState<T>(key: string, initial: T | (() => T), persist = true, restore?: (stored: T) => T): [T, Dispatch<SetStateAction<T>>] {
  if (!entries.has(key)) {
    let value = typeof initial === 'function' ? (initial as () => T)() : initial
    try {
      const raw = persist ? localStorage.getItem(key) : null
      if (raw !== null) value = JSON.parse(raw) as T
    } catch { /* fall back to the initial value */ }
    if (restore) value = restore(value)
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
    if (persist) {
      try { localStorage.setItem(key, JSON.stringify(entry.value)); failedKeys.delete(key) } catch { failedKeys.add(key) }
      healthListeners.forEach(listener => listener())
    }
    entry.listeners.forEach(listener => listener())
  }, [entry, key, persist])
  return [value, setValue]
}
