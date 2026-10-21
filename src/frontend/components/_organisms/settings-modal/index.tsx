import { ReactNode, useEffect, useState } from 'react'

import { useAccelerator, useRuntime } from '../../../../middleware/shared/providers'
import {
  onOpenSettingsRequest,
  setClearConsoleOnBuild,
  setConfirmOnlineChange,
  setDevMode,
  setVerbose,
  useClearConsoleOnBuild,
  useConfirmOnlineChange,
  useDevMode,
  useVerbose,
} from '../../../services/editor-settings'
import { LIVE_PERIOD_MAX, LIVE_PERIOD_MIN, setLivePeriod, useLivePeriod } from '../../../services/live-values'
import { Modal, ModalContent, ModalTitle } from '../../_molecules/modal'

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className='flex flex-col gap-3'>
    <span className='text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400'>{title}</span>
    {children}
  </div>
)

const Toggle = ({
  label,
  help,
  checked,
  onChange,
}: {
  label: string
  help: string
  checked: boolean
  onChange: (value: boolean) => void
}) => (
  <label className='flex cursor-pointer items-start gap-3 text-sm text-neutral-850 dark:text-neutral-200'>
    <input type='checkbox' className='mt-1' checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>
      <span className='font-medium'>{label}</span>
      <span className='mt-1 block text-xs text-neutral-600 dark:text-neutral-400'>{help}</span>
    </span>
  </label>
)

/**
 * File > Settings: the editor's own settings, kept per user (not in the project).
 *
 * Online: the live values' read period (it was in the floating bar), and whether a build while
 * logged in asks before its online change. Console: verbose build output, a fresh console per
 * build. Connection: dev mode (the board password kept, encrypted for this Windows user).
 */
const SettingsModal = () => {
  const accelerator = useAccelerator()
  const runtime = useRuntime()
  const devMode = useDevMode()
  const verbose = useVerbose()
  const confirmOnline = useConfirmOnlineChange()
  const clearOnBuild = useClearConsoleOnBuild()
  const livePeriod = useLivePeriod()
  const [periodText, setPeriodText] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => onOpenSettingsRequest(() => setOpen(true)), [])
  // Ctrl+, also where the native menu (and its accelerator) is hidden.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (!accelerator.onOpenSettings) return
    return accelerator.onOpenSettings(() => setOpen(true))
  }, [accelerator])

  const commitPeriod = (text: string) => {
    setLivePeriod(text)
    setPeriodText(null)
  }

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalContent className='flex w-[500px] select-none flex-col gap-5 rounded-lg p-6'>
        <ModalTitle className='text-xl font-semibold'>Settings</ModalTitle>

        <Section title='Online'>
          <label className='flex items-start gap-3 text-sm text-neutral-850 dark:text-neutral-200'>
            <input
              type='number'
              aria-label='Live values period in seconds'
              min={LIVE_PERIOD_MIN}
              max={LIVE_PERIOD_MAX}
              step={0.1}
              value={periodText ?? livePeriod.toFixed(1)}
              onChange={(e) => setPeriodText(e.target.value)}
              onBlur={(e) => commitPeriod(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitPeriod((e.target as HTMLInputElement).value)
              }}
              className='h-7 w-16 rounded border border-neutral-300 bg-transparent px-1 text-sm dark:border-neutral-700'
            />
            <span>
              <span className='font-medium'>Live values update period (s)</span>
              <span className='mt-1 block text-xs text-neutral-600 dark:text-neutral-400'>
                How often the values in the code are read while logged in, {LIVE_PERIOD_MIN} to {LIVE_PERIOD_MAX}{' '}
                s; 1.0 by default. A shorter period loads the PLC&apos;s debug channel more.
              </span>
            </span>
          </label>
          <Toggle
            label='Ask before an online change'
            help='Logged in, the build menu does an online change only. On, it asks first: OK, Cancel or Go offline.'
            checked={confirmOnline}
            onChange={setConfirmOnlineChange}
          />
        </Section>

        <Section title='Console'>
          <Toggle
            label='Verbose'
            help='Show every detail of a build: each compiler command, plugin states, tool checks. Off by default: the console shows the steps, warnings and errors.'
            checked={verbose}
            onChange={setVerbose}
          />
          <Toggle
            label='Clear the console at each build'
            help='Each build starts with an empty console.'
            checked={clearOnBuild}
            onChange={setClearConsoleOnBuild}
          />
        </Section>

        <Section title='Connection'>
          <Toggle
            label='Dev mode'
            help='Keep the board password of the last connection (encrypted for this Windows user) and use it again when you Connect or Log in, without asking. Off by default; switching it off deletes every kept password. Leave it off on a PC that other people use.'
            checked={devMode}
            onChange={(value) => setDevMode(value, () => runtime.forgetBoardPasswords?.())}
          />
        </Section>

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
