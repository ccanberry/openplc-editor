/**
 * A variable table's Value cell while logged in: the live value, an F when the PLC holds it
 * forced, the prepared value; a click prepares it (BOOL: <TRUE> / <FALSE> / none, anything
 * else: the prepare dialog). Used by the resource's global variables and the POU tables.
 */
import { useForceMark } from '../../../../hooks/use-debug-value'
import { clickToPrepare } from '../../../../services/forcing'
import { useOpenPLCStore } from '../../../../store'
import { cn } from '../../../../utils/cn'

const LiveValueCell = ({ variableKey }: { variableKey: string }) => {
  const mark = useForceMark(variableKey)
  const value = useOpenPLCStore((s) => {
    const key = mark.path ?? variableKey
    return s.workspace.debugBoolValues.get(key) ?? s.workspace.debugNonBoolValues.get(key)
  })
  if (!mark.path) return <span className='px-2 text-neutral-400'>—</span>
  return (
    <button
      type='button'
      className={cn(
        'flex w-full items-center gap-1 truncate px-2 text-left font-mono text-xs hover:underline',
        mark.forced && 'font-semibold text-orange-500',
      )}
      onClick={(e) => {
        e.stopPropagation()
        clickToPrepare(mark.path ?? variableKey)
      }}
      title='Click to prepare a value: F7 forces it, Ctrl+F7 writes it'
    >
      <span>{value ?? '…'}</span>
      {mark.forced && <span className='rounded bg-orange-500 px-1 text-[9px] text-white'>F</span>}
      {mark.prepared && <span className='text-blue-500'>{mark.prepared}</span>}
    </button>
  )
}

export { LiveValueCell }
