/**
 * Auto-publish register allocator.
 *
 * Assigns every `publish`-flagged project global a `%QW` holding
 * register (16-bit types) or a pair of consecutive registers (32-bit
 * types, low word first — RoboCNC convention) inside a reserved
 * window starting at `HMI_PUBLISH_WINDOW_BASE`.
 *
 * Mirrors the IEC address registry's two-pass allocation model
 * (`iec-address/registry/allocate.ts`, consumer kind `hmi-publish`):
 *   1. Reserve pinned registers — a user-typed literal `%QW` location
 *      first (explicit intent, honoured verbatim), then the
 *      assignments persisted from the previous run (stability).
 *   2. Allocate the rest at the lowest free run of registers at or
 *      above the window base.
 *
 * The pair concept (two consecutive registers per channel) and the
 * window base are publish-specific, so this allocator owns its linear
 * scan and reuses the registry's address parsing. Determinism and
 * idempotency are the contract:
 *
 *   - Same variables + same stored assignments → same output.
 *   - `allocate(vars, allocate(vars, stored).assignments)` is a
 *     fixed point, so feeding the persisted map back never moves
 *     anything.
 *   - Deleting a variable never renumbers the others: their persisted
 *     assignments re-enter as pins. Freed registers may be reused by
 *     NEW variables (HMIs bind by name + MD5, so reuse is safe).
 */

import { parseAddress } from '../iec-address/registry'
import type {
  HmiPublishAccess,
  HmiPublishAllocation,
  HmiPublishKind,
  HmiPublishPoint,
  HmiPublishVariable,
} from './types'

/**
 * First holding register of the reserved publish window. High on
 * purpose: hardware windows claim low `%QW` space (robocard claims
 * `%QW100+`), so auto-assigned publish registers can never collide
 * with them. Change only in lockstep with `docs/AUTO_PUBLISH.md`.
 */
export const HMI_PUBLISH_WINDOW_BASE = 512

/** Group label used when a variable carries no `group`. */
export const HMI_PUBLISH_DEFAULT_GROUP = 'Global'

/** 16-bit-or-narrower base types: one `%QW` each, located directly on
 *  the global (`AT %QWn`) → naturally read-write over Modbus. BOOL
 *  deliberately takes a whole register (value 0/1) — simplest layout,
 *  and it keeps every point word-addressable for HMIs. */
const WORD_TYPES = new Set(['BOOL', 'BYTE', 'SINT', 'USINT', 'INT', 'UINT', 'WORD'])

/** 32-bit base types: two consecutive registers, low word first,
 *  packed bit-exact by the synthetic glue POU → read-only in v1. */
const PAIR_TYPES = new Set(['REAL', 'DINT', 'DWORD', 'UDINT'])

export interface HmiPublishTypeClass {
  kind: HmiPublishKind
  access: HmiPublishAccess
  /** Registers occupied (1 for `word`, 2 for `pair-lo-first`). */
  width: number
}

/**
 * Classify a variable type for publishing. `null` = unsupported
 * (LREAL / LINT / LWORD / ULINT / STRING / arrays / user types —
 * callers turn that into a compile error).
 */
export function classifyPublishType(type: HmiPublishVariable['type']): HmiPublishTypeClass | null {
  if (type.definition !== 'base-type') return null
  const name = type.value.toUpperCase()
  if (WORD_TYPES.has(name)) return { kind: 'word', access: 'rw', width: 1 }
  if (PAIR_TYPES.has(name)) return { kind: 'pair-lo-first', access: 'ro', width: 2 }
  return null
}

/** Parse a literal `%QW<n>` address to its register number, or `null`. */
function parseQwRegister(location: string): number | null {
  const parsed = parseAddress(location)
  if (!parsed) return null
  if (parsed.cls.direction !== 'Q' || parsed.cls.size !== 'W') return null
  return parsed.linear
}

interface Candidate {
  variable: HmiPublishVariable
  cls: HmiPublishTypeClass
  /** Register pinned by a user-typed literal `%QW` location. */
  userPin: number | null
  /** Register pinned by the persisted assignment map. */
  storedPin: number | null
}

/**
 * Allocate publish registers for every `publish`-flagged variable in
 * `variables` (declaration order), honouring `storedAssignments`
 * (`name → %QW<n>`, from `project.json` `data.hmiPublish`) as pins.
 */
