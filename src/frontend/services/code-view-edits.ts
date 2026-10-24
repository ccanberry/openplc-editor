/**
 * Text typed in a variables code view (a POU's or a GVL's) that has not reached the project yet.
 *
 * A code view writes into the project only when it is parsed: on a click outside it, or when it
 * switches back to the table. Until then the project -- and everything that compares it, like the
 * Build button lit for "changed since login" -- looks unchanged although the program on screen is
 * not what the PLC runs. Each code view reports here whether it holds such text.
 */
import { useSyncExternalStore } from 'react'

const pending = new Set<string>()
const listeners = new Set<() => void>()

/** `key` names the code view (its editor); `isPending` whether it holds text not yet parsed. */
export function setCodeViewPending(key: string, isPending: boolean): void {
  if (pending.has(key) === isPending) return
  if (isPending) pending.add(key)
  else pending.delete(key)
  listeners.forEach((l) => l())
}

export function hasCodeViewPending(): boolean {
  return pending.size > 0
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** True while any code view holds text that has not been parsed into the project. */
export function useCodeViewPending(): boolean {
  return useSyncExternalStore(subscribe, hasCodeViewPending, hasCodeViewPending)
}
