/**
 * CODESYS-style forcing: prepare values where they are shown, then Force values (F7) /
 * Write values (Ctrl+F7) sends all of them in one batch, which the PLC applies at one scan
 * boundary; Unforce (Alt+F7) releases every force the PLC holds. The PLC itself says what is
 * forced (FC 0x4F), so forces set from another PC, a tool or before this login show too.
 *
 * Imperative (store getState) so views, key handlers and the poller can all call it.
 */
import { DEBUG_BATCH_MAX, type DebuggerPort } from '../../middleware/shared/ports/debugger-port'
import { openPLCStoreBase } from '../store'
import type { DebugLeafInfo, DebugPreparedValue, DebugPrepareTarget } from '../store/slices/workspace/types'
import { applySwapToVariableBytes } from '../utils/endian'
import {
  forcedMarksFromPlc,
  indexLeavesByPath,
  nextBoolPreparation,
  planBatches,
  type PreparedMode,
  resolveVariableName,
  sameForces,
  sameMarks,
} from '../utils/forcing'
import { encodeForceValue, parseValueByTypeName } from '../utils/variable-sizes'

export type ForceListRow = { variable: string; value: string }
export type ForceList = { name: string; rows: ForceListRow[] }

const state = () => openPLCStoreBase.getState()

const log = (level: 'info' | 'warning' | 'error', message: string) =>
  state().consoleActions.addLog({ id: crypto.randomUUID(), level, message })

let byPathCache: { leaves: Map<number, DebugLeafInfo>; byPath: Map<string, { index: number; type: string }> } | null =
  null

/** path -> {index, type} of the running program's map (cached per session). */
export function leavesByPath(): Map<string, { index: number; type: string }> {
  const leaves = state().workspace.debugLeaves
  if (!byPathCache || byPathCache.leaves !== leaves) byPathCache = { leaves, byPath: indexLeavesByPath(leaves) }
  return byPathCache.byPath
}

export function programInstances(): { name: string; program: string }[] {
  return state().project.data.configurations.resource.instances.map((i) => ({ name: i.name, program: i.program }))
}

/** The variable behind a composite key (`PLC_PRG:Valve`) or a map path (`EMERGENCYOK`). */
export function targetForKey(key: string): DebugPrepareTarget | null {
  const { debugVariableIndexes, debugLeaves } = state().workspace
  const index = debugVariableIndexes.get(key) ?? leavesByPath().get(key.toUpperCase())?.index
  if (index === undefined) return null
  const leaf = debugLeaves.get(index)
  if (!leaf) return null
  return { path: leaf.path, index, type: leaf.type }
}

/** Prepare a value (null = release the force at F7, undefined = remove the preparation). */
export function setPrepared(target: DebugPrepareTarget, value: string | null | undefined): void {
  const entry: DebugPreparedValue | null =
    value === undefined ? null : { index: target.index, type: target.type, value }
  state().workspaceActions.setDebugPrepared(target.path, entry)
}

/** Prepare the variable behind a key (a menu's "Prepare TRUE / FALSE / release"). */
export function prepareFor(key: string, value: string | null | undefined): void {
  const target = targetForKey(key)
  if (target) setPrepared(target, value)
}

/** A click on a value: a BOOL cycles its preparation, anything else opens the prepare dialog. */
export function clickToPrepare(key: string): void {
  const target = targetForKey(key)
  if (!target || !state().workspace.isDebuggerVisible) return
  if (target.type.toUpperCase() === 'BOOL') {
    setPrepared(target, nextBoolPreparation(state().workspace.debugPrepared.get(target.path)))
  } else {
    state().workspaceActions.setDebugPrepareTarget(target)
  }
}

export function openPrepareDialog(key: string): void {
  const target = targetForKey(key)
  if (target) state().workspaceActions.setDebugPrepareTarget(target)
}

function encodeForTarget(value: string, type: string): Uint8Array {
  const bytes = encodeForceValue(value, type)
  applySwapToVariableBytes(bytes, 0, bytes.length, type, state().workspace.debugTargetEndian)
  return bytes
}

/** One batch, or -- on a PLC that does not take batches -- the same items one by one. */
async function sendItems(
  port: DebuggerPort,
  items: { index: number; op: 'write' | 'force' | 'unforce'; value?: Uint8Array }[],
): Promise<{ ok: boolean; error?: string }> {
  const r = await port.setBatch(items)
  if (r.success) return { ok: true }
  if (!r.unsupported) return { ok: false, error: r.error }
  // An older core: FC 0x42 only knows force / unforce. A write is a force released at once
  // (the program then owns the variable again), as the HMI writes.
  for (const it of items) {
    const res =
      it.op === 'unforce'
        ? await port.setVariable(it.index, false)
        : await port.setVariable(it.index, true, it.value)
    if (!res.success) return { ok: false, error: res.error }
    if (it.op === 'write') await port.setVariable(it.index, false)
  }
  return { ok: true }
}

