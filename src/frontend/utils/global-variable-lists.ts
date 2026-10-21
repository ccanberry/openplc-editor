import type { PLCVariable } from '../../middleware/shared/ports/types'
import { generateIecVariablesToString } from './generate-iec-variables-to-string'

/**
 * Global variable lists (CODESYS: GVL objects). Every resource global belongs to one GVL, named
 * by its `group` (absent = the default GVL). Each GVL is its own tree entry and editor tab, whose
 * code view is that GVL alone. The resource's `globalVariableLists` keeps the tree order and the
 * GVLs that hold no variable yet; the compile still sees one flat VAR_GLOBAL list (IEC: the
 * configuration's globals share one namespace, so a name is unique across every GVL).
 */

/** The GVL of a variable without a `group` (the HMI map's default group, HMI_PUBLISH_DEFAULT_GROUP). */
export const DEFAULT_GVL = 'Global'

/** A GVL tab's editor path; the GVL name follows it. */
export const GVL_TAB_PATH = '/data/configuration/resource/gvl/'

type ResourceGlobals = { globalVariables: PLCVariable[]; globalVariableLists?: string[] }

export const gvlOf = (variable: Pick<PLCVariable, 'group'>): string => (variable.group ?? '').trim() || DEFAULT_GVL

/** The `group` field that puts a variable in `gvl` (none for the default GVL). */
export const groupField = (gvl: string): { group?: string } => (gvl === DEFAULT_GVL ? {} : { group: gvl })

/** Every GVL in tree order: the stored list, then any GVL a variable names that the list lacks. */
export function gvlNames(resource: ResourceGlobals): string[] {
  const out: string[] = []
  const add = (name: string) => {
    const n = name.trim()
    if (n && !out.includes(n)) out.push(n)
  }
  ;(resource.globalVariableLists ?? []).forEach(add)
  resource.globalVariables.forEach((v) => add(gvlOf(v)))
  return out.length > 0 ? out : [DEFAULT_GVL]
}

/** The tab of a GVL: a name no POU can have, so a GVL `Alarms` and a program `ALARMS` never meet. */
export const gvlTabName = (gvl: string): string => `${gvl} (GVL)`

export const gvlTabPath = (gvl: string): string => `${GVL_TAB_PATH}${gvl}`

/** The GVL an editor path opens, or null. */
export const gvlFromPath = (path: string | undefined): string | null =>
  path?.startsWith(GVL_TAB_PATH) ? path.slice(GVL_TAB_PATH.length) : null

/** A GVL's code view: its VAR_GLOBAL / VAR_GLOBAL RETAIN / VAR_GLOBAL RETAIN PERSISTENT blocks. */
export const gvlToCode = (variables: PLCVariable[]): string =>
  variables.length > 0 ? generateIecVariablesToString(variables) : '  VAR_GLOBAL\n  END_VAR'

/** Why `name` cannot be a GVL name, or null. `current`: the GVL being renamed. */
export function gvlNameError(name: string, existing: string[], current?: string): string | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return 'A GVL name is an identifier: letters, digits and _.'
  const taken = existing.some((e) => e !== current && e.toUpperCase() === name.toUpperCase())
  return taken ? `There is a GVL ${name} already.` : null
}

/** A new GVL name that is not taken: NewGVL, NewGVL1, ... */
export function newGvlName(existing: string[]): string {
  const taken = new Set(existing.map((e) => e.toUpperCase()))
  let name = 'NewGVL'
  for (let i = 1; taken.has(name.toUpperCase()); i++) name = `NewGVL${i}`
  return name
}

export function renameGvl(resource: ResourceGlobals, from: string, to: string) {
  return {
    lists: gvlNames(resource).map((g) => (g === from ? to : g)),
    variables: resource.globalVariables.map((v) => {
      if (gvlOf(v) !== from) return v
      const { group: _group, ...rest } = v
      return { ...rest, ...groupField(to) }
    }),
  }
}

/** Delete a GVL with its variables. The last GVL stays (emptied): the tree always has one. */
export function deleteGvl(resource: ResourceGlobals, gvl: string) {
  const names = gvlNames(resource)
  return {
    lists: names.length > 1 ? names.filter((g) => g !== gvl) : names,
    variables: resource.globalVariables.filter((v) => gvlOf(v) !== gvl),
  }
}

/**
 * Put the variables parsed from a GVL's code view in place of that GVL's variables. They take
 * the position of its first variable (or go last), the GVL's group, and the publish flag a
 * variable of the same name had (the code cannot say it); RETAIN / PERSISTENT come from the code
 * blocks. A name another GVL declares is refused.
 */
export function mergeGvlCode(
  all: PLCVariable[],
  gvl: string,
  parsed: PLCVariable[],
): { ok: true; variables: PLCVariable[] } | { ok: false; message: string } {
  const others = new Map(all.filter((v) => gvlOf(v) !== gvl).map((v) => [v.name.toUpperCase(), gvlOf(v)]))
  const clashes = parsed.filter((v) => others.has(v.name.toUpperCase()))
  if (clashes.length > 0) {
    return {
      ok: false,
      message: clashes.map((v) => `${v.name} is declared in GVL ${others.get(v.name.toUpperCase())}`).join('; '),
    }
  }
  const previous = new Map(all.filter((v) => gvlOf(v) === gvl).map((v) => [v.name.toUpperCase(), v]))
  const mine = parsed.map((variable): PLCVariable => {
    const { group: _group, ...rest } = variable
    const before = previous.get(variable.name.toUpperCase())
    return {
      ...rest,
      ...(before?.publish !== undefined ? { publish: before.publish } : {}),
      ...groupField(gvl),
    }
  })
  const first = all.findIndex((v) => gvlOf(v) === gvl)
  const kept = all.filter((v) => gvlOf(v) !== gvl)
  const at = first < 0 ? kept.length : all.slice(0, first).filter((v) => gvlOf(v) !== gvl).length
  return { ok: true, variables: [...kept.slice(0, at), ...mine, ...kept.slice(at)] }
}

/** Index (in `all`) of the row a GVL row at `index` swaps with when moved by `delta` (±1), or null. */
export function neighbourInGvl(all: PLCVariable[], gvl: string, index: number, delta: number): number | null {
  for (let i = index + delta; i >= 0 && i < all.length; i += delta) {
    if (gvlOf(all[i]) === gvl) return i
  }
  return null
}

/** Index (in `all`) of a GVL's last row, or -1. */
export function lastInGvl(all: PLCVariable[], gvl: string): number {
  for (let i = all.length - 1; i >= 0; i--) if (gvlOf(all[i]) === gvl) return i
  return -1
}
