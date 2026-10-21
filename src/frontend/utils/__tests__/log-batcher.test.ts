import { createLogBatcher } from '../log-batcher'

describe('createLogBatcher', () => {
  it('adds a burst in one call, in order, once the scheduled flush runs', () => {
    const calls: number[][] = []
    const scheduled: (() => void)[] = []
    const batch = createLogBatcher<number>(
      (items) => calls.push(items),
      (fn) => scheduled.push(fn),
    )
    batch.add(1)
    batch.add(2)
    batch.add(3)
    expect(scheduled).toHaveLength(1)
    expect(calls).toEqual([])
    scheduled[0]()
    expect(calls).toEqual([[1, 2, 3]])
    scheduled[0]()
    expect(calls).toEqual([[1, 2, 3]])
  })

  it('flushes at once on request and schedules again afterwards', () => {
    const calls: string[][] = []
    const scheduled: (() => void)[] = []
    const batch = createLogBatcher<string>(
      (items) => calls.push(items),
      (fn) => scheduled.push(fn),
    )
    batch.add('a')
    batch.flush()
    expect(calls).toEqual([['a']])
    batch.add('b')
    expect(scheduled).toHaveLength(2)
  })

  it('uses a timer by default', () => {
    jest.useFakeTimers()
    const calls: number[][] = []
    const batch = createLogBatcher<number>((items) => calls.push(items))
    batch.add(7)
    jest.runAllTimers()
    expect(calls).toEqual([[7]])
    jest.useRealTimers()
  })
})
