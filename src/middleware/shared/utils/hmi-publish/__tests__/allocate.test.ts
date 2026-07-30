/**
 * Tests for the auto-publish register allocator.
 *
 * The allocator is the stability heart of the feature: same inputs →
 * same registers, persisted assignments pin, deletions never renumber
 * survivors. Every branch here is a user-visible contract documented
 * in docs/AUTO_PUBLISH.md.
 */

import { allocateHmiPublish, classifyPublishType, HMI_PUBLISH_WINDOW_BASE } from '../allocate'
import type { HmiPublishVariable } from '../types'

function variable(overrides: Partial<HmiPublishVariable> & { name: string }): HmiPublishVariable {
  return {
    type: { definition: 'base-type', value: 'INT' },
    location: '',
    publish: true,
    ...overrides,
  }
}

describe('classifyPublishType', () => {
  it.each(['BOOL', 'BYTE', 'SINT', 'USINT', 'INT', 'UINT', 'WORD'])('%s → one rw word', (value) => {
    expect(classifyPublishType({ definition: 'base-type', value })).toEqual({ kind: 'word', access: 'rw', width: 1 })
  })

  it.each(['REAL', 'DINT', 'DWORD', 'UDINT'])('%s → ro pair, low word first', (value) => {
    expect(classifyPublishType({ definition: 'base-type', value })).toEqual({
      kind: 'pair-lo-first',
      access: 'ro',
      width: 2,
    })
  })

  it('accepts lowercase type spellings', () => {
    expect(classifyPublishType({ definition: 'base-type', value: 'int' })).toEqual({
      kind: 'word',
      access: 'rw',
      width: 1,
    })
  })

  it.each(['LREAL', 'LINT', 'ULINT', 'LWORD', 'STRING', 'TIME'])('%s is unsupported', (value) => {
    expect(classifyPublishType({ definition: 'base-type', value })).toBeNull()
  })

  it('rejects non-base types (arrays, user types, FB instances)', () => {
    expect(classifyPublishType({ definition: 'array', value: 'ARRAY[0..3] OF INT' })).toBeNull()
    expect(classifyPublishType({ definition: 'user-data-type', value: 'MyStruct' })).toBeNull()
    expect(classifyPublishType({ definition: 'derived', value: 'TON' })).toBeNull()
  })
})

