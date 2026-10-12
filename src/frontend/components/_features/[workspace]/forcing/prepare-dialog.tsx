/**
 * The prepare dialog (CODESYS "Prepare value"): opened by a click on a variable's live value
 * anywhere -- the ST code, LD/FBD, the watch list, the variable tables, the Forces panel.
 * It only prepares: F7 forces every prepared value, Ctrl+F7 writes them once.
 */
import { useEffect, useMemo, useState } from 'react'

import { setPrepared } from '../../../../services/forcing'
import { useOpenPLCStore } from '../../../../store'
import { displayNameForPath, globalNameMap, preparedLabel } from '../../../../utils/forcing'
import { Modal, ModalContent, ModalTitle } from '../../../_molecules/modal'

const btn = 'rounded-md px-3 py-2 text-xs font-medium'
const primary = `${btn} bg-brand text-white hover:bg-brand-medium-dark`
const secondary = `${btn} bg-neutral-100 text-neutral-1000 hover:bg-neutral-200 dark:bg-neutral-850 dark:text-neutral-100`

const PrepareValueDialog = () => {
  const target = useOpenPLCStore((s) => s.workspace.debugPrepareTarget)
  const setTarget = useOpenPLCStore((s) => s.workspaceActions.setDebugPrepareTarget)
  const instances = useOpenPLCStore((s) => s.project.data.configurations.resource.instances)
  const globals = useOpenPLCStore((s) => s.project.data.configurations.resource.globalVariables)
  const globalNames = useMemo(() => globalNameMap(globals), [globals])
  const live = useOpenPLCStore((s) =>
    target ? (s.workspace.debugBoolValues.get(target.path) ?? s.workspace.debugNonBoolValues.get(target.path)) : undefined,
  )
  const forcedValue = useOpenPLCStore((s) => (target ? s.workspace.debugPlcForces?.get(target.path) : undefined))
  const prepared = useOpenPLCStore((s) => (target ? s.workspace.debugPrepared.get(target.path) : undefined))
  const [value, setValue] = useState('')

  useEffect(() => {
    if (target) setValue(prepared?.value ?? live ?? '')
    // only when the dialog opens for a variable, not on every poll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  if (!target) return null
  const isBool = target.type.toUpperCase() === 'BOOL'
  const close = () => setTarget(null)
  const prepare = (v: string | null | undefined) => {
    setPrepared(target, v)
    close()
  }

  return (
    <Modal open={!!target} onOpenChange={(open) => !open && close()}>
      <ModalContent className='flex h-fit min-h-0 w-[420px] select-none flex-col gap-3 rounded-lg p-6'>
        <ModalTitle className='text-base font-semibold'>Prepare value</ModalTitle>
        <div className='text-xs text-neutral-700 dark:text-neutral-400'>
          <div className='font-mono text-sm text-neutral-1000 dark:text-neutral-100'>
            {displayNameForPath(target.path, instances, globalNames)}
          </div>
          <div>
            {target.type} · live <span className='font-mono'>{live ?? '?'}</span>
            {forcedValue !== undefined && (
              <span className='ml-2 font-semibold text-orange-500'>forced {forcedValue}</span>
            )}
            {prepared && <span className='ml-2 font-mono text-blue-500'>{preparedLabel(prepared)}</span>}
          </div>
        </div>
        {isBool ? (
          <div className='flex gap-2'>
            <button className={primary} onClick={() => prepare('TRUE')}>
              TRUE
            </button>
            <button className={primary} onClick={() => prepare('FALSE')}>
              FALSE
            </button>
          </div>
        ) : (
          <div className='flex gap-2'>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && value.trim() && prepare(value.trim())}
              className='flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300'
            />
            <button className={primary} disabled={!value.trim()} onClick={() => prepare(value.trim())}>
              Prepare
            </button>
          </div>
        )}
        <div className='flex flex-wrap gap-2'>
          {forcedValue !== undefined && (
            <button className={secondary} onClick={() => prepare(null)} title='Released at the next Force (F7)'>
              Prepare release
            </button>
          )}
          {prepared && (
            <button className={secondary} onClick={() => prepare(undefined)}>
              Remove preparation
            </button>
          )}
          <button className={secondary} onClick={close}>
            Cancel
          </button>
        </div>
        <p className='text-[11px] text-neutral-500'>
          Nothing is sent yet: F7 forces every prepared value, Ctrl+F7 writes them once, Alt+F7 releases every force.
        </p>
      </ModalContent>
    </Modal>
  )
}

export { PrepareValueDialog }
