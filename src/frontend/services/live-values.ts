/**
 * Live values: the `= value` shown after each variable in the code while logged in, and how often
 * the PLC is asked for them. Switched in the run-control strip, the period set in File > Settings;
 * kept per user, like Follow.
 *
 *   on      default true. Off, the code shows no values and they are not read; hover, the watch
 *           list, forced and graphed variables are read as before.
 *   period  seconds between reads over TCP, 0.1 to 1.0 in steps of 0.1; default 1.0.
 */
import { useSyncExternalStore } from 'react'

const KEY_ON = 'oplc.debug.live-values'
const KEY_PERIOD = 'oplc.debug.live-period'

export const LIVE_PERIOD_MIN = 0.1
export const LIVE_PERIOD_MAX = 1.0
export const LIVE_PERIOD_DEFAULT = 1.0

/** Clamp to 0.1..1.0 and one decimal; anything unreadable is the default. */
export function normalizeLivePeriod(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  if (!isFinite(n)) return LIVE_PERIOD_DEFAULT
  return Math.round(Math.min(LIVE_PERIOD_MAX, Math.max(LIVE_PERIOD_MIN, n)) * 10) / 10
}

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
    // no storage: the defaults apply next time
  }
}

let on = read(KEY_ON) !== 'off'
let period = normalizeLivePeriod(read(KEY_PERIOD) ?? LIVE_PERIOD_DEFAULT)
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function isLiveValuesOn(): boolean {
  return on
}
export function setLiveValuesOn(value: boolean): void {
  on = value
  write(KEY_ON, value ? 'on' : 'off')
  notify()
}
export function getLivePeriod(): number {
  return period
}
export function setLivePeriod(value: unknown): number {
  period = normalizeLivePeriod(value)
  write(KEY_PERIOD, String(period))
  notify()
  return period
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
export function useLiveValuesOn(): boolean {
  return useSyncExternalStore(subscribe, isLiveValuesOn)
}
export function useLivePeriod(): number {
  return useSyncExternalStore(subscribe, getLivePeriod)
}
