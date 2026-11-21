// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Editor adapter for StlibSourcePort.
 *
 * Implementation note: the main process's LibraryManagerModule
 * already returns every installed archive (bundled + user) parsed
 * via the `libraries:load-all` IPC.  Rather than introduce a second
 * IPC channel just to surface the raw bytes, we cache the parsed
 * archives in-memory and JSON-stringify on demand for the LSP
 * worker.  The double cost (parse in main → stringify here →
 * `loadStlibFromString` in the worker) is fine for the ~10 archives
 * a typical project carries; it also keeps the trust boundary
 * unchanged — the renderer never gets fresh-from-disk bytes.
 *
 * `sourceLabel` is just the library name in this adapter.  The web
 * adapter will use an HTTP URL — same shape, different meaning.
 *
 * Cache invalidation: `libraries:changed` IPC events are emitted by
 * the main process whenever install / uninstall happens.  The
 * adapter listens via `window.bridge.onLibrariesChanged` so the
 * next `listStlibs` / `readStlib` reflects the new set.
 */

import type { StlibSource, StlibSourcePort } from '../../shared/ports/stlib-source-port'

interface CachedArchive {
  /** Re-stringified once per cache miss; reused for repeated reads. */
  json: string
  manifest: {
    name: string
    version: string
  }
}

/**
 * Give the LSP an interface stub for everything a library grafts into the consumer at build time
 * (graftLibraryContent) rather than shipping as strucpp-compiled chunks:
 *
 *   - `cppBlocks` and ST function blocks in `stPous`  -> `manifest.functionBlocks`;
 *   - ST functions in `stPous`                        -> `manifest.functions`;
 *   - ST programs in `stPous` (PLC_PRG calls `NC_LINK_IN();`) -> `manifest.functions` too, a call
 *     with no arguments -- the LSP only needs the name to resolve the call;
 *   - `dataTypes`                                     -> `manifest.types` (structs with fields);
 *   - `globalVariables`                               -> `manifest.globals`.
 *
 * Without these the ST language server flags `inst : RCNC_SYNC;`, `P_SET(...)`, `P_VAL[i]` as
 * unknown although the build succeeds. Synthesized on the copy fed to the LSP worker only -- the
 * on-disk archive is untouched -- and an author-provided manifest entry of the same name wins.
 */
type Pin = { name: string; type: string }
type FbEntry = { name: string; inputs: Pin[]; outputs: Pin[]; inouts: Pin[]; documentation: string }
type FnEntry = {
  name: string
  returnType: string
  parameters: Array<{ name: string; type: string; direction: 'input' | 'output' | 'inout' }>
  documentation: string
}
type TypeEntry = { name: string; kind: 'struct' | 'enum' | 'alias'; fields?: Pin[] }
type GlobalEntry = { name: string; type: string }
type LibVar = { name?: string; class?: string; type?: { value?: string } }
type LibPou = {
  name?: string
  pouType?: string
  interface?: { variables?: LibVar[]; returnType?: string }
  variables?: LibVar[]
  documentation?: string
}
type LibType = { name?: string; derivation?: string; variable?: Array<{ name?: string; type?: { value?: string } }> }

function pinsOf(vars: LibVar[] | undefined, cls: string): Pin[] {
  return (vars ?? [])
    .filter((v) => v.class === cls && v.name)
    .map((v) => ({ name: v.name as string, type: v.type?.value ?? 'BOOL' }))
}

