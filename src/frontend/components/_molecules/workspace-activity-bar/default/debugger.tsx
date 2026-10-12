import { ComponentPropsWithoutRef } from 'react'

import { LoginIcon } from '../../../../assets/icons/interface/Login'
import { useIsNinetiesTheme } from '../../../../hooks/use-nineties-theme'
import { ActivityBarButton } from '../../../_atoms/buttons/activity-bar'
import { RetroDebugger } from '../../../_atoms/retro-icons'

type DebuggerButtonProps = ComponentPropsWithoutRef<typeof ActivityBarButton> & {
  isActive?: boolean
}

export const DebuggerButton = ({ isActive, className, ...props }: DebuggerButtonProps) => {
  const isNineties = useIsNinetiesTheme()
  return (
    <ActivityBarButton
      aria-label={isActive ? 'Logout' : 'Login'}
      data-active={isActive ? 'true' : undefined}
      className={className}
      {...props}
    >
      {isNineties ? <RetroDebugger /> : <LoginIcon variant={isActive ? 'default' : 'muted'} out={isActive} />}
    </ActivityBarButton>
  )
}
