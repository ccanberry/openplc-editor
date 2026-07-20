/**
 * Online-debugger run control (breakpoints + pause/continue/step).
 *
 * Two concerns, two hooks:
 *
 * - `useRunControlSync()` — mount ONCE alongside `useDebugPolling`.  It (a)
 *   keeps the runtime's armed breakpoint set in lockstep with the editor's
 *   placed breakpoints (resolving `<pou>:<line>` keys → STruC++ checkpoint
 *   ids via the checkpoint map), and (b) polls the target's halt state
 *   (STOPINFO) so the UI's stopped/running indicator and current-line
 *   highlight stay live.
 *
 * - `useRunControlActions()` — the toolbar's button handlers.
 *
 * Run control only exists on a debug build (one compiled with
 * `debugCheckpoints`, which emits `checkpoint-map.json`).  With no map loaded
 * the sync hook stays inert, so a normal deploy sees no breakpoint traffic.
 *
 * Not platform-gated: everything routes through `DebuggerPort`, so the same
 * hooks drive the desktop editor (IPC → Modbus/WS) and the web edition.
 */

import { useCallback, useEffect, useRef } from 'react'

import { useDebugger } from '../../middleware/shared/providers'
import { openPLCStoreBase, useOpenPLCStore } from '../store'
import { resolveBreakpointIds } from '../utils/debug-breakpoints'

/** Halt-state poll cadence.  Fast enough that a breakpoint hit feels
 *  immediate, cheap enough (one tiny PDU) to sit next to variable polling. */
const STOPINFO_POLL_INTERVAL_MS = 150

export function useRunControlSync(): void {
  const debuggerPort = useDebugger()
  const isDebuggerVisible = useOpenPLCStore((s) => s.workspace.isDebuggerVisible)
  const debugBreakpoints = useOpenPLCStore((s) => s.workspace.debugBreakpoints)
  const debugCheckpointMap = useOpenPLCStore((s) => s.workspace.debugCheckpointMap)
  const workspaceActions = useOpenPLCStore((s) => s.workspaceActions)

  // Arm the resolved checkpoint-id set whenever placement or the map changes.
  // An empty map means this isn't a debug build → send nothing.
  useEffect(() => {
    if (!isDebuggerVisible || debugCheckpointMap.length === 0) return
    const ids = resolveBreakpointIds(debugBreakpoints, debugCheckpointMap)
    void debuggerPort.setBreakpoints(ids)
  }, [isDebuggerVisible, debugBreakpoints, debugCheckpointMap, debuggerPort])

  // Poll STOPINFO while a debug build's session is live.  Written through a
  // ref so the interval never re-arms on callback identity churn.
  const pollRef = useRef<() => Promise<void>>(async () => {})
  pollRef.current = useCallback(async () => {
    const info = await debuggerPort.getStopInfo()
    if (!info.success) return
    const nextHalted = info.stopped ?? false
    const nextId = nextHalted ? (info.checkpointId ?? null) : null
    const { debugHalted, debugStoppedCheckpointId } = openPLCStoreBase.getState().workspace
    if (nextHalted !== debugHalted || nextId !== debugStoppedCheckpointId) {
      workspaceActions.setDebugHalt(nextHalted, nextId)
    }
  }, [debuggerPort, workspaceActions])

  const isPollingRef = useRef(false)
  useEffect(() => {
    if (!isDebuggerVisible || debugCheckpointMap.length === 0) return

    const tick = () => {
      if (isPollingRef.current) return
      isPollingRef.current = true
      void pollRef.current().finally(() => {
        isPollingRef.current = false
      })
    }
    const intervalId = window.setInterval(tick, STOPINFO_POLL_INTERVAL_MS)

    return () => {
      clearInterval(intervalId)
      // Leaving the session: drop the halt flag so the UI reads "running".
      workspaceActions.setDebugHalt(false, null)
    }
  }, [isDebuggerVisible, debugCheckpointMap.length, workspaceActions])
}

export interface RunControlActions {
  /** Resume from a halt.  Optimistically marks running; the poll reconciles. */
  continueExec: () => Promise<void>
  /** Halt at the next checkpoint reached by any task. */
  pause: () => Promise<void>
  /** Advance exactly one checkpoint, then re-halt. */
  step: () => Promise<void>
  /** Remove every placed breakpoint (also disarms them on the runtime via sync). */
  clearAllBreakpoints: () => void
}

export function useRunControlActions(): RunControlActions {
  const debuggerPort = useDebugger()
  const workspaceActions = useOpenPLCStore((s) => s.workspaceActions)

  const continueExec = useCallback(async () => {
    workspaceActions.setDebugHalt(false, null)
    await debuggerPort.runControl('continue')
  }, [debuggerPort, workspaceActions])

  const pause = useCallback(async () => {
    await debuggerPort.runControl('pause')
  }, [debuggerPort])

  const step = useCallback(async () => {
    await debuggerPort.runControl('step')
  }, [debuggerPort])

  const clearAllBreakpoints = useCallback(() => {
    workspaceActions.clearBreakpoints()
  }, [workspaceActions])

  return { continueExec, pause, step, clearAllBreakpoints }
}
