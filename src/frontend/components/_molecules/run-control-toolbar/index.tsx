/**
 * Run-control toolbar — the CoDeSys-style pause / continue / step / clear
 * strip that floats over the ST/IL editor during a debug session.
 *
 * Renders while logged in. The run-control buttons need a debug build (checkpoint map present);
 * the Live values switch and its period are there for every session.
 * State is read from the workspace store; the button handlers come from
 * `useRunControlActions`, which route through `DebuggerPort` to the runtime's
 * run-control PDUs (FC 0x47-0x4A).  The current-line highlight itself lives in
 * the Monaco gutter effect — this is the command surface + status readout.
 */

import { useCallback, useState } from 'react'

import { PauseIcon } from '../../../assets/icons/interface/Pause'
import { PlayIcon } from '../../../assets/icons/interface/Play'
import { StickArrowIcon } from '../../../assets/icons/interface/StickArrow'
import { TrashCanIcon } from '../../../assets/icons/interface/TrashCan'
import { useRunControlActions } from '../../../hooks/useRunControl'
import { isFollowBreakpointOn, setFollowBreakpoint } from '../../../services/follow-breakpoint'
import {
  LIVE_PERIOD_MAX,
  LIVE_PERIOD_MIN,
  setLivePeriod,
  setLiveValuesOn,
  useLivePeriod,
  useLiveValuesOn,
} from '../../../services/live-values'
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

  // Follow the breakpoint (default on): a stop opens its POU with the cursor on the line.
  const [follow, setFollow] = useState(isFollowBreakpointOn)
  const toggleFollow = useCallback(() => {
    setFollow((f) => {
      setFollowBreakpoint(!f)
      return !f
    })
  }, [])

  const onContinue = useCallback(() => void continueExec(), [continueExec])
  const onPause = useCallback(() => void pause(), [pause])
  const onStep = useCallback(() => void step(), [step])

  // Live values: on/off and the read period (0.1-1.0 s), kept per user.
  const liveOn = useLiveValuesOn()
  const livePeriod = useLivePeriod()
  const [periodText, setPeriodText] = useState<string | null>(null)
  const commitPeriod = useCallback((text: string) => {
    setLivePeriod(text)
    setPeriodText(null)
  }, [])

  if (!isDebuggerVisible) return null
  // Only a debug build (checkpoint map loaded) exposes run control.
  const hasRunControl = debugCheckpointMap.length > 0

  const liveControls = (
    <>
      <label
        className='flex cursor-pointer select-none items-center gap-1 text-cp-sm text-neutral-700 dark:text-neutral-300'
        title='Show the live value after each variable in the code. Off, they are not read from the PLC; hover still shows values.'
      >
        <input type='checkbox' checked={liveOn} onChange={() => setLiveValuesOn(!liveOn)} />
        Live values
      </label>
      <input
        type='number'
        aria-label='Live values period in seconds'
        title={`How often the values are read, ${LIVE_PERIOD_MIN} to ${LIVE_PERIOD_MAX} s`}
        min={LIVE_PERIOD_MIN}
        max={LIVE_PERIOD_MAX}
        step={0.1}
        disabled={!liveOn}
        value={periodText ?? livePeriod.toFixed(1)}
        onChange={(e) => setPeriodText(e.target.value)}
        onBlur={(e) => commitPeriod(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitPeriod((e.target as HTMLInputElement).value)
        }}
        className='h-5 w-12 rounded border border-neutral-300 bg-transparent px-1 text-cp-sm text-neutral-700 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300'
      />
      <span className='text-cp-sm text-neutral-500'>s</span>
    </>
  )

  if (!hasRunControl) {
    return (
      <div className='absolute right-3 top-2 z-20 flex items-center gap-1 rounded-md border border-neutral-200 bg-white/95 px-2 py-1 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/95'>
        {liveControls}
      </div>
    )
  }

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

      <label
        className='flex cursor-pointer select-none items-center gap-1 text-cp-sm text-neutral-700 dark:text-neutral-300'
        title='When the PLC stops at a breakpoint, open its POU and put the cursor on the line'
      >
        <input type='checkbox' checked={follow} onChange={toggleFollow} />
        Follow
      </label>

      <span className='mx-1 h-4 w-px bg-neutral-200 dark:bg-neutral-700' />

      {liveControls}

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
