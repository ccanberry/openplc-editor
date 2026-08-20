/**
 * Retain compile step (runtime v4 targets).
 *
 * Collects the resource globals flagged `retain` and authors
 * `retain-names.json` — the file that travels at the bundle root
 * beside `debug-map.json` (both extract into the runtime's
 * `core/generated/`). The runtime's retain manager unions these names
 * into `persist/retain.json` at start: a name not stored yet is
 * seeded with the program's value, a name already stored keeps the
 * operator's value, and every stored name is restored before the
 * first scan — on every target alike (the ARM9 board and a local
 * runtime root differ only in where the files sit).
 *
 * Names are resolved against the strucpp debug map HERE, at compile
 * time, so the emitted file contains exact leaf paths the runtime can
 * `strcmp` against its md5-checked map:
 *   - a scalar global contributes its own leaf (`CFG_SPEED`),
 *   - an array/struct global expands to every element leaf
 *     (`SPEED[3]`, `POS.X`) — IEC names compare case-insensitively,
 *     but what is emitted is the leaf path verbatim.
 * A flagged global with no leaf in the map is a warning, not an
 * error: the build stays deployable, the declaration is just skipped.
 *
 * The file is emitted UNCONDITIONALLY (empty `names` when nothing is
 * flagged): the runtime does not clear `core/generated/` between
 * uploads, so each upload must overwrite whatever names file the
 * previous program left there.
 *
 * NOT strucpp's `VAR RETAIN`. That keyword's descriptor table cannot
 * address globals and spans the debugger's force state (see the
 * runtime's retain_manager.h) — the names travel out-of-band instead,
 * and no `RETAIN` qualifier is ever emitted into the ST.
 *
 * Pure function: no I/O, no platform coupling.
 */

export interface RetainGlobalLike {
  name: string
  retain?: boolean
}

/** POU snapshot for POU-level `VAR RETAIN` expansion. */
export interface RetainPouLike {
  name: string
  pouType: string
  variables: Array<{ name: string; retain?: boolean; type?: { value?: unknown } }>
}

export interface CollectRetainedGlobalsInput {
  /** Resource globals of the compile snapshot (post-publish transform —
   *  the publish step never touches `retain`). */
  globalVariables: RetainGlobalLike[]
  /** Strucpp's emitted `debug-map.json` content. */
  debugMapContent: string
  /** PROGRAM_MD5 — same value `debug-map.json` carries, so the runtime
   *  can refuse a names file that outlived its program. */
  md5: string
  /** All POUs of the compile snapshot.  Optional: when present, POU
   *  variables flagged `retain` (parsed from CoDeSys-style `VAR RETAIN`
   *  sections) are expanded into per-instance debug-map leaf paths
   *  (`INSTANCE0.MAINTENANCE_INST.LUBRICATIONSTARTTIME`) and retained
   *  alongside the flagged globals.  The instance tree is derived from
   *  the POU interfaces (a variable whose type names a function block is
   *  an instance edge), so every program-reachable instance of an FB
   *  with retained members contributes its leaves. */
  pous?: RetainPouLike[]
}

export interface CollectRetainedGlobalsResult {
  /** `retain-names.json` content — always present, `names: []` when
   *  the project flags nothing. */
  retainNamesJson: string
  /** Exact leaf paths declared retained, in declaration order. */
  names: string[]
  /** Flagged globals that could not be resolved against the map. */
  warnings: string[]
}

interface DebugMapLeafLike {
  path?: unknown
}

/** Leaf paths out of a debug-map.json string; null when unparseable. */
const parseLeafPaths = (debugMapContent: string): string[] | null => {
  try {
    const parsed: unknown = JSON.parse(debugMapContent)
    const leaves = (parsed as { leaves?: unknown }).leaves
    if (!Array.isArray(leaves)) return null
    return leaves
      .map((leaf: DebugMapLeafLike) => (typeof leaf?.path === 'string' ? leaf.path : ''))
      .filter((path) => path.length > 0)
  } catch {
    return null
  }
}

/**
 * Instance-path suffixes (`FOO_INST.MEMBER`, upper-cased) of every
 * POU-level retained variable reachable from a program.  Pure graph
 * walk over the POU interfaces; cycles guarded (illegal in IEC anyway).
 */
