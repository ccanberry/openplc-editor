/**
 * THE WATCH LIST (CODESYS): the variables the debugger panel shows, typed in by name while logged
 * in -- `PLC_PRG.X`, `MIXING_HEAD.Valves[2]`, a global's name. It replaces marking variables with
 * a Debug flag in the declarations. Kept per project on this PC (by the project's path); entries
 * are debug composite keys (`POU:path`), the form the debugger reads.
 */
import { useSyncExternalStore } from 'react'

const PREFIX = 'oplc.debug.watch:'

let projectKey = ''
let list: string[] = []
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function load(key: string): string[] {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
function save(): void {
  try {
    localStorage.setItem(PREFIX + projectKey, JSON.stringify(list))
  } catch {
    // no storage: the list lasts for this session
  }
}

/** The project the list belongs to (its path); switching loads that project's list. */
export function setWatchProject(key: string): void {
  if (key === projectKey) return
  projectKey = key
  list = load(key)
  notify()
}
export function getWatchList(): string[] {
  return list
}
export function addWatch(compositeKey: string): void {
  if (list.includes(compositeKey)) return
  list = [...list, compositeKey]
  save()
  notify()
}
export function removeWatch(compositeKey: string): void {
  list = list.filter((k) => k !== compositeKey)
  save()
  notify()
}
function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
export function useWatchList(): string[] {
  return useSyncExternalStore(subscribe, getWatchList)
}

/** `POU:path` -> `POU.path`, how a name is typed and shown. */
export function watchDisplay(compositeKey: string): string {
  const i = compositeKey.indexOf(':')
  return i < 0 ? compositeKey : `${compositeKey.slice(0, i)}.${compositeKey.slice(i + 1)}`
}

/**
 * What was typed -> the composite key it names, among `keys` (every variable the program has),
 * or null. Case does not matter. `POU.path` or `POU:path` names that POU's variable; a bare name
 * (`MixerSpeed`, `TON0.Q`) is whichever POU has it -- a global is the same variable under every
 * POU that declares it external.
 */
export function resolveWatch(text: string, keys: Iterable<string>): string | null {
  const t = text.trim().replace(/\s+/g, '')
  if (!t) return null
  const byLower = new Map<string, string>()
  for (const k of keys) {
    const lower = k.toLowerCase()
    if (!byLower.has(lower)) byLower.set(lower, k)
  }
  const lower = t.toLowerCase()
  if (lower.includes(':')) return byLower.get(lower) ?? null
  const dot = lower.search(/[.[]/)
  if (dot > 0 && lower[dot] === '.') {
    const scoped = byLower.get(`${lower.slice(0, dot)}:${lower.slice(dot + 1)}`)
    if (scoped) return scoped
  }
  const matches: string[] = []
  for (const [l, k] of byLower) if (l.slice(l.indexOf(':') + 1) === lower) matches.push(k)
  matches.sort()
  return matches[0] ?? null
}

/** Up to `max` suggestions for what is being typed, shown as `POU.path`. */
export function suggestWatch(text: string, keys: Iterable<string>, max = 50): string[] {
  const t = text.trim().toLowerCase()
  if (t.length < 2) return []
  const out: string[] = []
  for (const k of keys) {
    const shown = watchDisplay(k)
    if (shown.toLowerCase().includes(t)) {
      out.push(shown)
      if (out.length >= max) break
    }
  }
  return out
}
