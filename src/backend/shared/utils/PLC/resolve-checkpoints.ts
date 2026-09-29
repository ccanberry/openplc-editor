/**
 * Resolve STruC++ debug checkpoints to POU-body-local coordinates for the
 * editor's breakpoint gutter.
 *
 * The `debugCheckpoints` build emits, per statement, a `CheckpointMapEntry`
 * whose `file` is the per-POU source file the ST splitter produced
 * (`<PouName>.st`) and whose `startLine` is a line **within that file** — which
 * carries the `PROGRAM …/VAR … END_VAR` declaration header ahead of the body.
 * Monaco shows only the body, so we subtract the header: the checkpoint's
 * body-local line is `startLine - (first body line) + 1`.
 *
 * "First body line" = the first non-blank line after the last `END_VAR` of the
 * declaration section (or the line right after the POU header when the POU
 * declares no variables).  `END_VAR` never appears in a POU body, so the last
 * one always marks the end of declarations.  The blank-line skip absorbs the
 * blank xml2st commonly emits between `END_VAR` and the first statement.
 *
 * ASSUMPTION (calibrate on first live debug build): xml2st preserves the body's
 * line structure — i.e. the body Monaco shows is line-for-line the body inside
 * the per-POU file after the declaration block.  Reindentation (column-only)
 * is fine; line insertion/removal inside the body would shift the mapping and
 * would need a real source map.  See STruC++ fork `docs/DEBUG_CHECKPOINTS.md`.
 *
 * Pure — no disk, no store.
 */

/** Subset of the fork's `CheckpointMapEntry` this resolver needs. */
export interface RawCheckpoint {
  id: number
  file: string
  startLine: number
}

/** Sidecar a debug build writes next to checkpoint-map.json: `{ checkpointCount, fingerprint }`,
 *  the checkpoint-layout identity the running program also reports (STOPINFO). */
export const CHECKPOINT_FINGERPRINT_FILE = 'checkpoint-fingerprint.json'

/** POU-local checkpoint the editor consumes (matches `DebugCheckpointEntry`). */
export interface PouLocalCheckpoint {
  id: number
  pou: string
  line: number
}

const END_VAR_RE = /^\s*END_VAR\b/i

/**
 * 1-based line in `fileContent` where the POU body begins: the first non-blank
 * line after the last `END_VAR` (or right after the header when there are no
 * VAR blocks).
 */
function bodyFirstLine(fileContent: string): number {
  const lines = fileContent.split('\n')
  let lastEndVar = -1
  for (let i = 0; i < lines.length; i++) {
    if (END_VAR_RE.test(lines[i])) lastEndVar = i
  }
  // Header occupies line 1 (index 0).  Body starts after the last END_VAR, or
  // immediately after the header when the POU declares no variables.
  let idx = lastEndVar >= 0 ? lastEndVar + 1 : 1
  while (idx < lines.length && lines[idx].trim() === '') idx++
  return idx + 1 // 1-based
}

/**
 * Map raw checkpoints to POU-local `{ id, pou, line }`.  `files` is the ST
 * splitter's per-POU file map (`split.files`); returns `[]` when the splitter
 * didn't run (monolithic fallback — no per-POU segmentation to resolve
 * against).  Checkpoints whose file is unknown, or that resolve into the
 * declaration header (line < 1), are dropped.
 */
export function resolveCheckpointsToPouLocal(
  checkpoints: RawCheckpoint[],
  files: Map<string, string> | null,
): PouLocalCheckpoint[] {
  if (!files) return []

  const bodyFirstByFile = new Map<string, number>()
  const out: PouLocalCheckpoint[] = []

  for (const cp of checkpoints) {
    const content = files.get(cp.file)
    if (content === undefined) continue

    let first = bodyFirstByFile.get(cp.file)
    if (first === undefined) {
      first = bodyFirstLine(content)
      bodyFirstByFile.set(cp.file, first)
    }

    const line = cp.startLine - first + 1
    if (line < 1) continue

    const pou = cp.file.replace(/\.(st|il)$/i, '')
    if (pou.length === 0) continue

    out.push({ id: cp.id, pou, line })
  }

  return out
}
