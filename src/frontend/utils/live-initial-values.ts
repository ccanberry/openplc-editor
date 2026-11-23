/**
 * LIVE VALUES -> INITIAL VALUES (RoboPLC Suite 1.16.0). While logged in, the global variables'
 * live values can become their initial values in the project: a machine tuned on site then gives
 * its values to a clean upload or to the next machine built from the project.
 *
 * These are the pure parts: which globals can take a live value and through which debug-map
 * leaves, the exact IEC literal of a leaf's bytes (the debugger's display rounds a REAL to six
 * decimals and a TIME to two parts, neither fit to be stored), the initial value composed from
 * them, and whether it differs from the one the project has.
 *
 * Taken: unlocated globals of an elementary type, and one-dimensional arrays of one. Never: a
 * located variable (its value is the I/O's), a RETAIN PERSISTENT one, a function block instance or
 * a structure (an initial value cannot hold them), a multi-dimensional array.
 */
import type { PLCVariable } from '../../middleware/shared/ports/types'
import { lookupBaseType } from './iec-types-registry'
import { getTypeSizeByName, parseValueByTypeName } from './variable-sizes'

/** The debugger caps a string's bytes at this (variable-sizes DEBUG_STRING_CAP). */
const STRING_CAP = 126

export type LiveLeaf = { path: string; index: number; type: string }

export type LiveTarget = {
  name: string
  retain: boolean
  /** scalar: one leaf; array: one leaf per element, in index order */
  kind: 'scalar' | 'array'
  leaves: LiveLeaf[]
  /** the project's initial value now ('' when it has none) */
  current: string
}

export type LiveSkip = { name: string; why: string }

/** `T#` with every part, exact to the nanosecond (`T#1m30s500ms`, `T#0s`). */
export function formatTimeExact(totalNs: bigint): string {
  const neg = totalNs < 0n
  let ns = neg ? -totalNs : totalNs
  const units: [bigint, string][] = [
    [86_400_000_000_000n, 'd'],
    [3_600_000_000_000n, 'h'],
    [60_000_000_000n, 'm'],
    [1_000_000_000n, 's'],
    [1_000_000n, 'ms'],
    [1_000n, 'us'],
    [1n, 'ns'],
  ]
  let out = ''
  for (const [size, unit] of units) {
    const n = ns / size
    ns = ns % size
    if (n > 0n) out += `${n.toString()}${unit}`
  }
  return `T#${neg ? '-' : ''}${out || '0s'}`
}

/** A float's shortest decimal at its own precision (float32: 7 digits, float64: 15). */
function floatLiteral(v: number, digits: number): string | null {
  if (!Number.isFinite(v)) return null
  return String(Number(v.toPrecision(digits)))
}

