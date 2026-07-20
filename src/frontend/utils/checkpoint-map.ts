/**
 * Parser for the online-debugger `checkpoint-map.json` emitted by a
 * `debugCheckpoints` STruC++ build.
 *
 * ## Schema
 *
 * The editor consumes POU-local coordinates so the breakpoint gutter can map a
 * checkpoint straight onto a line of the POU body Monaco shows.  Two on-disk
 * shapes are accepted:
 *
 *   1. **Editor-native (preferred)** — the fork emits entries already resolved
 *      to `{ id, pou, line }` (1-based `line`, POU-body-relative).  This is the
 *      contract documented in the STruC++ fork's `docs/DEBUG_CHECKPOINTS.md`.
 *
 *   2. **Raw compiler form** — `{ id, file, startLine }` (plus col/end fields),
 *      where `file` is the per-POU source file name (e.g. `main.st`) and
 *      `startLine` is that file's line.  When the map hasn't been resolved to
 *      POU-local coordinates, `file` (minus a trailing extension) is taken as
 *      the POU name and `startLine` as the line.  NOTE: a per-POU file carries
 *      the `PROGRAM …/VAR …/END_VAR` header ahead of the body, so `startLine`
 *      is only body-relative once the fork subtracts that header offset — see
 *      the fork docs.  This branch is a best-effort fallback for early builds.
 *
 * Malformed entries are skipped rather than throwing, so a partially-written or
 * schema-drifted file degrades to fewer breakpointable lines instead of
 * disabling run control entirely.
 *
 * Pure — no IPC, no store.
 */
import type { DebugCheckpointEntry } from '../../middleware/shared/ports/types'

interface RawCheckpointEntry {
  id?: unknown
  pou?: unknown
  line?: unknown
  file?: unknown
  startLine?: unknown
}

/** Strip a single trailing `.st` / `.il` extension from a per-POU file name. */
function fileToPou(file: string): string {
  return file.replace(/\.(st|il)$/i, '')
}

function toEntry(raw: RawCheckpointEntry): DebugCheckpointEntry | null {
  if (typeof raw.id !== 'number' || !Number.isInteger(raw.id)) return null

  // Preferred: already POU-local.
  if (typeof raw.pou === 'string' && raw.pou.length > 0 && typeof raw.line === 'number' && Number.isInteger(raw.line)) {
    return { id: raw.id, pou: raw.pou, line: raw.line }
  }

  // Fallback: raw compiler form (file + startLine).
  if (
    typeof raw.file === 'string' &&
    raw.file.length > 0 &&
    typeof raw.startLine === 'number' &&
    Number.isInteger(raw.startLine)
  ) {
    const pou = fileToPou(raw.file)
    if (pou.length === 0) return null
    return { id: raw.id, pou, line: raw.startLine }
  }

  return null
}

/**
 * Parse `checkpoint-map.json` content into `DebugCheckpointEntry[]`.  Accepts
 * either a bare array of entries or `{ checkpoints: [...] }` (the shape the
 * fork's `CompileResult` serialises).  Returns `[]` for anything unparseable.
 */
export function parseCheckpointMap(content: string): DebugCheckpointEntry[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return []
  }

  const rawList: unknown = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { checkpoints?: unknown }).checkpoints)
      ? (parsed as { checkpoints: unknown[] }).checkpoints
      : null

  if (!Array.isArray(rawList)) return []

  const entries: DebugCheckpointEntry[] = []
  for (const raw of rawList) {
    if (typeof raw !== 'object' || raw === null) continue
    const entry = toEntry(raw as RawCheckpointEntry)
    if (entry) entries.push(entry)
  }
  return entries
}
