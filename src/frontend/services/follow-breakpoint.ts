/**
 * Follow the breakpoint: when the PLC halts at a checkpoint, open that POU's tab and put the
 * cursor on the stopped line (CODESYS does the same). On by default -- a fresh installation
 * follows -- and switched in the run-control toolbar; the choice is kept per user.
 */
import { openPLCStoreBase } from '../store'
import { CreateEditorObjectFromTab } from '../store/slices/tabs/utils'

const KEY = 'oplc.debug.follow-breakpoint'

export function isFollowBreakpointOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setFollowBreakpoint(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // no storage: the default (on) applies next time
  }
}

/** Open a POU's tab (as a click on it in the project tree does) unless it is the one shown. */
export function openPouTab(pouName: string): void {
  const s = openPLCStoreBase.getState()
  if (s.editor.meta.name === pouName) return
  const pou = s.project.data.pous.find((p) => p.name === pouName)
  if (!pou) return
  const type = pou.pouType
  const tab = {
    name: pou.name,
    path: `/data/pous/${type}/${pou.name}`,
    elementType: { type, language: pou.body.language },
  } as Parameters<typeof s.tabsActions.updateTabs>[0]
  s.tabsActions.updateTabs(tab)
  const editor = s.editorActions.getEditorFromEditors(pou.name)
  const model = editor ?? CreateEditorObjectFromTab(tab)
  s.editorActions.addModel(model)
  s.editorActions.setEditor(model)
}
