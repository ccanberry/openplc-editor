/**
 * The debug map names every element and member of a complex variable as its own leaf
 * (`PRECLEANINGTIME_[1]`, `TON_START.Q`, `VALVES[2].STATE`). A variable table shows such a
 * variable as a tree: these helpers find the next level below a path.
 */

export type DebugChild = {
  /** The child's full path: `X[1]`, `X.Q`. */
  path: string
  /** What the tree shows for it: `[1]`, `Q`. */
  label: string
  /** True when it has children of its own rather than a value (an element that is an FB). */
  complex: boolean
}

/** The segment right after `base` in `path` (`[1]` or `.Q`), or null when `path` is not below it. */
function nextSegment(path: string, base: string): string | null {
  if (path.length <= base.length || !path.startsWith(base)) return null
  const rest = path.slice(base.length)
  if (rest[0] === '[') {
    const close = rest.indexOf(']')
    return close < 0 ? null : rest.slice(0, close + 1)
  }
  if (rest[0] !== '.') return null
  let end = 1
  while (end < rest.length && rest[end] !== '.' && rest[end] !== '[') end++
  return rest.slice(0, end)
}

/** First number of an index segment (`[3]`, `[2,1]`), for ordering; NaN for a member. */
function indexOf(segment: string): number {
  return segment[0] === '[' ? parseInt(segment.slice(1), 10) : NaN
}

/**
 * The children of `base` among `leafPaths` (upper-case paths, in map order): array elements in
 * index order, FB members in declaration (map) order. Empty when `base` has none.
 */
export function debugChildren(leafPaths: Iterable<string>, base: string): DebugChild[] {
  const seen = new Map<string, DebugChild>()
  for (const path of leafPaths) {
    const segment = nextSegment(path, base)
    if (segment === null) continue
    const childPath = base + segment
    const existing = seen.get(childPath)
    if (existing) {
      if (path !== childPath) existing.complex = true
      continue
    }
    seen.set(childPath, {
      path: childPath,
      label: segment[0] === '.' ? segment.slice(1) : segment,
      complex: path !== childPath,
    })
  }
  const children = Array.from(seen.values())
  if (children.length && children.every((c) => c.label[0] === '[')) {
    children.sort((a, b) => indexOf(a.label) - indexOf(b.label))
  }
  return children
}
