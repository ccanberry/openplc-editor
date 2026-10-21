import { useEffect, useState } from 'react'

import { useOpenPLCStore } from '../../../store'
import { Label } from '../../_atoms/label'
import { Modal, ModalContent, ModalTitle } from '../../_molecules/modal'

export type RuntimeQuickConnectData = {
  defaultIp: string
  /** MCM20.1: the board's root password is part of the connection. */
  needsPassword: boolean
  onSubmit: (answer: { ip: string; password: string }) => void
  onCancel: () => void
}

/**
 * Login while not connected: the board's address and password in one dialog, then the connection
 * and the login go on by themselves (instead of refusing with "connect first").
 */
const RuntimeQuickConnectModal = () => {
  const { modals, modalActions } = useOpenPLCStore()
  const isOpen = modals['runtime-quick-connect']?.open || false
  const data = modals['runtime-quick-connect']?.data as RuntimeQuickConnectData | null
  const [ip, setIp] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (isOpen && data) {
      setIp(data.defaultIp)
      setPassword('')
    }
  }, [isOpen, data])

  if (!data) return null

  const submit = () => {
    if (!ip.trim() || (data.needsPassword && !password)) return
    const answer = { ip: ip.trim(), password }
    setPassword('')
    modalActions.closeModal()
    data.onSubmit(answer)
  }
  const cancel = () => {
    setPassword('')
    modalActions.closeModal()
    data.onCancel()
  }

  const inputClass =
    'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-850 outline-none focus:border-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300'

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) cancel()
      }}
    >
      <ModalContent className='flex w-[420px] select-none flex-col gap-4 rounded-lg p-6'>
        <ModalTitle className='text-xl font-semibold'>Connect to log in</ModalTitle>
        <p className='text-sm text-neutral-700 dark:text-neutral-300'>
          The editor is not connected to the board. Connect, and the login goes on.
        </p>
        <form
          autoComplete='off'
          className='flex flex-col gap-3'
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div>
            <Label htmlFor='quick-connect-ip' className='mb-1 block text-sm'>
              IP Address
            </Label>
            <input id='quick-connect-ip' value={ip} onChange={(e) => setIp(e.target.value)} className={inputClass} />
          </div>
          {data.needsPassword && (
            <div>
              <Label htmlFor='quick-connect-password' className='mb-1 block text-sm'>
                Board Password
              </Label>
              <input
                id='quick-connect-password'
                type='password'
                autoComplete='off'
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
          <div className='mt-2 flex gap-3'>
            <button
              type='submit'
              disabled={!ip.trim() || (data.needsPassword && !password)}
              className='flex-1 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-medium-dark disabled:opacity-50'
            >
              Connect and log in
            </button>
            <button
              type='button'
              onClick={cancel}
              className='flex-1 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-1000 hover:bg-neutral-200 dark:bg-neutral-850 dark:text-neutral-100'
            >
              Cancel
            </button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  )
}

export { RuntimeQuickConnectModal }
