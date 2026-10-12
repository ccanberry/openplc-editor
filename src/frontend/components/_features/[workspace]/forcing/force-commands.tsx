/**
 * Write values (Ctrl+F7), Force values (F7), Unforce (Alt+F7) -- the CODESYS keys and
 * buttons -- and the counter of what is prepared and what the PLC holds forced.
 */
import { useEffect } from 'react'

import { useDebugger } from '../../../../../middleware/shared/providers'
import { applyPrepared, releaseForces } from '../../../../services/forcing'
import { useOpenPLCStore } from '../../../../store'
import { cn } from '../../../../utils/cn'

/** Global F7 / Ctrl+F7 / Alt+F7 while logged in. */
export function useForceShortcuts(): void {
  const port = useDebugger()
  const visible = useOpenPLCStore((s) => s.workspace.isDebuggerVisible)
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F7') return
      e.preventDefault()
      if (e.altKey) void releaseForces(port)
      else void applyPrepared(port, e.ctrlKey || e.metaKey ? 'write' : 'force')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, port])
}

const cmd =
  'h-6 rounded-md px-2 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40 bg-neutral-100 text-neutral-1000 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800'

const ForceCommands = () => {
  const port = useDebugger()
  const prepared = useOpenPLCStore((s) => s.workspace.debugPrepared.size)
  const plcForces = useOpenPLCStore((s) => s.workspace.debugPlcForces)
  const localForces = useOpenPLCStore((s) => s.workspace.debugForcedVariables.size)
  const clearPrepared = useOpenPLCStore((s) => s.workspaceActions.clearDebugPrepared)
  const forced = plcForces ? plcForces.size : localForces

  return (
    <div className='flex items-center gap-2'>
      <span className='text-[11px] text-neutral-500'>{prepared} prepared</span>
      {forced > 0 && (
        <span
          className='rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white'
          title={plcForces ? 'Forced on the PLC' : 'Forced from this editor (the PLC cannot list its forces)'}
        >
          FORCED {forced}
        </span>
      )}
      <button className={cmd} disabled={prepared === 0} onClick={() => void applyPrepared(port, 'write')} title='Ctrl+F7'>
        Write
      </button>
      <button
        className={cn(cmd, prepared > 0 && 'bg-orange-500 text-white hover:bg-orange-600 dark:bg-orange-600')}
        disabled={prepared === 0}
        onClick={() => void applyPrepared(port, 'force')}
        title='F7'
      >
        Force
      </button>
      <button className={cmd} disabled={forced === 0} onClick={() => void releaseForces(port)} title='Alt+F7'>
        Unforce all
      </button>
      <button className={cmd} disabled={prepared === 0} onClick={clearPrepared} title='Forget every prepared value'>
        Clear prepared
      </button>
    </div>
  )
}

export { ForceCommands }
