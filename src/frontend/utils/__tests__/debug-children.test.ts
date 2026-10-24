import { debugChildren } from '../debug-children'

const leaves = [
  'PRECLEANINGTIME_[2]',
  'PRECLEANINGTIME_[10]',
  'PRECLEANINGTIME_[1]',
  'TON_START.IN',
  'TON_START.Q',
  'TON_START.ET',
  'VALVES[1].STATE',
  'VALVES[1].TIMER.Q',
  'VALVES[2].STATE',
  'GRID[1,2]',
  'PRECLEANINGTIME',
  'BROKEN[1',
  'TON_STARTX',
]

describe('debugChildren', () => {
  it('array elements in index order', () => {
    expect(debugChildren(leaves, 'PRECLEANINGTIME_')).toEqual([
      { path: 'PRECLEANINGTIME_[1]', label: '[1]', complex: false },
      { path: 'PRECLEANINGTIME_[2]', label: '[2]', complex: false },
      { path: 'PRECLEANINGTIME_[10]', label: '[10]', complex: false },
    ])
  })

  it('FB members in map order, not a variable that only shares the prefix', () => {
    expect(debugChildren(leaves, 'TON_START').map((c) => c.label)).toEqual(['IN', 'Q', 'ET'])
  })

  it('an array of FBs: the elements are complex, their members the next level', () => {
    expect(debugChildren(leaves, 'VALVES')).toEqual([
      { path: 'VALVES[1]', label: '[1]', complex: true },
      { path: 'VALVES[2]', label: '[2]', complex: true },
    ])
    expect(debugChildren(leaves, 'VALVES[1]')).toEqual([
      { path: 'VALVES[1].STATE', label: 'STATE', complex: false },
      { path: 'VALVES[1].TIMER', label: 'TIMER', complex: true },
    ])
  })

  it('a multi-dimensional element, a leaf, an unclosed index and an unknown path', () => {
    expect(debugChildren(leaves, 'GRID')).toEqual([{ path: 'GRID[1,2]', label: '[1,2]', complex: false }])
    expect(debugChildren(leaves, 'PRECLEANINGTIME')).toEqual([])
    expect(debugChildren(leaves, 'BROKEN')).toEqual([])
    expect(debugChildren(leaves, 'NOPE')).toEqual([])
  })
})