function withGraftStubs(archive: {
  manifest?: { name?: string; version?: string }
  [k: string]: unknown
}): typeof archive {
  const cppBlocks = ((archive as { cppBlocks?: LibPou[] }).cppBlocks ?? []).map((b): LibPou => ({
    ...b,
    pouType: 'function-block',
    interface: { variables: b.variables },
  }))
  const stPous = (archive as { stPous?: LibPou[] }).stPous ?? []
  const dataTypes = (archive as { dataTypes?: LibType[] }).dataTypes ?? []
  const globals = (archive as { globalVariables?: LibVar[] }).globalVariables ?? []
  if (cppBlocks.length + stPous.length + dataTypes.length + globals.length === 0) return archive

  const manifest = (archive.manifest ?? {}) as {
    functionBlocks?: FbEntry[]
    functions?: FnEntry[]
    types?: TypeEntry[]
    globals?: GlobalEntry[]
  }
  const known = (list: Array<{ name: string }> | undefined) => new Set((list ?? []).map((e) => e.name.toUpperCase()))
  const haveFbs = known(manifest.functionBlocks)
  const haveFns = known(manifest.functions)
  const haveTypes = known(manifest.types)
  const haveGlobals = known(manifest.globals)
  const fbs: FbEntry[] = []
  const fns: FnEntry[] = []
  for (const pou of [...cppBlocks, ...stPous]) {
    if (!pou.name) continue
    const vars = pou.interface?.variables
    const upper = pou.name.toUpperCase()
    if (pou.pouType === 'function-block') {
      if (haveFbs.has(upper)) continue
      haveFbs.add(upper)
      fbs.push({
        name: pou.name,
        inputs: pinsOf(vars, 'input'),
        outputs: pinsOf(vars, 'output'),
        inouts: pinsOf(vars, 'inOut'),
        documentation: pou.documentation ?? '',
      })
    } else if (pou.pouType === 'function' || pou.pouType === 'program') {
      if (haveFns.has(upper)) continue
      haveFns.add(upper)
      const params =
        pou.pouType === 'function'
          ? [
              ...pinsOf(vars, 'input').map((p) => ({ ...p, direction: 'input' as const })),
              ...pinsOf(vars, 'inOut').map((p) => ({ ...p, direction: 'inout' as const })),
              ...pinsOf(vars, 'output').map((p) => ({ ...p, direction: 'output' as const })),
            ]
          : []
      fns.push({
        name: pou.name,
        returnType: pou.interface?.returnType ?? 'BOOL',
        parameters: params,
        documentation: pou.documentation ?? '',
      })
    }
  }
  const types: TypeEntry[] = []
  for (const t of dataTypes) {
    if (!t.name || haveTypes.has(t.name.toUpperCase())) continue
    haveTypes.add(t.name.toUpperCase())
    if (t.derivation === 'structure') {
      types.push({
        name: t.name,
        kind: 'struct',
        fields: (t.variable ?? [])
          .filter((f) => f.name)
          .map((f) => ({ name: f.name as string, type: f.type?.value ?? 'BOOL' })),
      })
    } else {
      types.push({ name: t.name, kind: t.derivation === 'enumerated' ? 'enum' : 'alias' })
    }
  }
  const gl: GlobalEntry[] = []
  for (const g of globals) {
    if (!g.name || !g.type?.value || haveGlobals.has(g.name.toUpperCase())) continue
    haveGlobals.add(g.name.toUpperCase())
    gl.push({ name: g.name, type: g.type.value })
  }
  return {
    ...archive,
    manifest: {
      ...archive.manifest,
      functionBlocks: [...(manifest.functionBlocks ?? []), ...fbs],
      functions: [...(manifest.functions ?? []), ...fns],
      types: [...(manifest.types ?? []), ...types],
      globals: [...(manifest.globals ?? []), ...gl],
    } as typeof archive.manifest,
  }
}

export function createEditorStlibSourceAdapter(): StlibSourcePort {
  /**
   * Per-process cache.  Populated on first `listStlibs` (or after
   * `libraries:changed`); cleared on change events so the next
   * call re-fetches.
   */
  let archives: Map<string, CachedArchive> | null = null

  async function ensureCache(): Promise<Map<string, CachedArchive>> {
    if (archives) return archives
    // Returns StlibArchiveDTO[] — the structural shape matches
    // strucpp's `StlibArchive` (just a JSON object).  Each entry
    // carries a full `manifest` block and the chunks/dependencies.
    const all = (await window.bridge.loadAllLibraries()) as Array<{
      manifest?: { name?: string; version?: string }
      [k: string]: unknown
    }>
    const map = new Map<string, CachedArchive>()
    for (const archive of all) {
      const name = archive.manifest?.name
      const version = archive.manifest?.version
      // Skip archives without a usable identity — the LSP can't
      // address them and they wouldn't survive `loadStlibFromString`
      // anyway.  This is defensive; loadAll() never produces these.
      if (!name || !version) continue
      map.set(name, {
        json: JSON.stringify(withGraftStubs(archive)),
        manifest: { name, version },
      })
    }
    archives = map
    return map
  }

  // Drop the cache whenever libraries change so the next
  // `listStlibs` re-pulls.  No-op if window.bridge doesn't expose
  // the subscription (older builds, test harnesses).
  if (typeof window.bridge?.onLibrariesChanged === 'function') {
    window.bridge.onLibrariesChanged(() => {
      archives = null
    })
  }

  return {
    async listStlibs(): Promise<StlibSource[]> {
      const cache = await ensureCache()
      return [...cache.values()].map((entry) => ({
        name: entry.manifest.name,
        version: entry.manifest.version,
        // The adapter is the only thing that interprets sourceLabel.
        // Reusing the library name keeps the wire payload trivial.
        sourceLabel: entry.manifest.name,
      }))
    },

    async readStlib(sourceLabel: string): Promise<string> {
      const cache = await ensureCache()
      const entry = cache.get(sourceLabel)
      if (!entry) {
        throw new Error(
          `Unknown stlib source '${sourceLabel}' — not present in the editor's library cache. ` +
            'The LSP worker may be holding a stale reference; trigger a libraries:changed reload.',
        )
      }
      return entry.json
    },
  }
}
