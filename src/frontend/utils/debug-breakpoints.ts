/**
 * Breakpoint ⇄ checkpoint-id resolution for the online debugger.
 *
 * The breakpoint gutter is source-line granular (one glyph per POU line),
 * but the runtime arms breakpoints by STruC++ checkpoint id (FC 0x46).  The
 * compiler's `checkpoint-map.json` (resolved to POU-local coordinates as
 * `DebugCheckpointEntry[]`) is the bridge: a line may carry several
 * statements → several ids, so a single gutter breakpoint can resolve to
 * more than one id, and every id on that line must be armed for the halt to
 * land where the user clicked.
 *
 * Pure functions only — no store, no IPC.  The store holds armed breakpoints
 * as composite `<pou>:<line>` keys; these helpers build and read those keys.
 */
import type { DebugCheckpointEntry } from '../../middleware/shared/ports/types'

/** Composite key for an armed breakpoint: `<pou>:<line>` (1-based line). */
export function breakpointKey(pou: string, line: number): string {
  return `${pou}:${line}`
}

/**
 * Split a composite key back into `{ pou, line }`.  POU names are IEC
 * identifiers (no colon), and the line is the trailing integer, so we split
 * on the last colon.  Returns `null` for a malformed key (missing colon or a
 * non-integer line) so callers can skip stale entries defensively.
 */
export function parseBreakpointKey(key: string): { pou: string; line: number } | null {
  const idx = key.lastIndexOf(':')
  if (idx <= 0 || idx === key.length - 1) return null
  const line = Number(key.slice(idx + 1))
  if (!Number.isInteger(line)) return null
  return { pou: key.slice(0, idx), line }
}

/**
 * Resolve armed breakpoint keys to the set of runtime checkpoint ids to arm.
 * Every checkpoint whose (pou, line) matches an armed key is included; the
 * result is deduplicated and ascending so the wire payload is deterministic.
 */
export function resolveBreakpointIds(breakpoints: string[], map: DebugCheckpointEntry[]): number[] {
  if (breakpoints.length === 0 || map.length === 0) return []
  const armed = new Set(breakpoints)
  const ids = new Set<number>()
  for (const entry of map) {
    if (armed.has(breakpointKey(entry.pou, entry.line))) ids.add(entry.id)
  }
  return Array.from(ids).sort((a, b) => a - b)
}

/**
 * The set of lines in `pou` that carry at least one checkpoint — i.e. the
 * lines where a breakpoint can actually be placed.  The gutter uses this to
 * ignore clicks on non-breakpointable lines (blank lines, declarations).
 */
export function breakpointableLines(map: DebugCheckpointEntry[], pou: string): Set<number> {
  const lines = new Set<number>()
  for (const entry of map) {
    if (entry.pou === pou) lines.add(entry.line)
  }
  return lines
}

/**
 * Reverse lookup: the (pou, line) a checkpoint id sits on, for highlighting
 * the current statement when the target halts.  Returns `null` when the id is
 * absent from the map (e.g. a stale halt after a recompile).
 */
export function checkpointLocation(map: DebugCheckpointEntry[], id: number): { pou: string; line: number } | null {
  const entry = map.find((e) => e.id === id)
  return entry ? { pou: entry.pou, line: entry.line } : null
}
