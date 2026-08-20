/**
 * Tests for the retain compile step.
 *
 * Covers the emitted `retain-names.json` contract: always emitted
 * (empty `names` when nothing is flagged, so a stale file on the
 * runtime is overwritten), exact-leaf resolution, array/struct
 * expansion to element leaves, case-insensitive matching that emits
 * the leaf path verbatim, dedupe across flags, the no-leaf warning,
 * and the unreadable-map warning.
 */

import { collectRetainedGlobals, collectRetainedInstanceSuffixes } from '../steps/collect-retained-globals'

const debugMap = (paths: string[]): string =>
  JSON.stringify({
    version: 1,
    md5: 'abc123',
    typeTags: { INT: 3 },
    arrays: [],
    leaves: paths.map((path, elemIdx) => ({ arrayIdx: 0, elemIdx, path, type: 'INT', size: 2 })),
  })

describe('collectRetainedGlobals', () => {
  it('emits an empty names file when nothing is flagged (overwrites stale files on the target)', () => {
    const result = collectRetainedGlobals({
      globalVariables: [{ name: 'CFG_SPEED' }, { name: 'CFG_LIMIT', retain: false }],
      debugMapContent: debugMap(['CFG_SPEED', 'CFG_LIMIT']),
      md5: 'abc123',
    })
    expect(result.names).toEqual([])
    expect(result.warnings).toEqual([])
    expect(JSON.parse(result.retainNamesJson)).toEqual({ version: 1, md5: 'abc123', names: [] })
    expect(result.retainNamesJson.endsWith('\n')).toBe(true)
  })

  it('declares a scalar global by its exact leaf path', () => {
    const result = collectRetainedGlobals({
      globalVariables: [{ name: 'CFG_SPEED', retain: true }, { name: 'CFG_LIMIT' }],
      debugMapContent: debugMap(['CFG_SPEED', 'CFG_LIMIT']),
      md5: 'abc123',
    })
    expect(result.names).toEqual(['CFG_SPEED'])
    expect(result.warnings).toEqual([])
    expect(JSON.parse(result.retainNamesJson).names).toEqual(['CFG_SPEED'])
  })

  it('expands array and struct globals to their element leaves', () => {
    const result = collectRetainedGlobals({
      globalVariables: [
        { name: 'SPEED', retain: true },
        { name: 'POS', retain: true },
      ],
      debugMapContent: debugMap(['SPEED[1]', 'SPEED[2]', 'SPEEDY', 'POS.X', 'POS.Y', 'POSITION']),
      md5: 'abc123',
    })
    expect(result.names).toEqual(['SPEED[1]', 'SPEED[2]', 'POS.X', 'POS.Y'])
    expect(result.warnings).toEqual([])
  })

  it('matches case-insensitively but emits the leaf path verbatim', () => {
    const result = collectRetainedGlobals({
      globalVariables: [{ name: 'TotalMassFlowrate', retain: true }],
      debugMapContent: debugMap(['TOTALMASSFLOWRATE[3]']),
      md5: 'abc123',
    })
    expect(result.names).toEqual(['TOTALMASSFLOWRATE[3]'])
    expect(result.warnings).toEqual([])
  })

  it('dedupes leaves claimed by more than one flagged global', () => {
    const result = collectRetainedGlobals({
      globalVariables: [
        { name: 'CFG_SPEED', retain: true },
        { name: 'cfg_speed', retain: true },
      ],
      debugMapContent: debugMap(['CFG_SPEED']),
      md5: 'abc123',
    })
    expect(result.names).toEqual(['CFG_SPEED'])
  })

  it('warns and skips a flagged global with no debug-map leaf', () => {
    const result = collectRetainedGlobals({
      globalVariables: [
        { name: 'GONE', retain: true },
        { name: 'CFG_SPEED', retain: true },
      ],
      debugMapContent: debugMap(['CFG_SPEED']),
      md5: 'abc123',
    })
    expect(result.names).toEqual(['CFG_SPEED'])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('GONE')
  })

  it('warns once and declares nothing when the debug map is unreadable', () => {
    const result = collectRetainedGlobals({
      globalVariables: [{ name: 'CFG_SPEED', retain: true }],
      debugMapContent: 'not json at all',
      md5: 'abc123',
    })
    expect(result.names).toEqual([])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('debug map')
    expect(JSON.parse(result.retainNamesJson).names).toEqual([])
  })

  it('treats a map without a leaves array as unreadable', () => {
    const result = collectRetainedGlobals({
      globalVariables: [{ name: 'CFG_SPEED', retain: true }],
      debugMapContent: JSON.stringify({ version: 1, md5: 'abc123' }),
      md5: 'abc123',
    })
    expect(result.names).toEqual([])
    expect(result.warnings).toHaveLength(1)
  })

  it('ignores malformed leaves (missing or non-string path)', () => {
    const content = JSON.stringify({
      leaves: [{ path: 'CFG_SPEED' }, { path: 42 }, {}, null, { path: '' }],
    })
    const result = collectRetainedGlobals({
      globalVariables: [{ name: 'CFG_SPEED', retain: true }],
      debugMapContent: content,
      md5: 'abc123',
    })
    expect(result.names).toEqual(['CFG_SPEED'])
    expect(result.warnings).toEqual([])
  })

  it('carries the program md5 into the emitted file', () => {
    const result = collectRetainedGlobals({
      globalVariables: [],
      debugMapContent: '',
      md5: 'deadbeef',
    })
    expect(JSON.parse(result.retainNamesJson).md5).toBe('deadbeef')
  })
})

