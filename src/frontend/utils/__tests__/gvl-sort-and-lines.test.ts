import type { PLCVariable } from '../../../middleware/shared/ports/types'
import { parseIecStringToVariables } from '../generate-iec-string-to-variables'
import { generateIecVariablesToString, getIecVariableLineMap } from '../generate-iec-variables-to-string'
import { compareGvlBy, GVL_SORT_KEYS, gvlSortValue, sortGvl } from '../global-variable-lists'

const v = (name: string, extra: Partial<PLCVariable> = {}): PLCVariable => ({
  name,
  class: 'global',
  type: { definition: 'base-type', value: 'INT' },
  location: '',
  initialValue: null,
  documentation: '',
  ...extra,
})

describe('sorting a GVL', () => {
  it('lists the sort keys', () => {
    expect(GVL_SORT_KEYS.map((k) => k.key)).toEqual(['name', 'type', 'location', 'initialValue', 'documentation'])
  })

  it('reads a value per key', () => {
    const a = v('A', { type: { definition: 'base-type', value: 'BOOL' }, initialValue: '3' })
    expect(gvlSortValue(a, 'type')).toBe('BOOL')
    expect(gvlSortValue(a, 'initialValue')).toBe('3')
    expect(gvlSortValue(v('B'), 'initialValue')).toBe('')
    expect(gvlSortValue({ ...v('C'), type: undefined } as unknown as PLCVariable, 'type')).toBe('')
    expect(gvlSortValue({ ...v('D'), extra: { a: 1 } } as unknown as PLCVariable, 'extra')).toBe('{"a":1}')
    expect(gvlSortValue(v('E', { retain: true }), 'retain')).toBe('true')
  })

  it('compares in natural order with empty values last', () => {
    const x2 = v('x', { location: '%IX0.2' })
    const x10 = v('y', { location: '%IX0.10' })
    const none = v('z')
    expect(compareGvlBy(x2, x10, 'location')).toBeLessThan(0)
    expect(compareGvlBy(none, x2, 'location')).toBe(1)
    expect(compareGvlBy(x2, none, 'location')).toBe(-1)
  })

  it('sorts only the GVL, in its own slots, both ways, empty last, stable', () => {
    const all = [
      v('Pump10', { group: 'IO' }),
      v('Other', { group: 'X' }),
      v('Pump2', { group: 'IO' }),
      v('', { group: 'IO' }),
      v('Pump2', { group: 'IO', documentation: 'second' }),
    ]
    const up = sortGvl(all, 'IO', 'name')
    expect(up.map((r) => r.name)).toEqual(['Pump2', 'Other', 'Pump2', 'Pump10', ''])
    expect(up[2].documentation).toBe('second')
    const down = sortGvl(all, 'IO', 'name', true)
    expect(down.map((r) => r.name)).toEqual(['Pump10', 'Other', 'Pump2', 'Pump2', ''])
  })
})

describe("a GVL's own comment and blank lines", () => {
  const code = [
    '  VAR_GLOBAL',
    '    (* pumps *)',
    '    PumpA : INT; (* the A pump *)',
    '',
    '    (* a long note',
    '       over two lines *)',
    '    PumpB : INT;',
    '    (* the end *)',
    '',
    '  END_VAR',
  ].join('\n')

  it('keeps them with the declaration below, and the last ones after the last', () => {
    const vars = parseIecStringToVariables(code)
    expect(vars.map((x) => x.name)).toEqual(['PumpA', 'PumpB'])
    expect(vars[0].codeBefore).toBe('(* pumps *)')
    expect(vars[0].documentation).toBe('the A pump')
    expect(vars[1].codeBefore).toBe(['', '(* a long note', 'over two lines *)'].join('\n'))
    expect(vars[1].codeAfter).toBe('(* the end *)')
  })

  it('writes them back where they were, and counts them in the line map', () => {
    const vars = parseIecStringToVariables(code)
    const out = generateIecVariablesToString(vars)
    expect(out).toBe(
      [
        '  VAR_GLOBAL',
        '    (* pumps *)',
        '    PumpA : INT; (* the A pump *)',
        '',
        '    (* a long note',
        '    over two lines *)',
        '    PumpB : INT;',
        '    (* the end *)',
        '  END_VAR',
      ].join('\n'),
    )
    const map = getIecVariableLineMap(vars)
    expect(map.get('PumpA')?.line).toBe(3)
    expect(map.get('PumpB')?.line).toBe(7)
    // a round trip changes nothing more
    expect(generateIecVariablesToString(parseIecStringToVariables(out))).toBe(out)
  })

  it('keeps nothing for a POU block, or a block with no declaration', () => {
    const pou = parseIecStringToVariables('  VAR\n    (* note *)\n    a : INT;\n  END_VAR')
    expect(pou[0].codeBefore).toBeUndefined()
    const empty = parseIecStringToVariables('  VAR_GLOBAL\n    (* nothing *)\n  END_VAR')
    expect(empty).toEqual([])
  })
})
