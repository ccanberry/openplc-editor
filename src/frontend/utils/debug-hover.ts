/**
 * Debug hover (logged in): what the expression under the mouse is, and which live values show it.
 *
 * CODESYS shows the value of whatever is hovered -- a scalar, an array, an FB instance or a
 * member of one (`TON0.Q`, `ARR[3].X`). The hover provider (editor/monaco/debug-hover-provider.ts)
 * asks here for:
 *   - the expression ending at the hovered word (`expressionAt`),
 *   - the composite keys that hold its value: itself when it is a leaf, otherwise its children
 *     (`resolveHoverKeys`), capped so a 2048-element array does not flood the PLC link.
 * The provider asks the poller for those keys (debugExtraKeys 'hover'): an array's elements are
 * not polled for the inline values, so they are read only while hovered (and HOVER_WATCH_TTL_MS
 * after), never all the time.
 */

const IDENT = /[A-Za-z0-9_]/

/** At most this many values in one hover (and polled for it). */
export const HOVER_MAX_VALUES = 64

/** Hovered keys stay polled this long after the last hover. */
export const HOVER_WATCH_TTL_MS = 5000

/**
 * The expression at the word under `column` (1-based, Monaco): the word itself, the chain of
 * `.member` and `[index]` steps before it, and the `[index]` groups right after it -- `ARR[i].Q`
 * when the mouse is on `Q`, `ARR[i]` when it is on `ARR` (the element the index selects now, not
 * the whole array). Null when the column is not on an identifier.
 */
export function expressionAt(lineText: string, column: number): string | null {
  const at = column - 1
  if (at < 0 || at >= lineText.length || !IDENT.test(lineText[at])) return null
  let start = at
  while (start > 0 && IDENT.test(lineText[start - 1])) start--
  let end = at
  while (end < lineText.length && IDENT.test(lineText[end])) end++

  // Walk left over `.member` and `[index]` steps: `X.` or `X[..].` before the current start.
  let p = start
  for (;;) {
    let q = p - 1
    if (q < 0 || lineText[q] !== '.') break
    q--
    while (q >= 0 && lineText[q] === ']') {
      let depth = 0
      for (; q >= 0; q--) {
        if (lineText[q] === ']') depth++
        else if (lineText[q] === '[' && --depth === 0) break
      }
      if (q < 0) return lineText.slice(start, end)
      q--
    }
    if (q < 0 || !IDENT.test(lineText[q])) break
    while (q > 0 && IDENT.test(lineText[q - 1])) q--
    p = q
  }
  // ...and the index groups that follow the hovered word: `AX` in `AX[P_VAL[1700]]`.
  for (;;) {
    let r = end
    while (r < lineText.length && lineText[r] === ' ') r++
    if (lineText[r] !== '[') break
    let depth = 0
    for (; r < lineText.length; r++) {
      if (lineText[r] === '[') depth++
      else if (lineText[r] === ']' && --depth === 0) break
    }
    if (r >= lineText.length) break
    end = r + 1
  }
  return lineText.slice(p, end).replace(/\s+/g, '')
}

export interface HoverResolution {
  /** The expression as resolved: variable indexes replaced by their live values. */
  path: string
  /** The composite keys to show: [the key itself] for a leaf, otherwise its first children. */
  keys: string[]
  /** How many children there are in all (keys.length when not capped). */
  total: number
  /** The base composite key (scope prefix + path). */
  baseKey: string
  /** The variables the indexes were read from (to be polled while hovered). */
  indexKeys: string[]
}

/**
 * Resolve `expression` in the scope `prefix` (`PROG:` for a program, `PROG:FB.` for an FB
 * instance) against every known composite key. IEC names are case-insensitive. An index that is
 * not a literal -- a variable, an element (`P_VAL[1700]`), a member -- is replaced by its live
 * value when that is a whole number; otherwise the expression stops before it (the hover shows
 * the whole array). Globals reached from another scope are found by their name after any `POU:`.
 */
