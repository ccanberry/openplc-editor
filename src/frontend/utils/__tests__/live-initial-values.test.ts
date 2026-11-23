import { TextDecoder } from 'util'

import type { PLCVariable } from '../../../middleware/shared/ports/types'
import { composeInitial, exactLiteral, formatTimeExact, liveTargets, sameInitial } from '../live-initial-values'

// jsdom has no TextDecoder; the app's renderer (Chromium) does
Object.assign(globalThis, { TextDecoder })

const bytes = (n: number, fill: (v: DataView) => void): Uint8Array => {
  const b = new Uint8Array(n)
  fill(new DataView(b.buffer))
  return b
}

describe('formatTimeExact', () => {
  it('keeps every part', () => {
    expect(formatTimeExact(90_500_000_000n)).toBe('T#1m30s500ms')
    expect(formatTimeExact(93_784_005_006_007n)).toBe('T#1d2h3m4s5ms6us7ns')
  })
  it('zero and negative', () => {
    expect(formatTimeExact(0n)).toBe('T#0s')
    expect(formatTimeExact(-2_500_000_000n)).toBe('T#-2s500ms')
  })
})

describe('exactLiteral', () => {
  it('REAL at its own precision', () => {
    expect(exactLiteral(bytes(4, (v) => v.setFloat32(0, 0.1, true)), 0, 'REAL')).toEqual({ literal: '0.1', bytesRead: 4 })
    expect(exactLiteral(bytes(4, (v) => v.setFloat32(0, -106, true)), 0, 'REAL').literal).toBe('-106')
    expect(exactLiteral(bytes(4, (v) => v.setFloat32(0, NaN, true)), 0, 'REAL').literal).toBeNull()
  })
  it('LREAL', () => {
    expect(exactLiteral(bytes(8, (v) => v.setFloat64(0, 22.5, true)), 0, 'LREAL')).toEqual({
      literal: '22.5',
      bytesRead: 8,
    })
  })
  it('TIME exact', () => {
    expect(exactLiteral(bytes(8, (v) => v.setBigInt64(0, 90_500_000_000n, true)), 0, 'TIME').literal).toBe(
      'T#1m30s500ms',
    )
  })
  it('BOOL and integers from the display', () => {
    expect(exactLiteral(new Uint8Array([1]), 0, 'BOOL')).toEqual({ literal: 'TRUE', bytesRead: 1 })
    expect(exactLiteral(bytes(2, (v) => v.setInt16(0, -5, true)), 0, 'INT')).toEqual({ literal: '-5', bytesRead: 2 })
  })
  it('STRING and WSTRING, quoted and escaped; too long = not exact', () => {
    const s = new Uint8Array(127)
    s[0] = 3
    s.set([0x61, 0x27, 0x24], 1) // a ' $
    expect(exactLiteral(s, 0, 'STRING')).toEqual({ literal: "'a$'$$'", bytesRead: 127 })
    s[0] = 200
    expect(exactLiteral(s, 0, 'STRING').literal).toBeNull()
    const w = new Uint8Array(1 + 126 * 2)
    w[0] = 2
    new DataView(w.buffer).setUint16(1, 0x48, true)
    new DataView(w.buffer).setUint16(3, 0x22, true)
    expect(exactLiteral(w, 0, 'WSTRING')).toEqual({ literal: '"H$""', bytesRead: 253 })
    w[0] = 200
    expect(exactLiteral(w, 0, 'WSTRING').literal).toBeNull()
  })
  it('an unknown type is not exact', () => {
    expect(exactLiteral(new Uint8Array(4), 0, 'NOSUCHTYPE').literal).toBeNull()
  })
  it('reads at an offset', () => {
    const b = bytes(6, (v) => v.setInt32(2, 77, true))
    expect(exactLiteral(b, 2, 'DINT').literal).toBe('77')
  })
})

const v = (over: Partial<PLCVariable> & { name: string }): PLCVariable => ({
  type: { definition: 'base-type', value: 'INT' },
  location: '',
  documentation: '',
  ...over,
})
const arr = (base: 'base-type' | 'user-data-type', dims: string[]) => ({
  definition: 'array' as const,
  value: 'ARRAY',
  data: { baseType: { definition: base, value: 'REAL' }, dimensions: dims.map((dimension) => ({ dimension })) },
})

