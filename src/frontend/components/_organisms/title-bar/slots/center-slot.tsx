import { ROBOTEK_TITLE } from '../../../../data/robotek-version'
import { useCapabilities } from '../../../../../middleware/shared/providers'
import { OpenPLCIcon } from '../../../../assets/icons/oplc'
import { useOpenPLCStore } from '../../../../store'
import { cn } from '../../../../utils/cn'

const TitleBarCenterSlot = () => {
  const caps = useCapabilities()
  const path = useOpenPLCStore((state) => state.project.meta.path)

  return (
    <div
      className={cn('flex flex-1 items-center justify-center gap-2', {
        'oplc-titlebar-drag-region': caps.isNativeApplication,
      })}
    >
      {caps.isNativeApplication ? (
        <>
          <OpenPLCIcon />
          <span className='font-caption text-xs font-normal'>{ROBOTEK_TITLE}</span>
        </>
      ) : (
        path === '' && <span className='font-caption text-xs font-normal'>{ROBOTEK_TITLE}</span>
      )}
    </div>
  )
}

export { TitleBarCenterSlot }
