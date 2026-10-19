/**
 * Opening a function block while logged in: its implementation, or one of its instances?
 *
 * CODESYS asks this in online mode ("Implementation / Instance"): the FB's code is the same for
 * every instance, the values are not. An instance shows that instance's live values in the code,
 * the variable table and the hover; the implementation shows the code without values. Arrays of
 * the FB list every element (`PLC_PRG.Valves[3]`). Not logged in, or no instance in the program:
 * the FB opens as before, without asking.
 */
import { openPLCStoreBase } from '../store'

export interface FbInstancePickerData {
  fbName: string
  instances: { key: string; label: string }[]
  selectedKey?: string
  /** The instance's key, or null for the implementation. */
  onPick: (key: string | null) => void
}

export function openFunctionBlock(pouName: string, open: () => void): void {
  const s = openPLCStoreBase.getState()
  const fbTypeKey = pouName.toUpperCase()
  const instances = s.workspace.isDebuggerVisible ? (s.workspace.fbDebugInstances.get(fbTypeKey) ?? []) : []
  if (instances.length === 0) {
    open()
    return
  }
  const data: FbInstancePickerData = {
    fbName: pouName,
    instances: instances.map((i) => ({ key: i.key, label: `${i.programName}.${i.fbVariableName}` })),
    selectedKey: s.workspace.fbSelectedInstance.get(fbTypeKey) || undefined,
    onPick: (key) => {
      openPLCStoreBase.getState().workspaceActions.setFbSelectedInstance(fbTypeKey, key ?? '')
      open()
    },
  }
  s.modalActions.openModal('fb-instance-picker', data)
}
