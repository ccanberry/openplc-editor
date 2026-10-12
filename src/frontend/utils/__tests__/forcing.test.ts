import type { DebugLeafInfo, DebugPreparedValue } from '../../store/slices/workspace/types'
import {
  displayNameForPath,
  forceableNames,
  forcedMarksFromPlc,
  globalNameMap,
  indexLeavesByPath,
  nextBoolPreparation,
  planBatches,
  preparedLabel,
  resolveVariableName,
  sameForces,
  sameMarks,
} from '../forcing'

const leaves = new Map<number, DebugLeafInfo>([
  [0, { path: 'EMERGENCYOK', type: 'BOOL' }],
  [1, { path: 'A1_TEMPERATUREANALOG', type: 'INT' }],
  [(1 << 16) | 4, { path: 'INSTANCE0.OC_PROBE', type: 'DINT' }],
  [(1 << 16) | 5, { path: 'INSTANCE0.MT_CLOCK.START_TIME', type: 'TIME', hidden: true }],
  [(1 << 16) | 6, { path: 'INSTANCE0.ARR[2]', type: 'INT' }],
])
const instances = [{ name: 'instance0', program: 'PLC_PRG' }]
const byPath = indexLeavesByPath(leaves)

describe('resolveVariableName', () => {
  it('takes a map path, a global in any case, or a program variable under its program', () => {
    expect(resolveVariableName('EMERGENCYOK', byPath, instances)).toEqual({ path: 'EMERGENCYOK', index: 0, type: 'BOOL' })
    expect(resolveVariableName(' EmergencyOk ', byPath, instances)?.path).toBe('EMERGENCYOK')
    expect(resolveVariableName('PLC_PRG.oc_probe', byPath, instances)).toEqual({
      path: 'INSTANCE0.OC_PROBE',
      index: (1 << 16) | 4,
      type: 'DINT',
    })
    expect(resolveVariableName('plc_prg.arr[2]', byPath, instances)?.path).toBe('INSTANCE0.ARR[2]')
  })
  it('answers null for an unknown or empty name', () => {
    expect(resolveVariableName('', byPath, instances)).toBeNull()
    expect(resolveVariableName('NOPE', byPath, instances)).toBeNull()
    expect(resolveVariableName('PLC_PRG.NOPE', byPath, instances)).toBeNull()
    expect(resolveVariableName('OTHER.X', byPath, instances)).toBeNull()
  })
})

describe('names', () => {
  it('shows an instance path under its program, others as they are', () => {
    expect(displayNameForPath('INSTANCE0.OC_PROBE', instances)).toBe('PLC_PRG.OC_PROBE')
    expect(displayNameForPath('EMERGENCYOK', instances)).toBe('EMERGENCYOK')
    expect(displayNameForPath('OTHER.X', instances)).toBe('OTHER.X')
  })
  it('shows a global under its declared name, a struct member too', () => {
    const g = globalNameMap([{ name: 'EmergencyOk' }, { name: 'Recipe' }])
    expect(displayNameForPath('EMERGENCYOK', instances, g)).toBe('EmergencyOk')
    expect(displayNameForPath('RECIPE.A', instances, g)).toBe('Recipe.A')
    expect(displayNameForPath('NOPE.A', instances, g)).toBe('NOPE.A')
    expect(displayNameForPath('NOPE', instances, g)).toBe('NOPE')
    expect(forceableNames(leaves, instances, g)).toContain('EmergencyOk')
  })
  it('offers every visible leaf, sorted, without library internals', () => {
    expect(forceableNames(leaves, instances)).toEqual([
      'A1_TEMPERATUREANALOG',
      'EMERGENCYOK',
      'PLC_PRG.ARR[2]',
      'PLC_PRG.OC_PROBE',
    ])
  })
})

