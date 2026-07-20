/**
 * Debug hover provider (M0 online monitoring).
 *
 * While a debug session is active (`workspace.isDebuggerVisible`), hovering an
 * identifier in an ST/IL POU shows its live polled value + forced state — the
 * same values the inline `= value` decorations render (see the
 * `debugVarPositions` block in ./index.tsx), surfaced on demand for the token
 * under the cursor. This is the "hover to see the value on the current line"
 * affordance; the inline decorations cover the always-on case.
 *
 * Registered ONCE per Monaco namespace (module singleton) and reads live store
 * state inside the callback, so it never closes over stale debug values and
 * never double-registers across the many MonacoEditor mounts.
 *
 * Reuses the existing debug data plane end-to-end: values come from the poller
 * (useDebugPolling) via `workspace.debugBoolValues` / `debugNonBoolValues`,
 * keyed by composite key `"<pou>:<var>"` (or `"<program>:<fbVar>.<member>"`
 * for FB instances). No new transport or protocol.
 */
import type * as monacoT from 'monaco-editor'

import { openPLCStoreBase } from '../../../../../store'

let registered = false

/**
 * Best-effort POU name from a Monaco model URI. ST models live under
 * `inmemory://pou/<name>.st`; other languages use the project filesystem path
 * `<projectPath>/.../<name>.<ext>`. Either way the basename sans extension is
 * the POU name.
 */
function pouNameFromUri(uri: string): string | null {
  const path = uri.split(/[?#]/)[0]
  const base = path.split('/').pop()
  if (!base) return null
  return base.replace(/\.\w+$/, '') || null
}

interface DebugHit {
  value: string
  forced: boolean
}

/**
 * Resolve the live value + forced flag for `word` in `pouName`'s scope. IEC
 * identifiers are case-insensitive, and the typed token's case may differ from
 * the declared name that keys the value maps, so all comparisons are
 * case-insensitive. Scope-local (`<pou>:<word>`) wins; otherwise fall back to
 * any key ending in `:<word>` or `.<word>` (shared globals / FB members).
 */
function lookup(word: string, pouName: string | null): DebugHit | null {
  const { debugBoolValues, debugNonBoolValues, debugForcedVariables } = openPLCStoreBase.getState().workspace

  const readForced = (key: string): boolean => debugForcedVariables.has(key)

  if (pouName) {
    const wantLocal = `${pouName}:${word}`.toLowerCase()
    for (const map of [debugBoolValues, debugNonBoolValues]) {
      for (const [key, value] of map) {
        if (key.toLowerCase() === wantLocal) return { value, forced: readForced(key) }
      }
    }
  }

  const wantColon = `:${word}`.toLowerCase()
  const wantDot = `.${word}`.toLowerCase()
  for (const map of [debugBoolValues, debugNonBoolValues]) {
    for (const [key, value] of map) {
      const lower = key.toLowerCase()
      if (lower.endsWith(wantColon) || lower.endsWith(wantDot)) return { value, forced: readForced(key) }
    }
  }
  return null
}

/**
 * Register the debug hover provider once for the ST and IL languages. Safe to
 * call on every editor mount — subsequent calls are no-ops. Never disposed; the
 * provider is inert whenever no debug session is active.
 */
export function ensureDebugHoverProvider(monaco: typeof monacoT): void {
  if (registered) return
  registered = true

  for (const languageId of ['st', 'il']) {
    monaco.languages.registerHoverProvider(languageId, {
      provideHover(model, position) {
        if (!openPLCStoreBase.getState().workspace.isDebuggerVisible) return null
        const word = model.getWordAtPosition(position)
        if (!word) return null

        const hit = lookup(word.word, pouNameFromUri(model.uri.toString()))
        if (!hit) return null

        const forcedNote = hit.forced ? '  \n\n_forced_' : ''
        return {
          range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          contents: [{ value: `**${word.word}** = \`${hit.value}\`${forcedNote}` }],
        }
      },
    })
  }
}
