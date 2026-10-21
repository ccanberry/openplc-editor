/**
 * Editor settings kept per user (File > Settings), not in the project.
 *
 *   devMode              default off. On, the board password used for a connection is kept,
 *                        encrypted for this OS user (the main process, Electron safeStorage), and
 *                        Connect / Login reuse it without asking. Off, every kept password is deleted.
 *   verbose              default off. Off, the console shows the build's steps, warnings and
 *                        errors; the detail (each compiler command, plugin states, tool checks) is
 *                        kept as debug lines and shown when it is switched on.
 *   confirmOnlineChange  default on. Logged in, a build asks OK / Cancel / Go offline first.
 *   clearConsoleOnBuild  default off. Each build starts with an empty console.
 *
 * The live values' read period is a setting too (services/live-values).
 */
import { useSyncExternalStore } from 'react'

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
    // no storage: the default applies next time
  }
}

/** A boolean setting in localStorage ('on' / 'off'), readable outside React and as a hook. */
function booleanSetting(key: string, defaultValue: boolean) {
  const stored = read(key)
  let value = stored === null ? defaultValue : stored === 'on'
  const listeners = new Set<() => void>()
  const get = () => value
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  return {
    get,
    set: (next: boolean) => {
      value = next
      write(key, next ? 'on' : 'off')
      listeners.forEach((l) => l())
    },
    use: () => useSyncExternalStore(subscribe, get, get),
  }
}

const devMode = booleanSetting('oplc.settings.dev-mode', false)
const verbose = booleanSetting('oplc.settings.verbose', false)
const confirmOnlineChange = booleanSetting('oplc.settings.confirm-online-change', true)
const clearConsoleOnBuild = booleanSetting('oplc.settings.clear-console-on-build', false)

/** File > Settings asked for from the editor's own menu (the native one sends an accelerator). */
const openRequests = new Set<() => void>()
export function requestOpenSettings(): void {
  openRequests.forEach((l) => l())
}
export function onOpenSettingsRequest(listener: () => void): () => void {
  openRequests.add(listener)
  return () => openRequests.delete(listener)
}

export const isDevMode = devMode.get
export const useDevMode = devMode.use
/** Switch dev mode; `forget` runs when it goes off (deletes the kept board passwords). */
export function setDevMode(value: boolean, forget?: () => unknown): void {
  devMode.set(value)
  if (!value) void forget?.()
}

export const isVerbose = verbose.get
export const setVerbose = verbose.set
export const useVerbose = verbose.use

export const isConfirmOnlineChange = confirmOnlineChange.get
export const setConfirmOnlineChange = confirmOnlineChange.set
export const useConfirmOnlineChange = confirmOnlineChange.use

export const isClearConsoleOnBuild = clearConsoleOnBuild.get
export const setClearConsoleOnBuild = clearConsoleOnBuild.set
export const useClearConsoleOnBuild = clearConsoleOnBuild.use
