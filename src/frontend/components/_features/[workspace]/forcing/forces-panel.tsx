/**
 * Forces -- everything the PLC holds forced (CODESYS "Watch all forces"), whoever forced it:
 * this editor, another PC, a tool, a session before this one. Read from the PLC (FC 0x4F).
 */
import { useMemo, useState } from 'react'

import { useDebugger } from '../../../../../middleware/shared/providers'
import { openPrepareDialog, releaseForces } from '../../../../services/forcing'
import { useOpenPLCStore } from '../../../../store'
import { displayNameForPath, globalNameMap } from '../../../../utils/forcing'

const cmd =
  'h-6 rounded-md px-2 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40 bg-neutral-100 text-neutral-1000 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800'

const ForcesPanel = () => {
  const port = useDebugger()
  const plcForces = useOpenPLCStore((s) => s.workspace.debugPlcForces)
  const localForces = useOpenPLCStore((s) => s.workspace.debugForcedVariables)
  const bools = useOpenPLCStore((s) => s.workspace.debugBoolValues)
  const others = useOpenPLCStore((s) => s.workspace.debugNonBoolValues)
  const instances = useOpenPLCStore((s) => s.project.data.configurations.resource.instances)
  const globals = useOpenPLCStore((s) => s.project.data.configurations.resource.globalVariables)
  const globalNames = useMemo(() => globalNameMap(globals), [globals])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  if (!plcForces) {
    return (
      <div className='flex flex-col gap-2 p-2 text-xs text-neutral-600 dark:text-neutral-400'>
        <p>
          The PLC cannot list its forces (its core is older than 1.8.0, or the program was built before it). Only what
          this editor forced is known:
        </p>
        {[...localForces.keys()].map((k) => (
          <div key={k} className='font-mono'>
            {k}
          </div>
        ))}
      </div>
    )
  }

  const rows = [...plcForces.entries()].sort(([a], [b]) => a.localeCompare(b))
  const toggle = (path: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(path)) n.delete(path)
      else n.add(path)
      return n
    })

  return (
    <div className='flex h-full min-h-0 w-full flex-col gap-2 text-xs'>
      <div className='flex items-center gap-2'>
        <button
          className={cmd}
          disabled={selected.size === 0}
          onClick={() => void releaseForces(port, [...selected]).then(() => setSelected(new Set()))}
        >
          Unforce selected
        </button>
        <button className={cmd} disabled={rows.length === 0} onClick={() => void releaseForces(port)}>
          Unforce all
        </button>
        <span className='text-neutral-500'>
          {rows.length === 0 ? 'Nothing is forced on the PLC.' : `${rows.length} forced on the PLC`}
        </span>
      </div>
      <div className='min-h-0 flex-1 overflow-auto'>
        <table className='w-full border-collapse'>
          <thead className='sticky top-0 bg-white text-left text-neutral-500 dark:bg-neutral-950'>
            <tr>
              <th className='w-6' />
              <th className='px-2 py-1 font-medium'>Variable</th>
              <th className='px-2 py-1 font-medium'>Forced to</th>
              <th className='px-2 py-1 font-medium'>Live</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([path, value]) => (
              <tr key={path} className='border-t border-neutral-100 dark:border-neutral-850'>
                <td className='px-1'>
                  <input type='checkbox' checked={selected.has(path)} onChange={() => toggle(path)} />
                </td>
                <td
                  className='cursor-pointer px-2 py-1 font-mono hover:underline'
                  onClick={() => openPrepareDialog(path)}
                  title='Prepare another value or a release'
                >
                  {displayNameForPath(path, instances, globalNames)}
                </td>
                <td className='px-2 py-1 font-mono font-semibold text-orange-500'>{value}</td>
                <td className='px-2 py-1 font-mono'>{bools.get(path) ?? others.get(path) ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export { ForcesPanel }