describe('preparation', () => {
  const p = (value: string | null, type = 'BOOL'): DebugPreparedValue => ({ index: 0, type, value })
  it('cycles a BOOL none -> TRUE -> FALSE -> none, a release -> TRUE', () => {
    expect(nextBoolPreparation(undefined)).toBe('TRUE')
    expect(nextBoolPreparation(p('TRUE'))).toBe('FALSE')
    expect(nextBoolPreparation(p('1'))).toBe('FALSE')
    expect(nextBoolPreparation(p('FALSE'))).toBeUndefined()
    expect(nextBoolPreparation(p(null))).toBe('TRUE')
  })
  it('labels a prepared value', () => {
    expect(preparedLabel(undefined)).toBe('')
    expect(preparedLabel(p(null))).toBe('<release>')
    expect(preparedLabel(p('1'))).toBe('<TRUE>')
    expect(preparedLabel(p('false'))).toBe('<FALSE>')
    expect(preparedLabel(p('17039', 'INT'))).toBe('<17039>')
  })
})

describe('planBatches', () => {
  const prepared = new Map<string, DebugPreparedValue>([
    ['A', { index: 1, type: 'INT', value: '5' }],
    ['B', { index: 2, type: 'BOOL', value: null }],
    ['C', { index: 3, type: 'INT', value: 'bad' }],
    ['D', { index: 4, type: 'INT', value: '7' }],
  ])
  const encode = (v: string) => {
    if (!/^\d+$/.test(v)) throw new Error(`Invalid INT value: "${v}"`)
    return new Uint8Array([Number(v)])
  }
  const encodeNonError = () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw 'odd'
  }
  it('force: values forced, releases unforced, bad values reported, split into batches', () => {
    const r = planBatches(prepared, 'force', encode, 2)
    expect(r.errors).toEqual(['C: Invalid INT value: "bad"'])
    expect(r.used).toEqual(['A', 'B', 'D'])
    expect(r.batches.map((b) => b.map((i) => [i.path, i.op]))).toEqual([
      [
        ['A', 'force'],
        ['B', 'unforce'],
      ],
      [['D', 'force']],
    ])
  })
  it('write: values written once, releases left prepared', () => {
    const r = planBatches(prepared, 'write', encode, 64)
    expect(r.used).toEqual(['A', 'D'])
    expect(r.batches[0].every((i) => i.op === 'write')).toBe(true)
  })
  it('reports a non-Error throw too', () => {
    const r = planBatches(new Map([['A', { index: 1, type: 'INT', value: '1' }]]), 'force', encodeNonError, 64)
    expect(r.errors).toEqual(['A: odd'])
    expect(r.batches).toEqual([])
  })
})

describe('forced marks', () => {
  it('marks every key of a forced leaf, TRUE-ish by value', () => {
    const indexes = new Map([
      ['PLC_PRG:EmergencyOk', 0],
      ['EMERGENCYOK', 0],
      ['A1_TEMPERATUREANALOG', 1],
      ['PLC_PRG:oc_probe', (1 << 16) | 4],
    ])
    const marks = forcedMarksFromPlc(
      new Map([
        ['EMERGENCYOK', 'FALSE'],
        ['A1_TEMPERATUREANALOG', '17039'],
        ['GONE', '1'],
      ]),
      byPath,
      indexes,
    )
    expect(marks).toEqual(
      new Map([
        ['PLC_PRG:EmergencyOk', false],
        ['EMERGENCYOK', false],
        ['A1_TEMPERATUREANALOG', true],
      ]),
    )
  })
  it('compares marks and force lists', () => {
    const a = new Map([['x', true]])
    expect(sameMarks(a, new Map([['x', true]]))).toBe(true)
    expect(sameMarks(a, new Map([['x', false]]))).toBe(false)
    expect(sameMarks(a, new Map())).toBe(false)
    const f = new Map([['X', '1']])
    expect(sameForces(f, new Map([['X', '1']]))).toBe(true)
    expect(sameForces(f, new Map([['X', '2']]))).toBe(false)
    expect(sameForces(f, new Map())).toBe(false)
    expect(sameForces(null, null)).toBe(true)
    expect(sameForces(null, f)).toBe(false)
  })
})
