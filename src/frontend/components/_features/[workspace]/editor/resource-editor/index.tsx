import { useOpenPLCStore } from '../../../../../store'
import { DEFAULT_GVL, gvlFromPath } from '../../../../../utils/global-variable-lists'
import { GlobalVariablesEditor } from '../../../../_organisms/global-variables-editor'
import { InstancesEditor } from '../../../../_organisms/instances-editor'
import { TaskEditor } from '../../../../_organisms/task-editor'

/** The tab of a project from before GVLs: it opens the default GVL. */
export const GLOBAL_VARIABLES_TAB = 'Global Variables'

/** A GVL tab (CODESYS: a global variable list object), or the Resource tab: tasks and program
 *  instances. Both are views of the one resource. */
const ResourcesEditor = () => {
  const name = useOpenPLCStore((s) => s.editor.meta.name)
  const path = useOpenPLCStore((s) => ('path' in s.editor.meta ? s.editor.meta.path : undefined))
  const gvl = gvlFromPath(path) ?? (name === GLOBAL_VARIABLES_TAB ? DEFAULT_GVL : null)
  if (gvl !== null) {
    return (
      <div className='flex h-full w-full flex-col overflow-y-auto'>
        <GlobalVariablesEditor key={gvl} gvl={gvl} />
      </div>
    )
  }
  return (
    <div className=' flex h-full w-full flex-col gap-8 overflow-y-auto'>
      <TaskEditor />

      <InstancesEditor />
    </div>
  )
}

export { ResourcesEditor }
