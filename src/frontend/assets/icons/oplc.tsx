import { ComponentProps } from 'react'

import { cn } from '../../utils/cn'

type IOpenPLCIconProps = ComponentProps<'svg'>

export const OpenPLCIcon = (props: IOpenPLCIconProps) => {
  const { className, ...rest } = props
  // RoboPLC's mark (the product is built on OpenPLC v4; the name on screen is RoboPLC)
  return (
    <svg
      viewBox='0 0 12 12'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      aria-label='RoboPLC'
      className={cn('h-6 w-6', className)}
      {...rest}
    >
      <rect x='0.5' y='0.5' width='11' height='11' rx='2.5' fill='#0464FB' />
      <text x='6' y='8.6' textAnchor='middle' fontSize='7.5' fontWeight='700' fill='#fff' fontFamily='Segoe UI, Arial, sans-serif'>
        R
      </text>
    </svg>
  )
}
