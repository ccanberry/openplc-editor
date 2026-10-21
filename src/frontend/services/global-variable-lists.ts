/**
 * The GVLs in the project tree: open, add, rename, delete (CODESYS: global variable list
 * objects). A GVL is the `group` of its variables plus its place in the resource's
 * `globalVariableLists`, saved with the resource (its unsaved mark is the Resource file's).
 */
import { openPLCStoreBase } from '../store'
import type { TabsProps } from '../store/slices/tabs'
import { CreateEditorObjectFromTab } from '../store/slices/tabs/utils'
import {
  deleteGvl,
  gvlNameError,
  gvlNames,
  gvlOf,
  gvlTabName,
  gvlTabPath,
  newGvlName,
  renameGvl,
} from '../utils/global-variable-lists'

const resource = () => openPLCStoreBase.getState().project.data.configurations.resource

const gvlTab = (gvl: string): TabsProps => ({
  name: gvlTabName(gvl),
  path: gvlTabPath(gvl),
  elementType: { type: 'resource' },
})

export function openGvl(gvl: string): void {
  const state = openPLCStoreBase.getState()
  const tab = gvlTab(gvl)
  state.tabsActions.updateTabs(tab)
  const model = state.editorActions.getEditorFromEditors(tab.name) ?? CreateEditorObjectFromTab(tab)
  state.editorActions.addModel(model)
  state.editorActions.setEditor(model)
  state.workspaceActions.setSelectedProjectTreeLeaf({ label: tab.name, type: 'resource' })
}

/** Close a GVL's tab; true when it was the tab shown. */
function closeGvl(gvl: string): boolean {
  const state = openPLCStoreBase.getState()
  const name = gvlTabName(gvl)
  const shown = state.editor.type !== 'available' && state.editor.meta.name === name
  state.editorActions.removeModel(name)
  state.tabsActions.removeTab(name)
  if (shown) state.editorActions.clearEditor()
  return shown
}

const save = (variables: ReturnType<typeof resource>['globalVariables'], lists: string[]) => {
  const state = openPLCStoreBase.getState()
  state.projectActions.setGlobalVariables({ variables, lists })
  state.sharedWorkspaceActions.handleFileAndWorkspaceSavedState('Resource')
}

/** A new, empty GVL after the others, opened. */
export function addGvl(): string {
  const names = gvlNames(resource())
  const name = newGvlName(names)
  save(resource().globalVariables, [...names, name])
  openGvl(name)
  return name
}

export function renameGvlTo(from: string, to: string): { ok: true } | { ok: false; message: string } {
  if (from === to) return { ok: true }
  const error = gvlNameError(to, gvlNames(resource()), from)
  if (error) return { ok: false, message: error }
  const next = renameGvl(resource(), from, to)
  save(next.variables, next.lists)
  if (closeGvl(from)) openGvl(to)
  return { ok: true }
}

/** Delete a GVL and its variables, after asking when it has any. */
export function deleteGvlAsk(gvl: string): Promise<boolean> {
  const count = resource().globalVariables.filter((v) => gvlOf(v) === gvl).length
  const apply = () => {
    const state = openPLCStoreBase.getState()
    for (const v of resource().globalVariables) {
      if (gvlOf(v) === gvl) state.workspaceActions.removeDebugVariable(`resource:${v.name}`)
    }
    const next = deleteGvl(resource(), gvl)
    save(next.variables, next.lists)
    closeGvl(gvl)
    return true
  }
  if (count === 0) return Promise.resolve(apply())
  return new Promise((resolve) => {
    openPLCStoreBase.getState().modalActions.openModal('debugger-message', {
      type: 'warning',
      title: `Delete GVL ${gvl}`,
      message: `GVL ${gvl} declares ${count} variable${count === 1 ? '' : 's'}. Delete the GVL and ${count === 1 ? 'it' : 'them'}?`,
      buttons: ['Delete', 'Cancel'],
      onResponse: (i: number) => resolve(i === 0 ? apply() : false),
    })
  })
}
