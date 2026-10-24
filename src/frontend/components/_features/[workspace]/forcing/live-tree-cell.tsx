/**
 * A variable table's Value cell while logged in, for a variable that may be complex: a plain
 * variable shows its live value (LiveValueCell); an array or an FB instance shows a toggle that
 * opens its elements or members, each with its live value, nested for arrays of FBs. Collapsed by
 * default; what is opened stays open for the session (services/live-tree).
 */
import { useEffect, useMemo } from 'react'

import { leavesByPath } from '../../../../services/forcing'
import { toggleLiveTree, useLiveTreeExpanded } from '../../../../services/live-tree'
import { useOpenPLCStore } from '../../../../store'
import { debugChildren } from '../../../../utils/debug-children'
import { LiveValueCell } from './live-value-cell'

/** Upper-case leaf paths of the logged-in program's debug map (re-read when the map changes). */
function useLeafPaths(): string[] {
  const leaves = useOpenPLCStore((s) => s.workspace.debugLeaves)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => Array.from(leavesByPath().keys()), [leaves])
}

const LiveTreeNode = ({ path, label, depth }: { path: string; label: string; depth: number }) => {
  const open = useLiveTreeExpanded(path)
  const leafPaths = useLeafPaths()
  const children = useMemo(() => (open ? debugChildren(leafPaths, path) : []), [open, leafPaths, path])
  const setExtraKeys = useOpenPLCStore((s) => s.workspaceActions.setDebugExtraKeys)

  // Poll only what is open: this node's own values, while it is open.
  useEffect(() => {
    const id = `live-tree:${path}`
    setExtraKeys(
      id,
      children.filter((c) => !c.complex).map((c) => c.path),
    )
    return () => setExtraKeys(id, [])
  }, [children, path, setExtraKeys])

  return (
    <div className='flex w-full flex-col'>
      <button
        type='button'
        className='flex items-center gap-1 px-2 text-left font-mono text-xs text-neutral-700 hover:underline dark:text-neutral-300'
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={(e) => {
          e.stopPropagation()
          toggleLiveTree(path)
        }}
        aria-expanded={open}
        title={open ? 'Close' : 'Open its elements / members'}
      >
        <span className='inline-block w-3 text-center'>{open ? '▾' : '▸'}</span>
        <span>{label}</span>
      </button>
      {children.map((c) =>
        c.complex ? (
          <LiveTreeNode key={c.path} path={c.path} label={c.label} depth={depth + 1} />
        ) : (
          <div key={c.path} className='flex items-center' style={{ paddingLeft: 20 + depth * 12 }}>
            <span className='w-14 shrink-0 truncate font-mono text-xs text-neutral-500'>{c.label}</span>
            <LiveValueCell variableKey={c.path} />
          </div>
        ),
      )}
    </div>
  )
}

/** `variableKey`: the variable's map path (a global's name in upper case). */
const LiveTreeCell = ({ variableKey }: { variableKey: string }) => {
  const leafPaths = useLeafPaths()
  const path = variableKey.toUpperCase()
  // a variable with a value of its own is a leaf; one without, but with elements, is complex
  const count = useMemo(
    () => (leavesByPath().has(path) ? 0 : debugChildren(leafPaths, path).length),
    [leafPaths, path],
  )
  if (count === 0) return <LiveValueCell variableKey={variableKey} />
  return <LiveTreeNode path={path} label={`${count} ${count === 1 ? 'item' : 'items'}`} depth={0} />
}

export { LiveTreeCell }