describe('liveTargets', () => {
  const byPath = new Map([
    ['NCPROGREQ', { index: 1, type: 'INT' }],
    ['TOOL[1]', { index: 2, type: 'REAL' }],
    ['TOOL[2]', { index: 3, type: 'REAL' }],
    ['HALF[1]', { index: 4, type: 'REAL' }],
  ])
  it('scalars, arrays and the reasons for the rest', () => {
    const { targets, skipped } = liveTargets(
      [
        v({ name: '' }),
        v({ name: 'NcProgReq', retain: true, initialValue: '8001' }),
        v({ name: 'Tool', type: arr('base-type', ['1..2']) }),
        v({ name: 'Half', type: arr('base-type', ['1..2']) }),
        v({ name: 'Gone' }),
        v({ name: 'Located', location: '%QW1' }),
        v({ name: 'Lock', persistent: true, retain: true }),
        v({ name: 'Fbs', type: arr('user-data-type', ['1..2']) }),
        v({ name: 'Grid', type: arr('base-type', ['1..2', '1..2']) }),
        v({ name: 'Bad', type: arr('base-type', ['x']) }),
        v({ name: 'Down', type: arr('base-type', ['3..1']) }),
        v({ name: 'NoData', type: { definition: 'array', value: 'ARRAY' } }),
        v({ name: 'Timer', type: { definition: 'derived', value: 'TON' } }),
      ],
      byPath,
    )
    expect(targets).toEqual([
      {
        name: 'NcProgReq',
        retain: true,
        kind: 'scalar',
        leaves: [{ path: 'NCPROGREQ', index: 1, type: 'INT' }],
        current: '8001',
      },
      {
        name: 'Tool',
        retain: false,
        kind: 'array',
        leaves: [
          { path: 'TOOL[1]', index: 2, type: 'REAL' },
          { path: 'TOOL[2]', index: 3, type: 'REAL' },
        ],
        current: '',
      },
    ])
    expect(skipped.map((s) => `${s.name}: ${s.why}`)).toEqual([
      'Half: not in the running program',
      'Gone: not in the running program',
      'Fbs: an array of function blocks or structures',
      'Grid: a multi-dimensional array',
      'Bad: a multi-dimensional array',
      'Down: a multi-dimensional array',
      'NoData: an array of function blocks or structures',
      'Timer: a function block instance or a structure',
    ])
  })
})

describe('composeInitial', () => {
  const t = { name: 'x', retain: true, leaves: [], current: '' }
  it('scalar and array', () => {
    expect(composeInitial({ ...t, kind: 'scalar' }, ['5'])).toBe('5')
    expect(composeInitial({ ...t, kind: 'array' }, ['1', '2'])).toBe('[1, 2]')
  })
})

describe('sameInitial', () => {
  it('numbers by value, words by text', () => {
    expect(sameInitial('-106', '-106', 1)).toBe(true)
    expect(sameInitial('410.0', '410', 1)).toBe(true)
    expect(sameInitial('5', '6', 1)).toBe(false)
    expect(sameInitial('true', 'TRUE', 1)).toBe(true)
    expect(sameInitial('T#5s', 'T#5s', 1)).toBe(true)
    expect(sameInitial('T#5s', 'T#6s', 1)).toBe(false)
  })
  it('an absent value is every element its default', () => {
    expect(sameInitial('', '0', 1)).toBe(true)
    expect(sameInitial('', 'FALSE', 1)).toBe(true)
    expect(sameInitial('', 'T#0s', 1)).toBe(true)
    expect(sameInitial('', "''", 1)).toBe(true)
    expect(sameInitial('', '[0, 0, 0]', 3)).toBe(true)
    expect(sameInitial('', '[0, 1, 0]', 3)).toBe(false)
    expect(sameInitial('', '3', 1)).toBe(false)
  })
  it('arrays element by element', () => {
    expect(sameInitial('[100, 100]', '[100, 100]', 2)).toBe(true)
    expect(sameInitial('[100, 100]', '[100, 90]', 2)).toBe(false)
    expect(sameInitial('[]', '[0]', 1)).toBe(true)
  })
})
