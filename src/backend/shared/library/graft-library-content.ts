// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Graft what the project's enabled libraries ship into the project before a build.
 *
 * A library archive may carry, beside the strucpp-compiled chunks:
 *
 *   - `cppBlocks`       C/C++ function blocks (verbatim code + interface);
 *   - `stPous`          Structured Text programs, function blocks and functions, in the
 *                       editor's parsed POU shape;
 *   - `dataTypes`       user data types;
 *   - `globalVariables` the library's globals (its interface to the consumer, CODESYS: a
 *                       library GVL).
 *
 * Each becomes part of the project under its PLAIN name -- the way a CODESYS library's blocks
 * are called like TON, and so that the names the HMI and RoboStudio look up in the PLC's debug
 * map (`P_VAL`, a program instance's members) are the same whether a block comes from a library
 * or from the project. Collisions are resolved, not prevented: a project POU, data type or
 * global of the same name (case-insensitive) WINS and the library's copy is skipped, so a
 * project that still carries its own copy (or deliberately overrides one) builds unchanged; and
 * between libraries the first archive wins.
 *
 * Shared by the editor's compiler adapter and the headless build (tools/build_bundle.ts), so
 * both build exactly the same program.
 */

export interface GraftArchive {
  manifest: { name: string }
  cppBlocks?: Array<{ name: string; code: string; variables: unknown[]; documentation?: string }>
  stPous?: unknown[]
  dataTypes?: unknown[]
  globalVariables?: unknown[]
}

interface Named {
  name: string
}

export interface GraftableProject {
  libraries?: Array<{ name: string }>
  pous: Named[]
  dataTypes?: Named[]
  configurations?: { resource?: { globalVariables?: Named[] } }
}

export interface GraftResult<T> {
  projectData: T
  /** per library: what it added (for the build log) */
  added: Array<{ library: string; pous: string[]; dataTypes: string[]; globals: string[] }>
}

const nameOf = (x: unknown): string | undefined => {
  const n = (x as { name?: unknown } | null)?.name
  return typeof n === 'string' && n.length > 0 ? n : undefined
}

export function graftLibraryContent<T extends GraftableProject>(
  projectData: T,
  archives: GraftArchive[],
): GraftResult<T> {
  const enabled = new Set((projectData.libraries ?? []).map((ref) => ref.name))
  const added: GraftResult<T>['added'] = []
  if (enabled.size === 0) return { projectData, added }

  const havePous = new Set(projectData.pous.map((p) => p.name.toUpperCase()))
  const haveTypes = new Set((projectData.dataTypes ?? []).map((t) => t.name.toUpperCase()))
  const globals = projectData.configurations?.resource?.globalVariables ?? []
  const haveGlobals = new Set(globals.map((g) => g.name.toUpperCase()))

  const pous: Named[] = []
  const types: Named[] = []
  const newGlobals: Named[] = []
  const take = (x: unknown, have: Set<string>, into: Named[], log: string[]): void => {
    const n = nameOf(x)
    if (!n || have.has(n.toUpperCase())) return
    have.add(n.toUpperCase())
    into.push(x as Named)
    log.push(n)
  }

  for (const archive of archives) {
    if (!enabled.has(archive.manifest.name)) continue
    const entry = { library: archive.manifest.name, pous: [] as string[], dataTypes: [] as string[], globals: [] as string[] }
    for (const block of archive.cppBlocks ?? []) {
      take(
        {
          name: block.name,
          pouType: 'function-block',
          interface: { variables: block.variables },
          body: { language: 'cpp', value: block.code },
          documentation: block.documentation ?? '',
        },
        havePous,
        pous,
        entry.pous,
      )
    }
    for (const pou of archive.stPous ?? []) take(pou, havePous, pous, entry.pous)
    for (const t of archive.dataTypes ?? []) take(t, haveTypes, types, entry.dataTypes)
    for (const v of archive.globalVariables ?? []) take(v, haveGlobals, newGlobals, entry.globals)
    if (entry.pous.length + entry.dataTypes.length + entry.globals.length > 0) added.push(entry)
  }

  if (pous.length + types.length + newGlobals.length === 0) return { projectData, added }

  const out: T = { ...projectData, pous: [...projectData.pous, ...pous] }
  if (types.length > 0) out.dataTypes = [...(projectData.dataTypes ?? []), ...types]
  if (newGlobals.length > 0) {
    const configurations = projectData.configurations ?? {}
    const resource = configurations.resource ?? {}
    out.configurations = {
      ...configurations,
      resource: { ...resource, globalVariables: [...globals, ...newGlobals] },
    }
  }
  return { projectData: out, added }
}
