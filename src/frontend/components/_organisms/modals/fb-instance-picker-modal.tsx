import type { FbInstancePickerData } from '../../../services/fb-instance-picker'
import { useOpenPLCStore } from '../../../store'
import { Modal, ModalContent, ModalTitle } from '../../_molecules/modal'

/** Logged in, opening a function block: its implementation or one of its instances (CODESYS). */
const FbInstancePickerModal = () => {
  const { modals, modalActions } = useOpenPLCStore()
  const isOpen = modals['fb-instance-picker']?.open || false
  const data = modals['fb-instance-picker']?.data as FbInstancePickerData | null

  if (!data) return null

  const pick = (key: string | null) => {
    const onPick = data.onPick
    modalActions.closeModal()
    onPick(key)
  }

  const itemClass = (selected: boolean) =>
    `w-full rounded-md px-3 py-1.5 text-left font-mono text-xs ${
      selected
        ? 'bg-brand text-white hover:bg-brand-medium-dark'
        : 'text-neutral-1000 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-850'
    }`

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) modalActions.closeModal()
        modalActions.onOpenChange('fb-instance-picker', open)
      }}
    >
      <ModalContent className='flex max-h-[70vh] w-[420px] select-none flex-col rounded-lg p-6'>
        <ModalTitle className='mb-1 text-lg font-semibold'>{data.fbName}</ModalTitle>
        <p className='mb-4 text-sm text-neutral-700 dark:text-neutral-300'>
          Show the implementation, or an instance with its live values?
        </p>
        <div className='flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto'>
          <button type='button' className={itemClass(!data.selectedKey)} onClick={() => pick(null)}>
            Implementation
          </button>
          {data.instances.map((inst) => (
            <button
              type='button'
              key={inst.key}
              className={itemClass(inst.key === data.selectedKey)}
              onClick={() => pick(inst.key)}
            >
              {inst.label}
            </button>
          ))}
        </div>
        <button
          type='button'
          onClick={() => modalActions.closeModal()}
          className='mt-4 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-1000 hover:bg-neutral-200 dark:bg-neutral-850 dark:text-neutral-100'
        >
          Cancel
        </button>
      </ModalContent>
    </Modal>
  )
}

export { FbInstancePickerModal }