export function resolveHoverKeys(
  expression: string,
  prefix: string,
  allKeys: Iterable<string>,
  readValue: (key: string) => string | undefined,
): HoverResolution | null {
  const keyList = Array.from(allKeys)
  const byLower = new Map<string, string>()
  for (const k of keyList) byLower.set(k.toLowerCase(), k)
  const find = (key: string): string | undefined => byLower.get(key.toLowerCase())
  const indexKeys: string[] = []

  // Resolve indexes left to right; stop at the first one that cannot be resolved.
  let path = ''
  const steps = splitSteps(expression)
  for (const step of steps) {
    if (!step.startsWith('[')) {
      path += step
      continue
    }
    const inner = step.slice(1, -1).trim()
    if (/^-?\d+$/.test(inner)) {
      path += `[${parseInt(inner, 10)}]`
      continue
    }
    // the index is itself an expression: resolve it (a leaf), and read it
    const sub = inner ? resolveHoverKeys(inner, prefix, keyList, readValue) : null
    if (sub) indexKeys.push(...sub.indexKeys)
    const subKey = sub && sub.keys.length === 1 && sub.keys[0] === sub.baseKey ? sub.baseKey : undefined
    if (subKey) indexKeys.push(subKey)
    const n = subKey ? wholeNumber(readValue(subKey)) : null
    if (n === null) break
    path += `[${n}]`
  }
  path = path.replace(/\.$/, '')
  if (!path) return null

  const lowerPath = path.toLowerCase()
  const isAtOrUnder = (rest: string) =>
    rest === lowerPath || rest.startsWith(`${lowerPath}.`) || rest.startsWith(`${lowerPath}[`)

  // In scope first; then a global (VAR_EXTERNAL) or another scope's name: any `POU:path`.
  let base: string | undefined
  const lowerPrefix = prefix.toLowerCase()
  for (const [lower, k] of byLower) {
    if (lower.startsWith(lowerPrefix) && isAtOrUnder(lower.slice(lowerPrefix.length))) {
      base = k.slice(0, prefix.length + path.length)
      break
    }
  }
  if (base === undefined) {
    for (const [lower, k] of byLower) {
      const from = lower.indexOf(':') + 1
      if (isAtOrUnder(lower.slice(from))) {
        base = k.slice(0, from + path.length)
        break
      }
    }
  }
  if (base === undefined) return null
  if (find(base) !== undefined) return { path, keys: [find(base) as string], total: 1, baseKey: base, indexKeys }

  const lowerBase = base.toLowerCase()
  const children: string[] = []
  for (const [lower, k] of byLower) {
    if (lower.startsWith(`${lowerBase}.`) || lower.startsWith(`${lowerBase}[`)) children.push(k)
  }
  // (never empty: the base was found from a key at or under it, and it is not that key)
  children.sort(compareKeys)
  return { path, keys: children.slice(0, HOVER_MAX_VALUES), total: children.length, baseKey: base, indexKeys }
}

/** `AX[P_VAL[1700]].Q` -> `AX`, `[P_VAL[1700]]`, `.`, `Q`: names, dots and balanced index groups. */
function splitSteps(expression: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < expression.length) {
    const c = expression[i]
    if (c === '[') {
      let depth = 0
      let j = i
      for (; j < expression.length; j++) {
        if (expression[j] === '[') depth++
        else if (expression[j] === ']' && --depth === 0) break
      }
      out.push(expression.slice(i, j + 1))
      i = j + 1
    } else if (IDENT.test(c)) {
      let j = i
      while (j < expression.length && IDENT.test(expression[j])) j++
      out.push(expression.slice(i, j))
      i = j
    } else {
      if (c === '.') out.push('.')
      i++
    }
  }
  return out
}

/** A live value used as an index: a whole number (`3`, `3.0`), else null. */
function wholeNumber(value: string | undefined): number | null {
  if (value === undefined) return null
  const n = Number(value.trim())
  if (!value.trim() || !isFinite(n) || Math.abs(n - Math.round(n)) > 1e-9) return null
  return Math.round(n)
}

/** Order keys as the declaration does: array elements by number (`[2]` before `[10]`). */
function compareKeys(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })
}

/** A child key's name relative to the hovered base: `[3]`, `.Q`, `[3].Q`. */
export function relativeName(baseKey: string, key: string): string {
  return key.slice(baseKey.length)
}
