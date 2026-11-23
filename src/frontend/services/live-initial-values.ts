/**
 * Live values -> initial values: read the live values of the globals that can take one
 * (utils/live-initial-values), straight from the PLC through the debugger port -- not from the
 * display, which rounds -- and say per global whether the project's initial value differs.
 * The port sends one request at a time (the TCP client's mutex), so this runs beside the polling.
 */
import type { DebuggerPort } from '../../middleware/shared/ports/debugger-port'
import { openPLCStoreBase } from '../store'
import { applySwapToVariableBytes } from '../utils/endian'
import {
  composeInitial,
  exactLiteral,
  type LiveSkip,
  type LiveTarget,
  liveTargets,
  sameInitial,
} from '../utils/live-initial-values'
import { getTypeSizeByName } from '../utils/variable-sizes'
import { leavesByPath } from './forcing'

export type LiveRow = {
  name: string
  retain: boolean
  /** the project's initial value now ('' = none) */
  current: string
  /** the initial value the live value gives; null when it cannot be stored exactly */
  live: string | null
  changed: boolean
}

/** The live literal of every leaf, by path. */
async function readLeaves(port: DebuggerPort, targets: LiveTarget[]): Promise<Map<string, string | null>> {
  const leaves = targets.flatMap((t) => t.leaves)
  const out = new Map<string, string | null>()
  const endian = openPLCStoreBase.getState().workspace.debugTargetEndian
  let pos = 0
  let batch = 32
  while (pos < leaves.length) {
    const req = leaves.slice(pos, pos + batch)
    const r = await port.getVariablesList(req.map((l) => l.index))
    if (!r.success) {
      if (r.error === 'ERROR_OUT_OF_MEMORY' && batch > 1) {
        batch = Math.max(1, Math.floor(batch / 2))
        continue
      }
      throw new Error(r.error ?? 'the PLC did not answer')
    }
    const data = new Uint8Array(r.data ?? [])
    const last = Math.min(r.lastIndex ?? req.length - 1, req.length - 1)
    let off = 0
    let done = 0
    for (let i = 0; i <= last; i++) {
      const leaf = req[i]
      const size = getTypeSizeByName(leaf.type)
      if (off + size > data.length) break
      applySwapToVariableBytes(data, off, size, leaf.type, endian)
      out.set(leaf.path, exactLiteral(data, off, leaf.type).literal)
      off += size
      done++
    }
    if (done === 0) throw new Error('the PLC sent no values')
    pos += done
  }
  return out
}

/** Every global that can take a live value, with its live initial value; and the ones that cannot. */
export async function readLiveInitials(port: DebuggerPort): Promise<{ rows: LiveRow[]; skipped: LiveSkip[] }> {
  const globals = openPLCStoreBase.getState().project.data.configurations.resource.globalVariables
  const { targets, skipped } = liveTargets(globals, leavesByPath())
  const values = await readLeaves(port, targets)
  const rows = targets.map((t) => {
    const lits = t.leaves.map((l) => values.get(l.path) ?? null)
    const live = lits.every((l) => l !== null) ? composeInitial(t, lits) : null
    return {
      name: t.name,
      retain: t.retain,
      current: t.current,
      live,
      changed: live !== null && !sameInitial(t.current, live, t.leaves.length),
    }
  })
  return { rows, skipped }
}
