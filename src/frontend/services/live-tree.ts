/**
 * Which complex variables (arrays, FB instances) are open in the live-value trees of the variable
 * tables. Collapsed by default; what the operator opens stays open for this session, also while
 * another tab is shown and when the table is opened again.
 */
import { useSyncExternalStore } from 'react'

const expanded = new Set<string>()
const listeners = new Set<() => void>()
let version = 0

export function isLiveTreeExpanded(path: string): boolean {
  return expanded.has(path)
}

export function toggleLiveTree(path: string): void {
  if (expanded.has(path)) expanded.delete(path)
  else expanded.add(path)
  version++
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getVersion = () => version

/** Whether `path` is open; re-renders when any node opens or closes. */
export function useLiveTreeExpanded(path: string): boolean {
  useSyncExternalStore(subscribe, getVersion, getVersion)
  return expanded.has(path)
}