export function allocateHmiPublish(
  variables: readonly HmiPublishVariable[],
  storedAssignments: Record<string, string> = {},
  windowBase: number = HMI_PUBLISH_WINDOW_BASE,
): HmiPublishAllocation {
  const errors: string[] = []
  const warnings: string[] = []
  const published = variables.filter((v) => v.publish === true && v.name)

  // Pass 0 — classify and resolve pin sources. Unsupported types and
  // unusable manual locations are fatal: silently skipping a flagged
  // variable would leave the HMI binding to a register that is never
  // written.
  const candidates: Candidate[] = []
  for (const variable of published) {
    const cls = classifyPublishType(variable.type)
    if (!cls) {
      errors.push(
        `Published variable "${variable.name}": type ${variable.type.value.toUpperCase()} cannot be published. ` +
          `Supported: BOOL/BYTE/SINT/USINT/INT/UINT/WORD (one register) and REAL/DINT/DWORD/UDINT (register pair).`,
      )
      continue
    }
    const location = (variable.location ?? '').trim()
    let userPin: number | null = null
    if (location.length > 0) {
      userPin = parseQwRegister(location)
      if (userPin === null) {
        errors.push(
          `Published variable "${variable.name}": location "${location}" is not a literal %QW address. ` +
            `Published variables must be unlocated (auto-assigned) or pinned at a literal %QW register.`,
        )
        continue
      }
    }
    const stored = storedAssignments[variable.name]
    const storedPin = stored !== undefined ? parseQwRegister(stored) : null
    candidates.push({ variable, cls, userPin, storedPin })
  }
  if (errors.length > 0) {
    return { assignments: {}, points: [], errors, warnings, windowBase, windowCount: 0 }
  }

  const used = new Set<number>()
  const registerOf = new Map<string, number>()

  const rangeFree = (start: number, width: number): boolean => {
    for (let i = 0; i < width; i++) if (used.has(start + i)) return false
    return true
  }
  const claim = (start: number, width: number): void => {
    for (let i = 0; i < width; i++) used.add(start + i)
  }

  // Pass 1a — user-typed literal pins. Honoured verbatim even on
  // collision (mirrors the registry's pinned-conflict semantics:
  // report, don't silently move an explicit address).
  for (const c of candidates) {
    if (c.userPin === null) continue
    if (!rangeFree(c.userPin, c.cls.width)) {
      warnings.push(
        `Published variable "${c.variable.name}": pinned register %QW${c.userPin} overlaps another published register. ` +
          `The pin is honoured verbatim — resolve the overlap by moving one of the pinned variables.`,
      )
    }
    if (c.userPin < windowBase) {
      warnings.push(
        `Published variable "${c.variable.name}": pinned register %QW${c.userPin} is below the publish window base ` +
          `(%QW${windowBase}) and may collide with a hardware I/O window.`,
      )
    }
    claim(c.userPin, c.cls.width)
    registerOf.set(c.variable.name, c.userPin)
  }

  // Pass 1b — persisted assignments (the stability feedback loop). A
  // stored pin that no longer fits (its range now collides, e.g. the
  // variable's type grew to a pair) is dropped and the variable is
  // re-allocated in pass 2.
  for (const c of candidates) {
    if (c.userPin !== null || c.storedPin === null) continue
    if (!rangeFree(c.storedPin, c.cls.width)) {
      warnings.push(
        `Published variable "${c.variable.name}": persisted register %QW${c.storedPin} no longer fits and was reallocated.`,
      )
      continue
    }
    if (c.storedPin < windowBase) {
      warnings.push(
        `Published variable "${c.variable.name}": persisted register %QW${c.storedPin} is below the publish window base ` +
          `(%QW${windowBase}) and may collide with a hardware I/O window.`,
      )
    }
    claim(c.storedPin, c.cls.width)
    registerOf.set(c.variable.name, c.storedPin)
  }

  // Pass 2 — everything else: lowest free run at or above the base.
  for (const c of candidates) {
    if (registerOf.has(c.variable.name)) continue
    let start = windowBase
    while (!rangeFree(start, c.cls.width)) start++
    claim(start, c.cls.width)
    registerOf.set(c.variable.name, start)
  }

  const assignments: Record<string, string> = {}
  const points: HmiPublishPoint[] = []
  let windowEnd = windowBase // exclusive
  for (const c of candidates) {
    const register = registerOf.get(c.variable.name) as number
    assignments[c.variable.name] = `%QW${register}`
    const group = (c.variable.group ?? '').trim() || HMI_PUBLISH_DEFAULT_GROUP
    points.push({
      name: c.variable.name,
      group,
      register,
      type: c.variable.type.value.toUpperCase(),
      kind: c.cls.kind,
      access: c.cls.access,
      scale: null,
    })
    const end = register + c.cls.width
    if (register >= windowBase && end > windowEnd) windowEnd = end
  }

  return { assignments, points, errors, warnings, windowBase, windowCount: windowEnd - windowBase }
}