describe('collectRetainedInstanceSuffixes (POU-level VAR RETAIN)', () => {
  const pous = [
    {
      name: 'PLC_PRG',
      pouType: 'program',
      variables: [
        { name: 'maintenance_inst', type: { value: 'MAINTENANCE' } },
        { name: 'plain', type: { value: 'INT' } },
      ],
    },
    {
      name: 'MAINTENANCE',
      pouType: 'function-block',
      variables: [
        { name: 'LubricationStartTime', retain: true, type: { value: 'DT' } },
        { name: 'scratch', type: { value: 'INT' } },
        { name: 'inner_inst', type: { value: 'INNER' } },
      ],
    },
    {
      name: 'INNER',
      pouType: 'function-block',
      variables: [{ name: 'Count', retain: true, type: { value: 'INT' } }],
    },
  ]

  it('derives instance suffixes through nested function blocks', () => {
    expect(collectRetainedInstanceSuffixes(pous)).toEqual([
      'MAINTENANCE_INST.LUBRICATIONSTARTTIME',
      'MAINTENANCE_INST.INNER_INST.COUNT',
    ])
  })

  it('returns nothing when no POU flags retain', () => {
    expect(
      collectRetainedInstanceSuffixes([
        { name: 'P', pouType: 'program', variables: [{ name: 'a', type: { value: 'INT' } }] },
      ]),
    ).toEqual([])
  })

  it('survives a POU-type cycle without recursing forever', () => {
    const cyclic = [
      { name: 'P', pouType: 'program', variables: [{ name: 'a_inst', type: { value: 'A' } }] },
      {
        name: 'A',
        pouType: 'function-block',
        variables: [
          { name: 'kept', retain: true, type: { value: 'INT' } },
          { name: 'b_inst', type: { value: 'B' } },
        ],
      },
      { name: 'B', pouType: 'function-block', variables: [{ name: 'back', type: { value: 'A' } }] },
    ]
    expect(collectRetainedInstanceSuffixes(cyclic)).toEqual(['A_INST.KEPT'])
  })

  it('expands instance suffixes against INSTANCE-prefixed leaves and warns on misses', () => {
    const content = JSON.stringify({
      leaves: [
        { path: 'GLOBAL_THING' },
        { path: 'INSTANCE0.MAINTENANCE_INST.LUBRICATIONSTARTTIME' },
        { path: 'INSTANCE0.MAINTENANCE_INST.INNER_INST.COUNT' },
        { path: 'INSTANCE1.MAINTENANCE_INST.LUBRICATIONSTARTTIME' },
      ],
    })
    const result = collectRetainedGlobals({
      globalVariables: [],
      debugMapContent: content,
      md5: 'abc123',
      pous,
    })
    expect(result.names).toEqual([
      'INSTANCE0.MAINTENANCE_INST.LUBRICATIONSTARTTIME',
      'INSTANCE1.MAINTENANCE_INST.LUBRICATIONSTARTTIME',
      'INSTANCE0.MAINTENANCE_INST.INNER_INST.COUNT',
    ])
    expect(result.warnings).toEqual([])
  })

  it('warns when a retained POU variable has no leaf under any instance', () => {
    const result = collectRetainedGlobals({
      globalVariables: [],
      debugMapContent: JSON.stringify({ leaves: [{ path: 'INSTANCE0.OTHER' }] }),
      md5: 'abc123',
      pous,
    })
    expect(result.names).toEqual([])
    expect(result.warnings).toHaveLength(2)
  })
})
