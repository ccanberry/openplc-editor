/**
 * Debug hover provider (logged in).
 *
 * While a debug session is active (`workspace.isDebuggerVisible`), hovering an
 * identifier in an ST/IL POU shows its live value + forced state, as CODESYS
 * does -- for a scalar, and also for an array, an FB instance or a struct (a
 * table of its elements / members) and for a member path (`TON0.Q`,
 * `ARR[i].X`, with a variable index read live).
 *
 * Registered ONCE per Monaco namespace (module singleton) and reads live store
 * state inside the callback, so it never closes over stale debug values and
 * never double-registers across the many MonacoEditor mounts.
 *
 * Values come from the poller (useDebugPolling) via `workspace.debugBoolValues`
 * / `debugNonBoolValues`, keyed by composite key `"<pou>:<var>"` (or
 * `"<program>:<fbVar>.<member>"` inside an FB instance). What the code on screen
 * does not poll (an array's elements) is asked for while hovered
 * (`debugExtraKeys.hover`) and dropped a few seconds later.
 */
import type * as monacoT from 'monaco-editor'

import { openPLCStoreBase } from '../../../../../store'
import {
  expressionAt,
  HOVER_WATCH_TTL_MS,
  relativeName,
  resolveHoverKeys,
} from '../../../../../utils/debug-hover'

let registered = false
let dropWatchTimer: ReturnType<typeof setTimeout> | null = null

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

/** The composite-key prefix of `pouName`'s scope; null for an FB shown as its implementation. */
function scopePrefix(pouName: string): string | null {
  const { project, workspace } = openPLCStoreBase.getState()
  const pou = project.data.pous.find((p) => p.name.toLowerCase() === pouName.toLowerCase())
  if (!pou || pou.pouType !== 'function-block') return `${pou?.name ?? pouName}:`
  const fbTypeKey = pou.name.toUpperCase()
  const selected = workspace.fbSelectedInstance.get(fbTypeKey)
  const inst = (workspace.fbDebugInstances.get(fbTypeKey) ?? []).find((i) => i.key === selected)
  return inst ? `${inst.programName}:${inst.fbVariableName}.` : null
}

function readValue(key: string): string | undefined {
  const { debugBoolValues, debugNonBoolValues } = openPLCStoreBase.getState().workspace
  return debugBoolValues.get(key) ?? debugNonBoolValues.get(key)
}

/** Ask the poller for `keys` now, and stop asking HOVER_WATCH_TTL_MS after the last hover.
 *  True when they were not being asked for already. */
function watch(keys: string[]): boolean {
  const { workspace, workspaceActions } = openPLCStoreBase.getState()
  const before = workspace.debugExtraKeys.hover ?? []
  const isNew = before.length !== keys.length || keys.some((k, i) => before[i] !== k)
  if (isNew) workspaceActions.setDebugExtraKeys('hover', keys)
  if (dropWatchTimer) clearTimeout(dropWatchTimer)
  dropWatchTimer = setTimeout(() => {
    dropWatchTimer = null
    openPLCStoreBase.getState().workspaceActions.setDebugExtraKeys('hover', [])
  }, HOVER_WATCH_TTL_MS)
  return isNew
}

/** Wait (briefly) until the poller has brought a value for each of `keys`. */
async function waitForValues(keys: string[], timeoutMs = 800): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && keys.some((k) => readValue(k) === undefined)) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
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
      async provideHover(model, position) {
        if (!openPLCStoreBase.getState().workspace.isDebuggerVisible) return null
        const word = model.getWordAtPosition(position)
        if (!word) return null
        const expression = expressionAt(model.getLineContent(position.lineNumber), position.column)
        if (!expression) return null
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)

        const pouName = pouNameFromUri(model.uri.toString())
        if (!pouName) return null
        const prefix = scopePrefix(pouName)
        if (prefix === null) {
          return {
            range,
            contents: [{ value: `**${expression}**: this is the implementation -- choose an instance to see values` }],
          }
        }

        const { workspace } = openPLCStoreBase.getState()
        const resolved = resolveHoverKeys(expression, prefix, workspace.debugVariableIndexes.keys(), readValue)
        if (!resolved) return null

        // Newly asked-for keys may hold a value from an earlier hover: let one poll (200 ms)
        // refresh them first.
        const isNew = watch(resolved.keys)
        if (isNew) await new Promise((resolve) => setTimeout(resolve, 250))
        await waitForValues(resolved.keys)

        const forced = openPLCStoreBase.getState().workspace.debugForcedVariables
        const show = (key: string) => {
          const value = readValue(key)
          return `${value === undefined ? '...' : value}${forced.has(key) ? '  (forced)' : ''}`
        }

        // A leaf: one value.
        if (resolved.keys.length === 1 && resolved.keys[0] === resolved.baseKey) {
          return { range, contents: [{ value: `**${resolved.path}** = \`${show(resolved.baseKey)}\`` }] }
        }

        // An array / FB instance / struct: its elements or members.
        const lines = resolved.keys.map((k) => `${relativeName(resolved.baseKey, k)} = ${show(k)}`)
        const more =
          resolved.total > resolved.keys.length
            ? `\n\n_${resolved.total - resolved.keys.length} more -- hover an element (e.g. ${resolved.path}[n]) to see it_`
            : ''
        return {
          range,
          contents: [{ value: `**${resolved.path}**\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`${more}` }],
        }
      },
    })
  }
}
