import type { PLCPou, PLCVariable } from '../../middleware/shared/ports/types'

/**
 * A POU's variables as the debugger sees them: its own, plus every resource global its body
 * uses without declaring it.
 *
 * A POU uses the resource's globals by name, as in CODESYS: strucpp declares the VAR_EXTERNAL it
 * needs, so the variables table no longer carries one. The debugger keyed a global's live value
 * in a POU through that extern (`POU:NAME` -> the global's leaf); this puts it back for every
 * global the body names. A local of the same name hides the global, as in the compiler.
 *
 * The body is matched by whole words, so a graphical body (LD/FBD, where variable names sit in
 * the node data) is searched as its JSON. Cached per body and globals list: the polling filter
 * asks on every poll.
 */
const cache = new WeakMap<object, { globals: PLCVariable[]; own: PLCVariable[]; result: PLCVariable[] }>()

const bodyText = (pou: PLCPou): string => {
  const value = pou.body?.value
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? '')
  } catch {
    return ''
  }
}

export function variablesWithImplicitExternals(pou: PLCPou, globals: PLCVariable[] | undefined): PLCVariable[] {
  const own = pou.interface?.variables ?? []
  if (!globals || globals.length === 0 || pou.pouType === 'function') return own
  const key = pou.body as unknown as object
  const hit = key && typeof key === 'object' ? cache.get(key) : undefined
  if (hit && hit.globals === globals && hit.own === own) return hit.result

  const declared = new Set(own.map((v) => v.name.toUpperCase()))
  const words = new Set((bodyText(pou).match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).map((w) => w.toUpperCase()))
  const implicit: PLCVariable[] = []
  for (const g of globals) {
    if (!g.name) continue
    const upper = g.name.toUpperCase()
    if (declared.has(upper) || !words.has(upper)) continue
    implicit.push({ ...g, class: 'external', location: '', initialValue: undefined, debug: false })
  }
  const result = implicit.length > 0 ? [...own, ...implicit] : own
  if (key && typeof key === 'object') cache.set(key, { globals, own, result })
  return result
}

let lastPous: { pous: PLCPou[]; globals: PLCVariable[] | undefined; result: PLCPou[] } | null = null

/** Every program and FB of the project with its implicit externals (see above). Memoised on
 *  the two arrays, which the store replaces on any change. */
export function pousWithImplicitExternals(pous: PLCPou[], globals: PLCVariable[] | undefined): PLCPou[] {
  if (lastPous && lastPous.pous === pous && lastPous.globals === globals) return lastPous.result
  const result = pous.map((pou) => {
    const variables = variablesWithImplicitExternals(pou, globals)
    return variables === (pou.interface?.variables ?? []) ? pou : { ...pou, interface: { ...pou.interface, variables } }
  })
  lastPous = { pous, globals, result }
  return result
}
