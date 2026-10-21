/**
 * Collect console lines that arrive in a burst (a build streams one IPC message per line) and
 * add them in one store update. Each update re-renders the console, so line by line a build's
 * hundred lines cost ~0.1 s each -- the console, not the build, set the pace. `flush` adds what
 * is pending at once; call it before logging anything else so the order stays.
 */
export function createLogBatcher<T>(
  addMany: (items: T[]) => void,
  schedule: (fn: () => void) => void = (fn) => setTimeout(fn, 0),
) {
  let pending: T[] = []
  let scheduled = false
  const flush = () => {
    scheduled = false
    if (pending.length === 0) return
    const items = pending
    pending = []
    addMany(items)
  }
  return {
    add: (item: T) => {
      pending.push(item)
      if (!scheduled) {
        scheduled = true
        schedule(flush)
      }
    },
    flush,
  }
}
