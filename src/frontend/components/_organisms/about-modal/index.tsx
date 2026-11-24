import { useEffect, useState } from 'react'

import { useAccelerator, useCapabilities, useSystem } from '../../../../middleware/shared/providers'
import { APP_VERSION } from '../../../data/constants/app-version'
import { useOpenPLCStore } from '../../../store'
import { BASED_ON, LICENSE_NOTICE, LICENSE_URL } from '../../../utils/brand'
import { Modal, ModalContent } from '../../_molecules/modal'

// Per-app product name, injected at build time (webpack DefinePlugin in the editor). Declared
// defensively so an un-injected build (tests) falls back to 'RoboPLC Editor' instead of throwing.
declare const APP_NAME: string | undefined
declare const BUILD_DATE: string | undefined

const AboutModal = () => {
  const {
    workspaceActions: { setModalOpen },
    workspace: { isModalOpen },
  } = useOpenPLCStore()
  const capabilities = useCapabilities()
  const system = useSystem()
  const accelerator = useAccelerator()

  const handleOpenChange = (open: boolean) => {
    setModalOpen('aboutOpenPlc', open)
  }

  const isAboutModalOpen = isModalOpen.some(
    (modal: { modalName: string; modalState: boolean }) => modal.modalName === 'aboutOpenPlc' && modal.modalState,
  )
  const closeModal = () => {
    setModalOpen('aboutOpenPlc', false)
  }
  const title = `${typeof APP_NAME !== 'undefined' ? APP_NAME : 'RoboPLC Editor'} ${APP_VERSION}`
  const releaseDate = `Release: ${typeof BUILD_DATE !== 'undefined' ? BUILD_DATE : ''}`
  const description = 'IDE for the RoboPLC Runtime, compliant with the IEC 61131-3 international standard.'
  const copyrightYear = new Date().getFullYear()
  const copyright = `RoboPLC \u00A9 ${copyrightYear} Robotek`
  const handleOpenLicense = () => {
    void system.openExternalLink(LICENSE_URL)
  }

  const [isAboutOpen, setIsAboutOpen] = useState(false)

  const openAboutModal = () => {
    if (!isAboutOpen) {
      setIsAboutOpen(true)
      setModalOpen('aboutOpenPlc', true)
    }
  }

  useEffect(() => {
    if (!capabilities.hasAboutDialog) return
    const unsubscribe = accelerator.onAbout(() => {
      openAboutModal()
    })
    return unsubscribe
  }, [capabilities.hasAboutDialog])

  return (
    <Modal onOpenChange={handleOpenChange} open={isAboutModalOpen}>
      <ModalContent className='h-[520px] w-[508px] select-none flex-col justify-between px-4 py-4'>
        <div className='flex h-[180px] w-full items-center justify-center bg-[#0464fb]'>
          <span className='text-4xl font-bold tracking-wide text-white'>RoboPLC</span>
        </div>

        <div className='text-center text-xs font-normal text-neutral-950 dark:text-neutral-200'>
          <div className='text-xl font-medium'>
            <h2>{title}</h2>
            <h2>{releaseDate}</h2>
          </div>
          <div className='text-center'>
            <p className='mt-4'>{description}</p>
          </div>
          <p className='mt-4'>{copyright}</p>
          <div data-keep-brand='' className='mt-3 text-[11px] text-neutral-500 dark:text-neutral-400'>
            <p>{BASED_ON}</p>
            <p className='mt-1'>{LICENSE_NOTICE}</p>
          </div>
        </div>

        <div className='my-4 flex justify-center gap-3 text-sm font-medium dark:text-neutral-100'>
          <button className='h-8 w-20 rounded-md bg-neutral-100 dark:bg-neutral-850' onClick={handleOpenLicense}>
            License
          </button>
          <button className='h-8 w-20 rounded-md bg-neutral-100 dark:bg-neutral-850' onClick={closeModal}>
            Close
          </button>
        </div>
      </ModalContent>
    </Modal>
  )
}

export default AboutModal
