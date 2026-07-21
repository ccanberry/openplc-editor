import { X } from 'lucide-react'
import { useEffect } from 'react'

import { CHANGELOG } from '../../../data/changelog'
import { ROBOTEK_TITLE, ROBOTEK_VERSION } from '../../../data/robotek-version'
import { cn } from '../../../utils/cn'

type VersionInfoModalProps = {
  open: boolean
  onClose: () => void
}

/** About / changelog overlay opened by the "!" button in the activity bar.
 *  Lists every suite release (newest first) and flags the running build. */
export const VersionInfoModal = ({ open, onClose }: VersionInfoModalProps) => {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className='fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4'
      role='dialog'
      aria-modal='true'
      aria-label='About and changes'
      onClick={onClose}
    >
      <div
        className='max-h-[80vh] w-[min(580px,94vw)] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='mb-4 flex items-start justify-between gap-4'>
          <div>
            <h2 className='text-lg font-semibold text-neutral-900 dark:text-neutral-100'>{ROBOTEK_TITLE}</h2>
            <p className='text-xs text-neutral-500 dark:text-neutral-400'>Robotek OpenPLC Suite — version history</p>
          </div>
          <button
            aria-label='Close'
            onClick={onClose}
            className='rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        <div className='space-y-5'>
          {CHANGELOG.map((entry) => {
            const isCurrent = entry.version === ROBOTEK_VERSION
            return (
              <div key={entry.version}>
                <div className='mb-1.5 flex items-baseline gap-2'>
                  <span
                    className={cn(
                      'rounded px-2 py-0.5 text-sm font-semibold',
                      isCurrent
                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                        : 'text-neutral-700 dark:text-neutral-300',
                    )}
                  >
                    v{entry.version}
                  </span>
                  <span className='text-xs text-neutral-500 dark:text-neutral-400'>{entry.date}</span>
                  {isCurrent && (
                    <span className='text-[10px] font-medium uppercase tracking-wide text-blue-500'>current</span>
                  )}
                </div>
                <ul className='list-disc space-y-1 pl-5 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300'>
                  {entry.changes.map((change, i) => (
                    <li key={i}>{change}</li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
