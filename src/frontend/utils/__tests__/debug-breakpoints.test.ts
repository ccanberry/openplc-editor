import type { DebugCheckpointEntry } from '../../../middleware/shared/ports/types'
import {
  breakpointableLines,
  breakpointKey,
  checkpointLocation,
  parseBreakpointKey,
  resolveBreakpointIds,
} from '../debug-breakpoints'

const map: DebugCheckpointEntry[] = [
  { id: 0, pou: 'main', line: 10 },
  { id: 1, pou: 'main', line: 10 }, // two statements on the same line
  { id: 2, pou: 'main', line: 11 },
  { id: 3, pou: 'helper', line: 4 },
]

describe('breakpointKey / parseBreakpointKey', () => {
  it('round-trips a pou + line', () => {
    const key = breakpointKey('main', 10)
    expect(key).toBe('main:10')
    expect(parseBreakpointKey(key)).toEqual({ pou: 'main', line: 10 })
  })

  it('splits on the last colon (tolerates nothing unusual but is defensive)', () => {
    expect(parseBreakpointKey('a:b:12')).toEqual({ pou: 'a:b', line: 12 })
  })

  it('returns null for a missing colon', () => {
    expect(parseBreakpointKey('main10')).toBeNull()
  })

  it('returns null for a leading colon (empty pou)', () => {
    expect(parseBreakpointKey(':10')).toBeNull()
  })

  it('returns null for a trailing colon (empty line)', () => {
    expect(parseBreakpointKey('main:')).toBeNull()
  })

  it('returns null for a non-integer line', () => {
    expect(parseBreakpointKey('main:1.5')).toBeNull()
    expect(parseBreakpointKey('main:abc')).toBeNull()
  })
})

describe('resolveBreakpointIds', () => {
  it('returns every checkpoint id on an armed line, deduped + ascending', () => {
    expect(resolveBreakpointIds(['main:10'], map)).toEqual([0, 1])
  })

  it('unions ids across several armed lines and POUs', () => {
    expect(resolveBreakpointIds(['main:11', 'helper:4'], map)).toEqual([2, 3])
  })

  it('ignores armed keys with no matching checkpoint', () => {
    expect(resolveBreakpointIds(['main:99'], map)).toEqual([])
  })

  it('is empty when nothing is armed', () => {
    expect(resolveBreakpointIds([], map)).toEqual([])
  })

  it('is empty when the map is empty', () => {
    expect(resolveBreakpointIds(['main:10'], [])).toEqual([])
  })
})

describe('breakpointableLines', () => {
  it('collects the distinct checkpointed lines for a POU', () => {
    expect(Array.from(breakpointableLines(map, 'main')).sort((a, b) => a - b)).toEqual([10, 11])
  })

  it('is empty for a POU with no checkpoints', () => {
    expect(breakpointableLines(map, 'unknown').size).toBe(0)
  })
})

describe('checkpointLocation', () => {
  it('finds the pou + line for a checkpoint id', () => {
    expect(checkpointLocation(map, 2)).toEqual({ pou: 'main', line: 11 })
  })

  it('returns null for an unknown id', () => {
    expect(checkpointLocation(map, 999)).toBeNull()
  })
})
