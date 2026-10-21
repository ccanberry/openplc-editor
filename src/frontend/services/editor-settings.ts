/**
 * Editor settings kept per user (File > Settings), not in the project.
 *
 *   devMode   default off. On, the board password used for a connection is kept, encrypted for
 *             this OS user (the main process, Electron safeStorage), and Connect / Login reuse it
 *             without asking. Off, every kept password is deleted.
 */
import { useSyncExternalStore } from 'react'

const KEY_DEV_MODE = 'oplc.settings.dev-mode'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // no storage: the default (off) applies next time
  }
}

let devMode = read(KEY_DEV_MODE) === 'on'
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function isDevMode(): boolean {
  return devMode
}

/** Switch dev mode; `forget` runs when it goes off (deletes the kept board passwords). */
export function setDevMode(value: boolean, forget?: () => unknown): void {
  devMode = value
  write(KEY_DEV_MODE, value ? 'on' : 'off')
  if (!value) void forget?.()
  notify()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDevMode(): boolean {
  return useSyncExternalStore(subscribe, isDevMode, isDevMode)
}
