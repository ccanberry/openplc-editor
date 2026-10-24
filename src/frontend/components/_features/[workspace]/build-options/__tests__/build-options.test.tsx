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

  it('logged in: a click asks for the online change at once, no menu; icon turned', () => {
    const { trigger, onSelect } = open(true)
    expect(onSelect).toHaveBeenCalledWith('online-change')
    expect(screen.queryByText('Build only')).toBeNull()
    expect(screen.queryByText('Online change')).toBeNull()
    expect(trigger.querySelector('[data-logged-in="true"]')?.className).toContain('-rotate-90')
  })

  it('logged in without an upload path: the menu opens to say why', () => {
    const onSelect = jest.fn()
    render(
      <BuildOptionsPopover
        triggerTooltip='Online change'
        uploadAvailable={false}
        uploadDisabledReason='no target'
        loggedIn
        onSelect={onSelect}
      />,
    )
    fireEvent.click(screen.getByLabelText('Build options'))
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByText('Online change')).toBeTruthy()
  })
})
