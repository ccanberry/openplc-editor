import type { PLCPou, PLCVariable } from '../../../middleware/shared/ports/types'
import { pousWithImplicitExternals, variablesWithImplicitExternals } from '../implicit-externals'

const v = (name: string, cls: PLCVariable['class'] = 'local'): PLCVariable =>
  ({
    name,
    class: cls,
    type: { definition: 'base-type', value: 'INT' },
    location: '%MW1',
    initialValue: '3',
    documentation: '',
    debug: true,
  }) as PLCVariable

const pou = (name: string, body: unknown, variables: PLCVariable[] = [], pouType = 'program'): PLCPou =>
  ({ name, pouType, interface: { variables }, body: { language: 'st', value: body } }) as unknown as PLCPou

describe('variablesWithImplicitExternals', () => {
  const globals = [v('gCount', 'global'), v('gFlag', 'global'), v('', 'global')]

  it('adds the globals the body names as externals, without their address or start value', () => {
    const out = variablesWithImplicitExternals(pou('Main', 'x := GCOUNT + 1;', [v('x')]), globals)
    expect(out.map((o) => o.name)).toEqual(['x', 'gCount'])
    expect(out[1]).toMatchObject({ class: 'external', location: '', debug: false })
    expect(out[1].initialValue).toBeUndefined()
  })

  it('lets a local hide the global, and skips functions and an empty globals list', () => {
    const locals = [v('gCount')]
    expect(variablesWithImplicitExternals(pou('Main', 'gCount := 1;', locals), globals)).toBe(locals)
    const fn = pou('F', 'F := gCount;', locals, 'function')
    expect(variablesWithImplicitExternals(fn, globals)).toBe(locals)
    expect(variablesWithImplicitExternals(pou('Main', 'gCount', locals), [])).toBe(locals)
    expect(variablesWithImplicitExternals(pou('Main', 'gCount', locals), undefined)).toBe(locals)
  })

  it('searches a graphical body as its JSON, and survives one that cannot be serialised', () => {
    const graphical = pou('Ld', { rungs: [{ nodes: [{ data: { variable: { name: 'gFlag' } } }] }] })
    expect(variablesWithImplicitExternals(graphical, globals).map((o) => o.name)).toEqual(['gFlag'])
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(variablesWithImplicitExternals(pou('Bad', cyclic), globals)).toEqual([])
    expect(variablesWithImplicitExternals(pou('Empty', undefined), globals)).toEqual([])
    const noInterface = { name: 'N', pouType: 'program', body: { value: 'gFlag' } } as unknown as PLCPou
    expect(variablesWithImplicitExternals(noInterface, globals).map((o) => o.name)).toEqual(['gFlag'])
  })

  it('caches per body, variables and globals', () => {
    const own = [v('x')]
    const p = pou('Main', 'gCount', own)
    const first = variablesWithImplicitExternals(p, globals)
    expect(variablesWithImplicitExternals(p, globals)).toBe(first)
    const fewer: PLCVariable[] = []
    expect(variablesWithImplicitExternals({ ...p, interface: { variables: fewer } } as PLCPou, globals)).toEqual([
      expect.objectContaining({ name: 'gCount' }),
    ])
  })
})

describe('pousWithImplicitExternals', () => {
  it('replaces only the POUs that gain externals, and memoises on its inputs', () => {
    const globals = [v('gCount', 'global')]
    const a = pou('A', 'gCount := 1;')
    const b = pou('B', 'nothing here')
    const pous = [a, b]
    const out = pousWithImplicitExternals(pous, globals)
    expect(out[0]).not.toBe(a)
    expect(out[0].interface?.variables.map((o) => o.name)).toEqual(['gCount'])
    expect(out[1]).toBe(b)
    expect(pousWithImplicitExternals(pous, globals)).toBe(out)
    expect(pousWithImplicitExternals([a], globals)).not.toBe(out)
  })
})
