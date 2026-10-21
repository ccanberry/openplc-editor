import type { PLCVariable } from '../../../middleware/shared/ports/types'
import {
  DEFAULT_GVL,
  deleteGvl,
  groupField,
  gvlFromPath,
  gvlNameError,
  gvlNames,
  gvlOf,
  gvlTabName,
  gvlTabPath,
  gvlToCode,
  lastInGvl,
  mergeGvlCode,
  neighbourInGvl,
  newGvlName,
  renameGvl,
} from '../global-variable-lists'

const v = (name: string, group?: string, extra: Partial<PLCVariable> = {}): PLCVariable => ({
  name,
  class: 'global',
  type: { definition: 'base-type', value: 'INT' },
  location: '',
  documentation: '',
  ...(group !== undefined ? { group } : {}),
  ...extra,
})

describe('global variable lists', () => {
  it('names the GVL of a variable, the default one without a group', () => {
    expect(gvlOf(v('a', 'IO'))).toBe('IO')
    expect(gvlOf(v('a', '  '))).toBe(DEFAULT_GVL)
    expect(gvlOf(v('a'))).toBe(DEFAULT_GVL)
    expect(groupField(DEFAULT_GVL)).toEqual({})
    expect(groupField('IO')).toEqual({ group: 'IO' })
  })

  it('lists the stored GVLs first, then the ones only variables name', () => {
    expect(gvlNames({ globalVariables: [] })).toEqual([DEFAULT_GVL])
    expect(gvlNames({ globalVariables: [v('a', 'IO'), v('b'), v('c', 'IO')] })).toEqual(['IO', DEFAULT_GVL])
    expect(gvlNames({ globalVariables: [v('a', 'IO')], globalVariableLists: ['Empty', ' ', 'IO'] })).toEqual([
      'Empty',
      'IO',
    ])
  })

  it('maps a GVL to its tab and back', () => {
    expect(gvlTabName('IO')).toBe('IO (GVL)')
    expect(gvlFromPath(gvlTabPath('IO'))).toBe('IO')
    expect(gvlFromPath('/data/configuration/resource')).toBeNull()
    expect(gvlFromPath(undefined)).toBeNull()
  })

  it('checks GVL names', () => {
    expect(gvlNameError('1x', [])).toMatch(/identifier/)
    expect(gvlNameError('io', ['IO'])).toMatch(/already/)
    expect(gvlNameError('Io', ['IO'], 'IO')).toBeNull()
    expect(gvlNameError('Alarms', ['IO'])).toBeNull()
    expect(newGvlName(['IO'])).toBe('NewGVL')
    expect(newGvlName(['newgvl', 'NewGVL1'])).toBe('NewGVL2')
  })

  it('writes a GVL as VAR_GLOBAL blocks', () => {
    expect(gvlToCode([])).toBe('  VAR_GLOBAL\n  END_VAR')
    expect(gvlToCode([v('a'), v('b', undefined, { retain: true }), v('c', undefined, { persistent: true })])).toBe(
      [
        '  VAR_GLOBAL',
        '    a : INT;',
        '  END_VAR',
        '  VAR_GLOBAL RETAIN',
        '    b : INT;',
        '  END_VAR',
        '  VAR_GLOBAL RETAIN PERSISTENT',
        '    c : INT;',
        '  END_VAR',
      ].join('\n'),
    )
  })

  it('renames a GVL and moves its variables along', () => {
    const r = renameGvl({ globalVariables: [v('a', 'IO'), v('b')], globalVariableLists: ['IO'] }, 'IO', 'Inputs')
    expect(r.lists).toEqual(['Inputs', DEFAULT_GVL])
    expect(r.variables.map((x) => x.group)).toEqual(['Inputs', undefined])
    const back = renameGvl({ globalVariables: r.variables }, 'Inputs', DEFAULT_GVL)
    expect(back.variables[0]).not.toHaveProperty('group')
  })

  it('deletes a GVL with its variables, keeping the last GVL', () => {
    const r = deleteGvl({ globalVariables: [v('a', 'IO'), v('b')] }, 'IO')
    expect(r.lists).toEqual([DEFAULT_GVL])
    expect(r.variables.map((x) => x.name)).toEqual(['b'])
    const last = deleteGvl({ globalVariables: [v('a', 'IO')] }, 'IO')
    expect(last.lists).toEqual(['IO'])
    expect(last.variables).toEqual([])
  })

  it('puts the code of a GVL in place of its variables', () => {
    const all = [v('x', 'A'), v('io1', 'IO', { publish: true }), v('y', 'A'), v('io2', 'IO')]
    const r = mergeGvlCode(all, 'IO', [v('IO1', undefined, { retain: true }), v('io3', 'Other')])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.variables.map((x) => x.name)).toEqual(['x', 'IO1', 'io3', 'y'])
    expect(r.variables[1]).toMatchObject({ group: 'IO', publish: true, retain: true })
    expect(r.variables[2]).toMatchObject({ group: 'IO' })
    expect(r.variables[2]).not.toHaveProperty('publish')
  })

  it('appends the code of an empty GVL, and refuses a name another GVL has', () => {
    const r = mergeGvlCode([v('x', 'A')], 'New', [v('n')])
    expect(r.ok && r.variables.map((x) => [x.name, x.group])).toEqual([
      ['x', 'A'],
      ['n', 'New'],
    ])
    const clash = mergeGvlCode([v('x', 'A')], 'New', [v('X')])
    expect(clash).toEqual({ ok: false, message: 'X is declared in GVL A' })
  })

  it('finds the neighbour and the last row of a GVL in the flat list', () => {
    const all = [v('a', 'IO'), v('b'), v('c', 'IO')]
    expect(neighbourInGvl(all, 'IO', 0, 1)).toBe(2)
    expect(neighbourInGvl(all, 'IO', 2, -1)).toBe(0)
    expect(neighbourInGvl(all, 'IO', 2, 1)).toBeNull()
    expect(lastInGvl(all, 'IO')).toBe(2)
    expect(lastInGvl(all, 'None')).toBe(-1)
  })
})