function stringLiteral(s: string, quote: "'" | '"'): string {
  // IEC escapes: $$ for a dollar, $' / $" for the quote (function replacers: no `$'` patterns)
  return quote + s.replace(/[$'"]/g, (c) => (c === '$' || c === quote ? `$${c}` : c)) + quote
}

/**
 * The exact IEC literal of one leaf's value at `offset`, and the bytes it takes. `literal` is null
 * when the value cannot be stored exactly (a NaN, a string longer than the debugger sends, a type
 * this does not know).
 */
export function exactLiteral(
  data: Uint8Array,
  offset: number,
  typeName: string,
): { literal: string | null; bytesRead: number } {
  const meta = lookupBaseType(typeName)
  if (!meta) return { literal: null, bytesRead: getTypeSizeByName(typeName) }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  switch (meta.wireFormat) {
    case 'float32':
      return { literal: floatLiteral(view.getFloat32(offset, true), 7), bytesRead: 4 }
    case 'float64':
      return { literal: floatLiteral(view.getFloat64(offset, true), 15), bytesRead: 8 }
    case 'duration-ns-i64':
      return { literal: formatTimeExact(view.getBigInt64(offset, true)), bytesRead: 8 }
    case 'len8-utf8': {
      const len = data[offset]
      const text = new TextDecoder('utf-8').decode(data.slice(offset + 1, offset + 1 + Math.min(len, STRING_CAP)))
      return { literal: len > STRING_CAP ? null : stringLiteral(text, "'"), bytesRead: 1 + STRING_CAP }
    }
    case 'len8-utf16le': {
      const len = data[offset]
      const units: number[] = []
      for (let i = 0; i < Math.min(len, STRING_CAP); i++) units.push(view.getUint16(offset + 1 + i * 2, true))
      const text = String.fromCharCode(...units)
      return { literal: len > STRING_CAP ? null : stringLiteral(text, '"'), bytesRead: 1 + STRING_CAP * 2 }
    }
    default: {
      // BOOL (TRUE/FALSE), the integers, D#, DT#, TOD#: the display is already exact
      const { value, bytesRead } = parseValueByTypeName(data, offset, typeName)
      return { literal: value, bytesRead }
    }
  }
}

/** `1..4` -> [1, 2, 3, 4]; null for anything else. */
function range(dimension: string): number[] | null {
  const m = /^\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*$/.exec(dimension)
  if (!m) return null
  const lo = parseInt(m[1], 10)
  const hi = parseInt(m[2], 10)
  if (hi < lo) return null
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
}

/**
 * Which globals can take a live value, through which leaves of the running program's debug map
 * (`byPath`: upper-case path -> index and type), and which cannot (with the reason).
 */
export function liveTargets(
  globals: PLCVariable[],
  byPath: Map<string, { index: number; type: string }>,
): { targets: LiveTarget[]; skipped: LiveSkip[] } {
  const targets: LiveTarget[] = []
  const skipped: LiveSkip[] = []
  for (const v of globals) {
    if (!v.name) continue
    if (v.persistent) continue // RETAIN PERSISTENT: never offered
    if (v.location) continue // located: its value is the I/O's
    const current = v.initialValue ?? ''
    const retain = !!v.retain
    const key = v.name.toUpperCase()
    if (v.type.definition === 'base-type') {
      const leaf = byPath.get(key)
      if (!leaf) skipped.push({ name: v.name, why: 'not in the running program' })
      else targets.push({ name: v.name, retain, kind: 'scalar', leaves: [{ path: key, ...leaf }], current })
      continue
    }
    if (v.type.definition === 'array') {
      const data = v.type.data
      if (!data || data.baseType.definition !== 'base-type') {
        skipped.push({ name: v.name, why: 'an array of function blocks or structures' })
        continue
      }
      const idx = data.dimensions.length === 1 ? range(data.dimensions[0].dimension) : null
      if (!idx) {
        skipped.push({ name: v.name, why: 'a multi-dimensional array' })
        continue
      }
      const leaves: LiveLeaf[] = []
      for (const i of idx) {
        const path = `${key}[${i}]`
        const leaf = byPath.get(path)
        if (!leaf) break
        leaves.push({ path, ...leaf })
      }
      if (leaves.length !== idx.length) skipped.push({ name: v.name, why: 'not in the running program' })
      else targets.push({ name: v.name, retain, kind: 'array', leaves, current })
      continue
    }
    skipped.push({ name: v.name, why: 'a function block instance or a structure' })
  }
  return { targets, skipped }
}

/** The initial value from the leaves' literals: the literal, or `[a, b, c]` for an array. */
export function composeInitial(target: LiveTarget, literals: string[]): string {
  return target.kind === 'scalar' ? literals[0] : `[${literals.join(', ')}]`
}

/** A literal that is its type's default (an absent initial value means that). */
function isDefault(token: string): boolean {
  const t = token.trim().toUpperCase()
  if (t === '' || t === 'FALSE' || t === "''" || t === '""') return true
  if (/^T#-?0+(S|MS)?$/.test(t)) return true
  return /^[-+]?[\d.]+(E[-+]?\d+)?$/.test(t) && Number(t) === 0
}

function tokens(value: string): string[] {
  const v = value.trim()
  const inner = v.startsWith('[') && v.endsWith(']') ? v.slice(1, -1) : v
  return inner === '' ? [] : inner.split(',').map((s) => s.trim())
}

function sameToken(a: string, b: string): boolean {
  if (isDefault(a) && isDefault(b)) return true
  const na = Number(a)
  const nb = Number(b)
  if (a !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na === nb
  return a.trim().toUpperCase() === b.trim().toUpperCase()
}

/** True when `live` is what `current` already says (an absent value = every element its default). */
export function sameInitial(current: string, live: string, elements: number): boolean {
  const a = tokens(current)
  const b = tokens(live)
  const n = Math.max(elements, a.length, b.length)
  for (let i = 0; i < n; i++) if (!sameToken(a[i] ?? '', b[i] ?? '')) return false
  return true
}