/** Force values (F7) / Write values (Ctrl+F7): every prepared value, applied together. */
export async function applyPrepared(port: DebuggerPort, mode: PreparedMode): Promise<boolean> {
  const ws = state().workspace
  if (!ws.isDebuggerVisible || !port.isConnected()) {
    log('warning', 'Log in first: values are forced and written on a running PLC.')
    return false
  }
  if (ws.debugPrepared.size === 0) {
    log('info', 'Nothing is prepared. Click a value (or deploy a force list) to prepare it, then F7 / Ctrl+F7.')
    return false
  }
  const plan = planBatches(ws.debugPrepared, mode, encodeForTarget, DEBUG_BATCH_MAX)
  for (const e of plan.errors) log('error', `Not ${mode === 'force' ? 'forced' : 'written'}: ${e}`)
  if (plan.batches.length > 1) {
    log('info', `${plan.used.length} values go in ${plan.batches.length} batches of at most ${DEBUG_BATCH_MAX}: each batch lands in one scan.`)
  }
  for (const batch of plan.batches) {
    const r = await sendItems(port, batch)
    if (!r.ok) {
      log('error', `${mode === 'force' ? 'Force' : 'Write'} values failed: ${r.error ?? 'no answer'}`)
      await refreshPlcForces(port)
      return false
    }
  }
  // Applied: those preparations are used up (CODESYS clears them too).
  const { setDebugPrepared } = state().workspaceActions
  for (const path of plan.used) setDebugPrepared(path, null)
  const forced = plan.batches.flat().filter((i) => i.op === 'force').length
  const released = plan.batches.flat().filter((i) => i.op === 'unforce').length
  log(
    'info',
    mode === 'force'
      ? `Forced ${forced} value(s)${released ? `, released ${released}` : ''}.`
      : `Wrote ${plan.used.length} value(s) once; the program may change them again.`,
  )
  await refreshPlcForces(port)
  return true
}

/** Unforce (Alt+F7): release these paths, or every force the PLC holds. */
export async function releaseForces(port: DebuggerPort, paths?: string[]): Promise<boolean> {
  const ws = state().workspace
  if (!port.isConnected()) return false
  const byPath = leavesByPath()
  let targets: number[]
  if (paths) {
    targets = paths.map((p) => byPath.get(p)?.index).filter((i): i is number => i !== undefined)
  } else if (ws.debugPlcForces) {
    targets = [...ws.debugPlcForces.keys()].map((p) => byPath.get(p)?.index).filter((i): i is number => i !== undefined)
  } else {
    // The PLC cannot list its forces: release what this editor forced.
    targets = [...new Set([...ws.debugForcedVariables.keys()].map((k) => ws.debugVariableIndexes.get(k)))].filter(
      (i): i is number => i !== undefined,
    )
  }
  if (targets.length === 0) {
    log('info', 'Nothing is forced.')
    return true
  }
  for (let i = 0; i < targets.length; i += DEBUG_BATCH_MAX) {
    const r = await sendItems(
      port,
      targets.slice(i, i + DEBUG_BATCH_MAX).map((index) => ({ index, op: 'unforce' as const })),
    )
    if (!r.ok) {
      log('error', `Unforce failed: ${r.error ?? 'no answer'}`)
      return false
    }
  }
  if (!ws.debugPlcForces) state().workspaceActions.setDebugForcedVariables(new Map())
  log('info', `Released ${targets.length} force(s). Each variable keeps its value until the program or its input changes it.`)
  await refreshPlcForces(port)
  return true
}

/** Ask the PLC what it holds forced, and mark it everywhere. */
export async function refreshPlcForces(port: DebuggerPort): Promise<void> {
  if (!port.isConnected()) return
  const r = await port.listForced()
  const ws = state().workspace
  const actions = state().workspaceActions
  if (!r.success) {
    // An older core or program: only this editor's own forces are known.
    if (r.unsupported && ws.debugPlcForces !== null) actions.setDebugPlcForces(null)
    return
  }
  const forces = new Map<string, string>()
  for (const item of r.items) {
    const leaf = ws.debugLeaves.get(item.index)
    if (!leaf) continue
    const bytes = new Uint8Array(item.value)
    try {
      applySwapToVariableBytes(bytes, 0, bytes.length, leaf.type, ws.debugTargetEndian)
      forces.set(leaf.path, parseValueByTypeName(bytes, 0, leaf.type).value)
    } catch {
      forces.set(leaf.path, '?')
    }
  }
  if (!sameForces(ws.debugPlcForces, forces)) actions.setDebugPlcForces(forces)
  const marks = forcedMarksFromPlc(forces, leavesByPath(), ws.debugVariableIndexes)
  if (!sameMarks(ws.debugForcedVariables, marks)) actions.setDebugForcedVariables(marks)
}

/**
 * Deploy a force list: prepare every row, exactly as if each variable had been clicked and
 * its value typed. Nothing is sent: F7 forces them, Ctrl+F7 writes them. Deploying again
 * changes nothing that is already prepared the same way.
 */
export function deployForceList(list: ForceList): { prepared: number; missing: string[] } {
  if (state().workspace.debugLeaves.size === 0) {
    log('warning', `Log in first: "${list.name}" is prepared on the running program.`)
    return { prepared: 0, missing: [] }
  }
  const byPath = leavesByPath()
  const instances = programInstances()
  const missing: string[] = []
  let prepared = 0
  for (const row of list.rows) {
    const hit = resolveVariableName(row.variable, byPath, instances)
    if (!hit) {
      missing.push(row.variable)
      continue
    }
    setPrepared({ path: hit.path, index: hit.index, type: hit.type }, row.value.trim())
    prepared++
  }
  log(
    missing.length ? 'warning' : 'info',
    `Force list "${list.name}": ${prepared} value(s) prepared -- F7 forces them, Ctrl+F7 writes them.` +
      (missing.length ? ` Not in the running program: ${missing.join(', ')}.` : ''),
  )
  return { prepared, missing }
}
