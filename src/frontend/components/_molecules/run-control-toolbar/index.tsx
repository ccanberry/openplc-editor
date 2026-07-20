/**
 * Run-control toolbar — the CoDeSys-style pause / continue / step / clear
 * strip that floats over the ST/IL editor during a debug session.
 *
 * Renders only for a debug build's live session (checkpoint map present).
 * State is read from the workspace store; the button handlers come from
 * `useRunControlActions`, which route through `DebuggerPort` to the runtime's
 * run-control PDUs (FC 0x47-0x4A).  The current-line highlight itself lives in
 * the Monaco gutter effect — this is the command surface + status readout.
 */

import { useCallback } from 'react'

import { PauseIcon } from '../../../assets/icons/interface/Pause'
import { PlayIcon } from '../../../assets/icons/interface/Play'
import { StickArrowIcon } from '../../../assets/icons/interface/StickArrow'
import { TrashCanIcon } from '../../../assets/icons/interface/TrashCan'
import { useRunControlActions } from '../../../hooks/useRunControl'
import { useOpenPLCStore } from '../../../store'
import { checkpointLocation } from '../../../utils/debug-breakpoints'

function IconButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type='button'
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className='flex h-6 w-6 items-center justify-center rounded outline-none transition-opacity hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-neutral-800'
    >
      {children}
    </button>
  )
}

export function RunControlToolbar() {
  const isDebuggerVisible = useOpenPLCStore((s) => s.workspace.isDebuggerVisible)
  const debugCheckpointMap = useOpenPLCStore((s) => s.workspace.debugCheckpointMap)
  const debugBreakpoints = useOpenPLCStore((s) => s.workspace.debugBreakpoints)
  const debugHalted = useOpenPLCStore((s) => s.workspace.debugHalted)
  const debugStoppedCheckpointId = useOpenPLCStore((s) => s.workspace.debugStoppedCheckpointId)
  const { continueExec, pause, step, clearAllBreakpoints } = useRunControlActions()

  const onContinue = useCallback(() => void continueExec(), [continueExec])
  const onPause = useCallback(() => void pause(), [pause])
  const onStep = useCallback(() => void step(), [step])

  // Only a debug build (checkpoint map loaded) exposes run control.
  if (!isDebuggerVisible || debugCheckpointMap.length === 0) return null

  const haltLoc =
    debugHalted && debugStoppedCheckpointId !== null
      ? checkpointLocation(debugCheckpointMap, debugStoppedCheckpointId)
      : null

  return (
    <div className='absolute right-3 top-2 z-20 flex items-center gap-1 rounded-md border border-neutral-200 bg-white/95 px-2 py-1 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/95'>
      <span
        className={`mr-1 inline-flex items-center gap-1 text-cp-sm font-medium ${
          debugHalted ? 'text-amber-500' : 'text-green-600 dark:text-green-500'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${debugHalted ? 'bg-amber-500' : 'bg-green-500'}`} />
        {debugHalted ? (haltLoc ? `Halted @ ${haltLoc.pou}:${haltLoc.line}` : 'Halted') : 'Running'}
      </span>

      <IconButton title='Continue (resume execution)' disabled={!debugHalted} onClick={onContinue}>
        <PlayIcon fill={debugHalted ? '#22c55e' : '#9ca3af'} className='h-3 w-3' />
      </IconButton>
      <IconButton title='Pause (halt at next checkpoint)' disabled={debugHalted} onClick={onPause}>
        <PauseIcon className='h-3 w-3' />
      </IconButton>
      <IconButton title='Step (advance one checkpoint)' disabled={!debugHalted} onClick={onStep}>
        <StickArrowIcon direction='right' className='h-3 w-3 stroke-neutral-700 dark:stroke-neutral-200' />
      </IconButton>

      <span className='mx-1 h-4 w-px bg-neutral-200 dark:bg-neutral-700' />

      <IconButton
        title='Remove all breakpoints'
        disabled={debugBreakpoints.length === 0}
        onClick={clearAllBreakpoints}
      >
        <TrashCanIcon className='h-3.5 w-3.5 stroke-neutral-700 dark:stroke-neutral-200' />
      </IconButton>
    </div>
  )
}
