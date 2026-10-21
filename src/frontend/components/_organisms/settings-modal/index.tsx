import { useEffect, useState } from 'react'

import { useAccelerator, useRuntime } from '../../../../middleware/shared/providers'
import { setDevMode, useDevMode } from '../../../services/editor-settings'
import { Modal, ModalContent, ModalTitle } from '../../_molecules/modal'

/**
 * File > Settings: the editor's own settings, kept per user (not in the project).
 *
 * Dev mode (default off): the board password of a connection is kept, encrypted for this
 * Windows user, and Connect / Login reuse it without asking. Switching it off deletes every
 * kept password.
 */
const SettingsModal = () => {
  const accelerator = useAccelerator()
  const runtime = useRuntime()
  const devMode = useDevMode()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!accelerator.onOpenSettings) return
    return accelerator.onOpenSettings(() => setOpen(true))
  }, [accelerator])

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalContent className='flex w-[460px] select-none flex-col gap-4 rounded-lg p-6'>
        <ModalTitle className='text-xl font-semibold'>Settings</ModalTitle>

        <label className='flex cursor-pointer items-start gap-3 text-sm text-neutral-850 dark:text-neutral-200'>
          <input
            type='checkbox'
            className='mt-1'
            checked={devMode}
            onChange={(e) => setDevMode(e.target.checked, () => runtime.forgetBoardPasswords?.())}
          />
          <span>
            <span className='font-medium'>Dev mode</span>
            <span className='mt-1 block text-xs text-neutral-600 dark:text-neutral-400'>
              Keep the board password of the last connection (encrypted for this Windows user) and use it again
              when you Connect or Log in, without asking. Off by default; switching it off deletes every kept
              password. Leave it off on a PC that other people use.
            </span>
          </span>
        </label>

        <div className='flex justify-end'>
          <button
            type='button'
            onClick={() => setOpen(false)}
            className='h-8 rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-medium-dark'
          >
            Close
          </button>
        </div>
      </ModalContent>
    </Modal>
  )
}

export { SettingsModal }
