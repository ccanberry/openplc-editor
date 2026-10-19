import { expressionAt, HOVER_MAX_VALUES, relativeName, resolveHoverKeys } from '../debug-hover'

describe('expressionAt', () => {
  const line = '  x := ARR[i].Q AND TON0.Q OR Valves[ 2 ].Out;'
  const col = (needle: string, offset = 0) => line.indexOf(needle) + 1 + offset

  it('is the word alone when nothing chains before it', () => {
    expect(expressionAt(line, col('ARR'))).toBe('ARR')
    expect(expressionAt(line, col('ARR', 2))).toBe('ARR')
    expect(expressionAt(line, col('x'))).toBe('x')
  })

  it('takes the .member and [index] steps before the hovered word', () => {
    expect(expressionAt(line, col('Q AND'))).toBe('ARR[i].Q')
    expect(expressionAt(line, col('TON0.Q', 5))).toBe('TON0.Q')
    expect(expressionAt(line, col('Out'))).toBe('Valves[2].Out')
  })

  it('is the index variable when the mouse is inside the brackets', () => {
    expect(expressionAt(line, col('i]'))).toBe('i')
  })

  it('is null off an identifier or outside the line', () => {
    expect(expressionAt(line, 1)).toBeNull()
    expect(expressionAt(line, col(':='))).toBeNull()
    expect(expressionAt(line, 0)).toBeNull()
    expect(expressionAt(line, line.length + 5)).toBeNull()
  })

  it('stops at an unmatched bracket and at a dot after something else', () => {
    expect(expressionAt('a].b', 4)).toBe('b')
    expect(expressionAt('(x).b', 5)).toBe('b')
  })
})

describe('resolveHoverKeys', () => {
  const keys = [
    'MAIN:counter',
    'MAIN:i',
    'MAIN:j',
    'MAIN:ARR[0]',
    'MAIN:ARR[1]',
    'MAIN:ARR[2]',
    'MAIN:ARR[10]',
    'MAIN:TON0.IN',
    'MAIN:TON0.Q',
    'MAIN:Valves[1].Out',
    'MAIN:Valves[2].Out',
    'OTHER:GlobalSpeed',
  ]
  const values: Record<string, string> = { 'MAIN:i': '2', 'MAIN:j': 'TRUE' }
  const read = (k: string) => values[k]

  it('resolves a leaf to itself, case-insensitively', () => {
    expect(resolveHoverKeys('COUNTER', 'MAIN:', keys, read)).toEqual({
      path: 'COUNTER',
      keys: ['MAIN:counter'],
      total: 1,
      baseKey: 'MAIN:counter',
    })
  })

  it('resolves an array to its elements, in index order', () => {
    const r = resolveHoverKeys('arr', 'MAIN:', keys, read)
    expect(r?.baseKey).toBe('MAIN:ARR')
    expect(r?.keys).toEqual(['MAIN:ARR[0]', 'MAIN:ARR[1]', 'MAIN:ARR[2]', 'MAIN:ARR[10]'])
    expect(relativeName(r!.baseKey, r!.keys[3])).toBe('[10]')
  })

  it('resolves an FB instance to its members and a member path to its leaf', () => {
    expect(resolveHoverKeys('TON0', 'MAIN:', keys, read)?.keys).toEqual(['MAIN:TON0.IN', 'MAIN:TON0.Q'])
    expect(resolveHoverKeys('TON0.Q', 'MAIN:', keys, read)?.keys).toEqual(['MAIN:TON0.Q'])
  })

  it('reads a variable index live, and normalises a literal one', () => {
    expect(resolveHoverKeys('ARR[i]', 'MAIN:', keys, read)?.keys).toEqual(['MAIN:ARR[2]'])
    expect(resolveHoverKeys('Valves[02].Out', 'MAIN:', keys, read)?.keys).toEqual(['MAIN:Valves[2].Out'])
  })

  it('stops before an index it cannot read (the whole array shows)', () => {
    expect(resolveHoverKeys('ARR[k]', 'MAIN:', keys, read)?.baseKey).toBe('MAIN:ARR')
    expect(resolveHoverKeys('ARR[j]', 'MAIN:', keys, read)?.baseKey).toBe('MAIN:ARR')
    expect(resolveHoverKeys('ARR[i+1]', 'MAIN:', keys, read)?.baseKey).toBe('MAIN:ARR')
    expect(resolveHoverKeys('[i]', 'MAIN:', keys, read)).toBeNull()
  })

  it('finds a name outside the scope (a global) by its name after the POU', () => {
    expect(resolveHoverKeys('globalspeed', 'MYFB:', keys, read)?.keys).toEqual(['OTHER:GlobalSpeed'])
  })

  it('is null for an unknown name', () => {
    expect(resolveHoverKeys('nothing', 'MAIN:', keys, read)).toBeNull()
    expect(resolveHoverKeys('', 'MAIN:', keys, read)).toBeNull()
  })

  it('caps a large array at HOVER_MAX_VALUES and says how many there are', () => {
    const big = Array.from({ length: 200 }, (_, i) => `P:BIG[${i}]`)
    const r = resolveHoverKeys('BIG', 'P:', big, read)
    expect(r?.keys).toHaveLength(HOVER_MAX_VALUES)
    expect(r?.total).toBe(200)
    expect(r?.keys[HOVER_MAX_VALUES - 1]).toBe(`P:BIG[${HOVER_MAX_VALUES - 1}]`)
  })

  it('orders keys that differ only in text and keys of different depth', () => {
    const r = resolveHoverKeys('S', 'P:', ['P:S.b', 'P:S.a.x', 'P:S.a'], read)
    expect(r?.keys).toEqual(['P:S.a', 'P:S.a.x', 'P:S.b'])
  })
})
