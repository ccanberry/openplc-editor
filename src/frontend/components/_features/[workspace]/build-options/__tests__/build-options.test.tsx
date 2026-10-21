import { fireEvent, render, screen } from '@testing-library/react'

import { BuildOptionsPopover } from '..'

const open = (loggedIn: boolean, onSelect = jest.fn()) => {
  render(
    <BuildOptionsPopover
      triggerTooltip='Build options'
      uploadAvailable
      uploadDisabledReason=''
      loggedIn={loggedIn}
      onSelect={onSelect}
    />,
  )
  const trigger = screen.getByLabelText('Build options')
  fireEvent.click(trigger)
  return { trigger, onSelect }
}

describe('BuildOptionsPopover', () => {
  it('offline: build, download and clean download; no online change; icon upright', () => {
    const { trigger } = open(false)
    expect(screen.getByText('Build only')).toBeTruthy()
    expect(screen.getByText('Build and upload')).toBeTruthy()
    expect(screen.getByText('Clean build and upload')).toBeTruthy()
    expect(screen.queryByText('Online change')).toBeNull()
    expect(trigger.querySelector('[data-logged-in]')).toBeNull()
  })

  it('logged in: the online change only, icon turned', () => {
    const { trigger, onSelect } = open(true)
    expect(screen.queryByText('Build only')).toBeNull()
    expect(screen.queryByText('Build and upload')).toBeNull()
    expect(screen.queryByText('Clean build and upload')).toBeNull()
    expect(trigger.querySelector('[data-logged-in="true"]')?.className).toContain('-rotate-90')
    fireEvent.click(screen.getByText('Online change'))
    expect(onSelect).toHaveBeenCalledWith('online-change')
  })
})
