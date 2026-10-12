import { ComponentPropsWithoutRef } from 'react'

import { cn } from '../../../utils/cn'

type ILoginIconProps = ComponentPropsWithoutRef<'svg'> & {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'muted'
  /** Logged in: the arrow points out of the door (the button logs out). */
  out?: boolean
}

const SizeClasses = {
  sm: 'w-5 h-5',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
}
const VariantClasses = {
  default: '#0464FB',
  muted: '#B4D0FE',
}

/** Login / logout to the running PLC (the CODESYS "Login"): a door with an arrow. */
export const LoginIcon = ({ className, variant = 'default', size = 'sm', out = false, ...res }: ILoginIconProps) => {
  const c = VariantClasses[variant]
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      className={cn(`${SizeClasses[size]}`, className)}
      {...res}
    >
      <title>{out ? 'Logout' : 'Login'}</title>
      <path d='M14 3h4.5A2.5 2.5 0 0 1 21 5.5v13a2.5 2.5 0 0 1-2.5 2.5H14' stroke={c} strokeWidth='2' strokeLinecap='round' />
      {out ? (
        <path d='M10 12H2m0 0 3.5-3.5M2 12l3.5 3.5' stroke={c} strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
      ) : (
        <path d='M3 12h11m0 0-3.5-3.5M14 12l-3.5 3.5' stroke={c} strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
      )}
    </svg>
  )
}
