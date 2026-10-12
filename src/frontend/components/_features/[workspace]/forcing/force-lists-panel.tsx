/**
 * Force lists -- named sets of variables and values carried with the project (project.json).
 * Deploy prepares every row while logged in, exactly as if each variable had been clicked and
 * its value typed; nothing reaches the PLC until F7 (force) or Ctrl+F7 (write). Deploying a
 * list that is already prepared changes nothing.
 */
import { useEffect, useMemo, useState } from 'react'

import type { PLCForceList } from '../../../../../middleware/shared/ports/types'
import { deployForceList } from '../../../../services/forcing'
import { useOpenPLCStore } from '../../../../store'
import { cn } from '../../../../utils/cn'
import { forceableNames, globalNameMap, indexLeavesByPath, preparedLabel, resolveVariableName } from '../../../../utils/forcing'

const cmd =
  'h-6 rounded-md px-2 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40 bg-neutral-100 text-neutral-1000 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800'
const cell =
  'w-full rounded border border-transparent bg-transparent px-1 py-0.5 font-mono outline-none hover:border-neutral-300 focus:border-brand dark:hover:border-neutral-700'

const EMPTY: PLCForceList[] = []

const ForceListsPanel = () => {
  const lists = useOpenPLCStore((s) => s.project.data.forceLists ?? EMPTY)
  const setForceLists = useOpenPLCStore((s) => s.projectActions.setForceLists)
  const markDirty = useOpenPLCStore((s) => s.sharedWorkspaceActions.handleFileAndWorkspaceSavedState)
  const loggedIn = useOpenPLCStore((s) => s.workspace.isDebuggerVisible)
  const leaves = useOpenPLCStore((s) => s.workspace.debugLeaves)
  const prepared = useOpenPLCStore((s) => s.workspace.debugPrepared)
  const plcForces = useOpenPLCStore((s) => s.workspace.debugPlcForces)
  const bools = useOpenPLCStore((s) => s.workspace.debugBoolValues)
  const others = useOpenPLCStore((s) => s.workspace.debugNonBoolValues)
  const instances = useOpenPLCStore((s) => s.project.data.configurations.resource.instances)
  const globals = useOpenPLCStore((s) => s.project.data.configurations.resource.globalVariables)
  const setExtraKeys = useOpenPLCStore((s) => s.workspaceActions.setDebugExtraKeys)
  const [current, setCurrent] = useState(0)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [newVariable, setNewVariable] = useState('')

  const list = lists[Math.min(current, lists.length - 1)] as PLCForceList | undefined
  const byPath = useMemo(() => indexLeavesByPath(leaves), [leaves])
  const names = useMemo(
    () => (loggedIn ? forceableNames(leaves, instances, globalNameMap(globals)) : []),
    [loggedIn, leaves, instances, globals],
  )
  const resolved = useMemo(
    () => (list ? list.rows.map((r) => (loggedIn ? resolveVariableName(r.variable, byPath, instances) : null)) : []),
    [list, loggedIn, byPath, instances],
  )

  // The shown list's variables are polled, so their live values show.
  useEffect(() => {
    setExtraKeys('force-list', resolved.filter((r) => r !== null).map((r) => r.path))
    return () => setExtraKeys('force-list', [])
  }, [resolved, setExtraKeys])

  const save = (next: PLCForceList[]) => {
    setForceLists(next)
    markDirty('Resource')
  }
  const updateList = (fn: (l: PLCForceList) => PLCForceList) => {
    if (!list) return
    const i = lists.indexOf(list)
    save(lists.map((l, k) => (k === i ? fn(l) : l)))
  }
  const addList = () => {
    let n = lists.length + 1
    while (lists.some((l) => l.name === `Force list ${n}`)) n++
    save([...lists, { name: `Force list ${n}`, rows: [] }])
    setCurrent(lists.length)
  }
  const deleteList = (i: number) => {
    if (!window.confirm(`Delete the force list "${lists[i].name}" from the project?`)) return
    save(lists.filter((_, k) => k !== i))
    setCurrent(Math.max(0, i - 1))
  }
  const addRow = () => {
    const v = newVariable.trim()
    if (!v) return
    updateList((l) => ({ ...l, rows: [...l.rows, { variable: v, value: '' }] }))
    setNewVariable('')
  }

  return (
    <div className='flex h-full min-h-0 w-full gap-3 text-xs'>
      <div className='flex w-48 shrink-0 flex-col gap-1 overflow-auto border-r border-neutral-200 pr-2 dark:border-neutral-850'>
        {lists.map((l, i) =>
          renaming === i ? (
            <input
              key={i}
              autoFocus
              defaultValue={l.name}
              className={cell}
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (name && !lists.some((o, k) => k !== i && o.name === name))
                  save(lists.map((o, k) => (k === i ? { ...o, name } : o)))
                setRenaming(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <div
              key={i}
              className={cn(
                'group flex cursor-pointer items-center justify-between rounded px-2 py-1',
                l === list ? 'bg-blue-500 text-white' : 'hover:bg-neutral-100 dark:hover:bg-neutral-900',
              )}
              onClick={() => setCurrent(i)}
              onDoubleClick={() => setRenaming(i)}
              title='Double-click to rename'
            >
              <span className='truncate'>
                {l.name} <span className='opacity-60'>({l.rows.length})</span>
              </span>
              <button
                className='hidden px-1 group-hover:block'
                onClick={(e) => {
                  e.stopPropagation()
                  deleteList(i)
                }}
                title='Delete this list'
              >
                ×
              </button>
            </div>
          ),
        )}
        <button className={cmd} onClick={addList}>
          + New list
        </button>
      </div>

      {list ? (
        <div className='flex min-h-0 flex-1 flex-col gap-2'>
          <div className='flex items-center gap-2'>
            <button
              className={cn(cmd, loggedIn && list.rows.length > 0 && 'bg-blue-500 text-white hover:bg-blue-600')}
              disabled={!loggedIn || list.rows.length === 0}
              onClick={() => deployForceList(list)}
              title={loggedIn ? 'Prepare every row; then F7 forces them, Ctrl+F7 writes them' : 'Log in first'}
            >
              Deploy
            </button>
            <span className='text-neutral-500'>
              {loggedIn
                ? 'Deploy prepares these values; F7 forces them, Ctrl+F7 writes them.'
                : 'Log in to deploy. The list is saved with the project.'}
            </span>
          </div>
          <div className='min-h-0 flex-1 overflow-auto'>
            <table className='w-full border-collapse'>
              <thead className='sticky top-0 bg-white text-left text-neutral-500 dark:bg-neutral-950'>
                <tr>
                  <th className='px-2 py-1 font-medium'>Variable</th>
                  <th className='w-40 px-2 py-1 font-medium'>Value</th>
                  {loggedIn && <th className='w-28 px-2 py-1 font-medium'>Live</th>}
                  {loggedIn && <th className='w-32 px-2 py-1 font-medium'>State</th>}
                  <th className='w-6' />
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row, i) => {
                  const hit = resolved[i]
                  const live = hit ? (bools.get(hit.path) ?? others.get(hit.path) ?? '') : ''
                  const state = !loggedIn
                    ? ''
                    : !hit
                      ? 'not in the program'
                      : [plcForces?.has(hit.path) ? `forced ${plcForces.get(hit.path)}` : '', preparedLabel(prepared.get(hit.path))]
                          .filter(Boolean)
                          .join(' ')
                  return (
                    <tr key={i} className='border-t border-neutral-100 dark:border-neutral-850'>
                      <td className='px-1'>
                        <input
                          className={cell}
                          list='force-list-names'
                          value={row.variable}
                          onChange={(e) =>
                            updateList((l) => ({
                              ...l,
                              rows: l.rows.map((r, k) => (k === i ? { ...r, variable: e.target.value } : r)),
                            }))
                          }
                        />
                      </td>
                      <td className='px-1'>
                        <input
                          className={cell}
                          value={row.value}
                          placeholder={hit?.type === 'BOOL' ? 'TRUE / FALSE' : hit?.type}
                          onChange={(e) =>
                            updateList((l) => ({
                              ...l,
                              rows: l.rows.map((r, k) => (k === i ? { ...r, value: e.target.value } : r)),
                            }))
                          }
                        />
                      </td>
                      {loggedIn && <td className='px-2 font-mono'>{live}</td>}
                      {loggedIn && (
                        <td className={cn('px-2 font-mono', !hit ? 'text-red-500' : 'text-orange-500')}>{state}</td>
                      )}
                      <td>
                        <button
                          className='px-1 text-neutral-500 hover:text-red-500'
                          onClick={() => updateList((l) => ({ ...l, rows: l.rows.filter((_, k) => k !== i) }))}
                          title='Remove this row'
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
                <tr className='border-t border-neutral-100 dark:border-neutral-850'>
                  <td className='px-1' colSpan={2}>
                    <input
                      className={cell}
                      list='force-list-names'
                      placeholder='+ variable (a global, or PLC_PRG.variable) -- Enter'
                      value={newVariable}
                      onChange={(e) => setNewVariable(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addRow()}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <datalist id='force-list-names'>
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
        </div>
      ) : (
        <div className='flex flex-1 items-center text-neutral-500'>
          No force list yet. A force list keeps variables and values with the project; deploy it while logged in to
          prepare them all at once.
        </div>
      )}
    </div>
  )
}

export { ForceListsPanel }