export function collectRetainedInstanceSuffixes(pous: RetainPouLike[]): string[] {
  const byName = new Map<string, RetainPouLike>()
  for (const pou of pous) byName.set(pou.name.toUpperCase(), pou)

  const memo = new Map<string, string[]>()
  const walking = new Set<string>()

  // Suffixes contributed by the POU's OWN variables: a retained member
  // yields its name; an FB-typed member yields that FB's suffixes under
  // the member's name.
  const suffixesOf = (pouNameUpper: string): string[] => {
    const cached = memo.get(pouNameUpper)
    if (cached) return cached
    if (walking.has(pouNameUpper)) return []
    walking.add(pouNameUpper)
    const pou = byName.get(pouNameUpper)
    const out: string[] = []
    for (const variable of pou?.variables ?? []) {
      const varUpper = variable.name.toUpperCase()
      if (variable.retain === true) out.push(varUpper)
      const typeValue = variable.type?.value
      if (typeof typeValue !== 'string') continue
      const typeUpper = typeValue.toUpperCase()
      const inner = byName.get(typeUpper)
      if (!inner || inner.pouType !== 'function-block') continue
      for (const suffix of suffixesOf(typeUpper)) out.push(`${varUpper}.${suffix}`)
    }
    walking.delete(pouNameUpper)
    memo.set(pouNameUpper, out)
    return out
  }

  const suffixes: string[] = []
  for (const pou of pous) {
    if (pou.pouType !== 'program') continue
    for (const suffix of suffixesOf(pou.name.toUpperCase())) {
      // Program-level `VAR RETAIN` members surface here too (a bare
      // member name, no instance segment) — same matching rules apply.
      if (!suffixes.includes(suffix)) suffixes.push(suffix)
    }
  }
  return suffixes
}

export function collectRetainedGlobals(input: CollectRetainedGlobalsInput): CollectRetainedGlobalsResult {
  const flagged = input.globalVariables.filter((variable) => variable.retain === true)
  const instanceSuffixes = collectRetainedInstanceSuffixes(input.pous ?? [])
  const names: string[] = []
  const warnings: string[] = []

  if (flagged.length > 0 || instanceSuffixes.length > 0) {
    const leafPaths = parseLeafPaths(input.debugMapContent)
    if (leafPaths === null) {
      warnings.push(
        `retain: debug map is missing or unreadable - ${flagged.length + instanceSuffixes.length} retain declaration(s) skipped this build`,
      )
    } else {
      const seen = new Set<string>()
      for (const variable of flagged) {
        const upper = variable.name.toUpperCase()
        // Exact leaf, or the element/member leaves of an array/struct
        // global. Case-insensitive: IEC identifiers are, and strucpp's
        // leaf casing follows the declaration, not the reference.
        const matches = leafPaths.filter((path) => {
          const pathUpper = path.toUpperCase()
          return pathUpper === upper || pathUpper.startsWith(`${upper}[`) || pathUpper.startsWith(`${upper}.`)
        })
        if (matches.length === 0) {
          warnings.push(
            `retain: global "${variable.name}" has no debug-map leaf (constant, unsupported type, or optimised away) - not retained`,
          )
          continue
        }
        for (const path of matches) {
          if (seen.has(path)) continue
          seen.add(path)
          names.push(path)
        }
      }

      // POU-level `VAR RETAIN`: match each instance suffix under every
      // program instance prefix (`INSTANCE<n>.`).  strucpp numbers the
      // program instances itself, so the suffix — derived from the POU
      // interfaces — is matched against the leaf path with the prefix
      // stripped, exact or expanded (array element / struct member /
      // nested FB pins), mirroring the global matching above.
      for (const suffix of instanceSuffixes) {
        let matched = false
        for (const path of leafPaths) {
          const pathUpper = path.toUpperCase()
          const prefixMatch = pathUpper.match(/^INSTANCE\d+\./)
          if (!prefixMatch) continue
          const rest = pathUpper.slice(prefixMatch[0].length)
          if (rest !== suffix && !rest.startsWith(`${suffix}[`) && !rest.startsWith(`${suffix}.`)) continue
          matched = true
          if (seen.has(path)) continue
          seen.add(path)
          names.push(path)
        }
        if (!matched) {
          warnings.push(
            `retain: POU variable "${suffix}" (VAR RETAIN) has no debug-map leaf under any program instance - not retained`,
          )
        }
      }
    }
  }

  const retainNamesJson = `${JSON.stringify({ version: 1, md5: input.md5, names }, null, 2)}\n`
  return { retainNamesJson, names, warnings }
}