describe('allocateHmiPublish — basic allocation', () => {
  it('returns an empty result when nothing is published', () => {
    const result = allocateHmiPublish([variable({ name: 'A', publish: false }), variable({ name: '', publish: true })])
    expect(result.assignments).toEqual({})
    expect(result.points).toEqual([])
    expect(result.errors).toEqual([])
    expect(result.windowCount).toBe(0)
  })

  it('allocates words then pairs sequentially from the window base', () => {
    const result = allocateHmiPublish([
      variable({ name: 'W1' }),
      variable({ name: 'R1', type: { definition: 'base-type', value: 'REAL' } }),
      variable({ name: 'W2', type: { definition: 'base-type', value: 'BOOL' } }),
    ])
    expect(result.assignments).toEqual({
      W1: `%QW${HMI_PUBLISH_WINDOW_BASE}`,
      R1: `%QW${HMI_PUBLISH_WINDOW_BASE + 1}`,
      W2: `%QW${HMI_PUBLISH_WINDOW_BASE + 3}`,
    })
    expect(result.windowBase).toBe(HMI_PUBLISH_WINDOW_BASE)
    expect(result.windowCount).toBe(4)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('emits points in declaration order with group defaulting to Global', () => {
    const result = allocateHmiPublish([
      variable({ name: 'A', group: ' Axis ' }),
      variable({ name: 'B', group: '' }),
      variable({ name: 'C', type: { definition: 'base-type', value: 'DINT' } }),
    ])
    expect(result.points).toEqual([
      { name: 'A', group: 'Axis', register: 512, type: 'INT', kind: 'word', access: 'rw', scale: null },
      { name: 'B', group: 'Global', register: 513, type: 'INT', kind: 'word', access: 'rw', scale: null },
      { name: 'C', group: 'Global', register: 514, type: 'DINT', kind: 'pair-lo-first', access: 'ro', scale: null },
    ])
  })
})

describe('allocateHmiPublish — errors', () => {
  it('rejects unsupported types with a clear message', () => {
    const result = allocateHmiPublish([variable({ name: 'X', type: { definition: 'base-type', value: 'LREAL' } })])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('"X"')
    expect(result.errors[0]).toContain('LREAL')
    expect(result.assignments).toEqual({})
    expect(result.points).toEqual([])
  })

  it('rejects a manual location that is not a literal %QW', () => {
    const result = allocateHmiPublish([variable({ name: 'X', location: '%QX0.0' })])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('%QX0.0')
  })

  it('rejects an alias-bound location (not a literal address)', () => {
    const result = allocateHmiPublish([variable({ name: 'X', location: 'spindle_speed' })])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('spindle_speed')
  })

  it('collects errors across variables instead of stopping at the first', () => {
    const result = allocateHmiPublish([
      variable({ name: 'X', type: { definition: 'base-type', value: 'STRING' } }),
      variable({ name: 'Y', location: '%IW3' }),
    ])
    expect(result.errors).toHaveLength(2)
  })
})

describe('allocateHmiPublish — pinning', () => {
  it('honours a user-typed literal %QW pin verbatim', () => {
    const result = allocateHmiPublish([variable({ name: 'P', location: '%QW600' }), variable({ name: 'A' })])
    expect(result.assignments.P).toBe('%QW600')
    expect(result.assignments.A).toBe('%QW512')
  })

  it('warns when a user pin sits below the window base (hardware window risk)', () => {
    const result = allocateHmiPublish([variable({ name: 'P', location: '%QW100' })])
    expect(result.assignments.P).toBe('%QW100')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('%QW100')
    expect(result.warnings[0]).toContain('hardware')
  })

  it('keeps colliding user pins verbatim but reports the overlap', () => {
    const result = allocateHmiPublish([
      variable({ name: 'P1', location: '%QW600', type: { definition: 'base-type', value: 'REAL' } }),
      variable({ name: 'P2', location: '%QW601' }),
    ])
    expect(result.assignments.P1).toBe('%QW600')
    expect(result.assignments.P2).toBe('%QW601')
    expect(result.warnings.some((w) => w.includes('overlaps'))).toBe(true)
  })

  it('a user literal outranks a stale stored assignment', () => {
    const result = allocateHmiPublish([variable({ name: 'P', location: '%QW700' })], { P: '%QW512' })
    expect(result.assignments.P).toBe('%QW700')
  })

  it('warns when a stored pin sits below the window base', () => {
    const result = allocateHmiPublish([variable({ name: 'P' })], { P: '%QW90' })
    expect(result.assignments.P).toBe('%QW90')
    expect(result.warnings.some((w) => w.includes('%QW90'))).toBe(true)
  })

  it('ignores stored entries that are not parseable %QW addresses', () => {
    const result = allocateHmiPublish([variable({ name: 'P' })], { P: 'garbage' })
    expect(result.assignments.P).toBe('%QW512')
    expect(result.warnings).toEqual([])
  })

  it('reallocates (with a warning) a stored pin whose range no longer fits', () => {
    // B grew from a word to a pair: its stored register 513 would now
    // overlap A's stored 514.
    const result = allocateHmiPublish(
      [variable({ name: 'A' }), variable({ name: 'B', type: { definition: 'base-type', value: 'REAL' } })],
      { A: '%QW514', B: '%QW513' },
    )
    expect(result.assignments.A).toBe('%QW514')
    // B could not keep 513/514 → reallocated to the lowest free pair
    // at or above the base (512/513 are free).
    expect(result.assignments.B).toBe('%QW512')
    expect(result.warnings.some((w) => w.includes('reallocated'))).toBe(true)
  })
})

describe('allocateHmiPublish — stability contract', () => {
  const varsBefore = [
    variable({ name: 'A' }),
    variable({ name: 'B', type: { definition: 'base-type', value: 'REAL' } }),
    variable({ name: 'C', type: { definition: 'base-type', value: 'UINT' } }),
  ]

  it('is idempotent: feeding the output back changes nothing', () => {
    const first = allocateHmiPublish(varsBefore)
    const second = allocateHmiPublish(varsBefore, first.assignments)
    expect(second.assignments).toEqual(first.assignments)
    expect(second.points).toEqual(first.points)
  })

  it('deleting a variable never renumbers the survivors', () => {
    const first = allocateHmiPublish(varsBefore)
    const withoutB = varsBefore.filter((v) => v.name !== 'B')
    const second = allocateHmiPublish(withoutB, first.assignments)
    expect(second.assignments.A).toBe(first.assignments.A)
    expect(second.assignments.C).toBe(first.assignments.C)
    expect(second.assignments.B).toBeUndefined()
  })

  it('a new variable fills freed space without moving survivors', () => {
    const first = allocateHmiPublish(varsBefore)
    const mutated = [...varsBefore.filter((v) => v.name !== 'B'), variable({ name: 'D' })]
    const second = allocateHmiPublish(mutated, first.assignments)
    expect(second.assignments.A).toBe(first.assignments.A)
    expect(second.assignments.C).toBe(first.assignments.C)
    // D reuses B's freed low word — safe because HMIs bind by name.
    expect(second.assignments.D).toBe('%QW513')
  })
})

describe('allocateHmiPublish — window accounting', () => {
  it('windowCount covers up to the highest in-window register', () => {
    const result = allocateHmiPublish([variable({ name: 'P', location: '%QW520' }), variable({ name: 'A' })])
    expect(result.windowCount).toBe(9) // 512..520 inclusive
  })

  it('pins below the base do not extend the window', () => {
    const result = allocateHmiPublish([variable({ name: 'P', location: '%QW100' })])
    expect(result.windowCount).toBe(0)
  })

  it('supports a custom window base', () => {
    const result = allocateHmiPublish([variable({ name: 'A' })], {}, 100)
    expect(result.assignments.A).toBe('%QW100')
    expect(result.windowBase).toBe(100)
    expect(result.windowCount).toBe(1)
  })
})
