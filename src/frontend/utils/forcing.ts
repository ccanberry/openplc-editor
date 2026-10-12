/**
 * CODESYS-style forcing -- the pure part.
 *
 * Values are PREPARED where the variable is shown (ST inline value, LD contact, watch list,
 * the variable tables, a force list) and nothing reaches the PLC until Force values (F7) or
 * Write values (Ctrl+F7) sends every prepared value in one batch, applied by the PLC at one
 * scan boundary. Prepared values are keyed by debug-map path (`EMERGENCYOK`,
 * `INSTANCE0.MT_CLOCK.ET`): the one name every view and the PLC's forced list share.
 */
import type { DebugLeafInfo, DebugPreparedValue } from '../store/slices/workspace/types'

export type PreparedMode = 'force' | 'write'

export interface ResolvedVariable {
  path: string
  index: number
  type: string
}

/** path -> {index, type} over the map's leaves. */
export function indexLeavesByPath(leaves: Map<number, DebugLeafInfo>): Map<string, { index: number; type: string }> {
  const byPath = new Map<string, { index: number; type: string }>()
  for (const [index, leaf] of leaves) byPath.set(leaf.path, { index, type: leaf.type })
  return byPath
}

/**
 * A variable name as a person writes it -> its debug-map path. Accepts the map path itself
 * (`INSTANCE0.OC_PROBE`), a global (`EmergencyOk`), or a program's variable under the PROGRAM's
 * name (`PLC_PRG.oc_probe`, which the map files under the program's instance). Case-insensitive.
 */
export function resolveVariableName(
  name: string,
  byPath: Map<string, { index: number; type: string }>,
  instances: { name: string; program: string }[],
): ResolvedVariable | null {
  const upper = name.trim().toUpperCase()
  if (!upper) return null
  const direct = byPath.get(upper)
  if (direct) return { path: upper, ...direct }
  const dot = upper.search(/[.[]/)
  if (dot > 0) {
    const head = upper.slice(0, dot)
    const inst = instances.find((i) => i.program.toUpperCase() === head)
    if (inst) {
      const path = inst.name.toUpperCase() + upper.slice(dot)
      const hit = byPath.get(path)
      if (hit) return { path, ...hit }
    }
  }
  return null
}

/** A debug-map path as a person reads it: a program's instance shown as the program, and a
 *  global under its declared name when `globalNames` (upper case -> declared) knows it. */
export function displayNameForPath(
  path: string,
  instances: { name: string; program: string }[],
  globalNames?: Map<string, string>,
): string {
  const dot = path.search(/[.[]/)
  if (dot <= 0) return globalNames?.get(path) ?? path
  const head = path.slice(0, dot)
  const inst = instances.find((i) => i.name.toUpperCase() === head)
  if (inst) return inst.program + path.slice(dot)
  const g = globalNames?.get(head)
  return g ? g + path.slice(dot) : path
}

/** Upper-case name -> declared name of the resource's global variables. */
export function globalNameMap(globals: { name: string }[]): Map<string, string> {
  return new Map(globals.map((g) => [g.name.toUpperCase(), g.name]))
}

/** Every name a force list can offer, for completion (hidden library internals left out). */
export function forceableNames(
  leaves: Map<number, DebugLeafInfo>,
  instances: { name: string; program: string }[],
  globalNames?: Map<string, string>,
): string[] {
  const names: string[] = []
  for (const leaf of leaves.values()) if (!leaf.hidden) names.push(displayNameForPath(leaf.path, instances, globalNames))
  return names.sort((a, b) => a.localeCompare(b))
}

const isTrueText = (v: string): boolean => {
  const t = v.trim().toUpperCase()
  return t === 'TRUE' || t === '1'
}

/** The BOOL cycle of a click on a value: none -> TRUE -> FALSE -> none (a prepared release -> TRUE). */
export function nextBoolPreparation(current: DebugPreparedValue | undefined): 'TRUE' | 'FALSE' | undefined {
  if (!current || current.value === null) return 'TRUE'
  return isTrueText(current.value) ? 'FALSE' : undefined
}

/** How a prepared value is shown next to the live one: `<TRUE>`, `<17039>`, `<release>`. */
export function preparedLabel(entry: DebugPreparedValue | undefined): string {
  if (!entry) return ''
  if (entry.value === null) return '<release>'
  if (entry.type.toUpperCase() === 'BOOL') return isTrueText(entry.value) ? '<TRUE>' : '<FALSE>'
  return `<${entry.value}>`
}

export interface PlannedItem {
  path: string
  index: number
  op: 'write' | 'force' | 'unforce'
  value?: Uint8Array
}

/**
 * Prepared values -> PLC batches of at most `max`. Force (F7) forces the values and releases
 * the prepared releases; Write (Ctrl+F7) writes the values once and leaves releases prepared.
 * `encode` turns a value into its bytes and throws on a value the type cannot hold.
 */
export function planBatches(
  prepared: Map<string, DebugPreparedValue>,
  mode: PreparedMode,
  encode: (value: string, type: string) => Uint8Array,
  max: number,
): { batches: PlannedItem[][]; used: string[]; errors: string[] } {
  const items: PlannedItem[] = []
  const used: string[] = []
  const errors: string[] = []
  for (const [path, entry] of prepared) {
    if (entry.value === null) {
      if (mode === 'force') {
        items.push({ path, index: entry.index, op: 'unforce' })
        used.push(path)
      }
      continue
    }
    try {
      items.push({ path, index: entry.index, op: mode, value: encode(entry.value, entry.type) })
      used.push(path)
    } catch (err) {
      errors.push(`${path}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  const batches: PlannedItem[][] = []
  for (let i = 0; i < items.length; i += max) batches.push(items.slice(i, i + max))
  return { batches, used, errors }
}

/**
 * The PLC's forced list (path -> value) -> the editor's forced marks (composite key -> TRUE-ish),
 * for every key that names a forced leaf: the LD/FBD colours, the watch tree and the ST hover
 * all read those.
 */
export function forcedMarksFromPlc(
  plcForces: Map<string, string>,
  byPath: Map<string, { index: number; type: string }>,
  indexes: Map<string, number>,
): Map<string, boolean> {
  const forcedIndex = new Map<number, boolean>()
  for (const [path, value] of plcForces) {
    const leaf = byPath.get(path)
    if (!leaf) continue
    const t = value.trim().toUpperCase()
    forcedIndex.set(leaf.index, !(t === 'FALSE' || Number(t) === 0))
  }
  const marks = new Map<string, boolean>()
  for (const [key, index] of indexes) {
    const v = forcedIndex.get(index)
    if (v !== undefined) marks.set(key, v)
  }
  return marks
}

/** Same marks as before? (avoid a store write -- and a re-render of every view -- each second). */
export function sameMarks(a: Map<string, boolean>, b: Map<string, boolean>): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k) !== v) return false
  return true
}

/** Same PLC force list as before? */
export function sameForces(a: Map<string, string> | null, b: Map<string, string> | null): boolean {
  if (a === null || b === null) return a === b
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k) !== v) return false
  return true
}
