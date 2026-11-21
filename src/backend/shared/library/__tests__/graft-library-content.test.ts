import { type GraftableProject, type GraftArchive, graftLibraryContent } from '../graft-library-content'

const project = (over: Record<string, unknown> = {}) => ({
  libraries: [{ name: 'lib_a' }, { name: 'lib_b' }],
  pous: [{ name: 'PLC_PRG' }, { name: 'MINE' }],
  dataTypes: [{ name: 'ST_OWN' }],
  configurations: { resource: { globalVariables: [{ name: 'gOwn' }] } },
  ...over,
})

const libA: GraftArchive = {
  manifest: { name: 'lib_a' },
  cppBlocks: [{ name: 'CBLOCK', code: 'void loop() {}', variables: [{ name: 'X' }], documentation: 'doc' }],
  stPous: [{ name: 'NC_IN', pouType: 'program' }, { name: 'mine', pouType: 'program' }, { notAName: 1 }],
  dataTypes: [{ name: 'ST_LIB' }, { name: 'st_own' }],
  globalVariables: [{ name: 'gLib' }, { name: 'GOWN' }],
}

describe('graftLibraryContent', () => {
  it('adds what an enabled library ships, the project winning on a name', () => {
    const { projectData, added } = graftLibraryContent(project(), [libA])
    expect(projectData.pous.map((p) => p.name)).toEqual(['PLC_PRG', 'MINE', 'CBLOCK', 'NC_IN'])
    expect(projectData.pous[2]).toEqual({
      name: 'CBLOCK',
      pouType: 'function-block',
      interface: { variables: [{ name: 'X' }] },
      body: { language: 'cpp', value: 'void loop() {}' },
      documentation: 'doc',
    })
    expect(projectData.dataTypes?.map((t) => t.name)).toEqual(['ST_OWN', 'ST_LIB'])
    expect(projectData.configurations?.resource?.globalVariables?.map((g) => g.name)).toEqual(['gOwn', 'gLib'])
    expect(added).toEqual([{ library: 'lib_a', pous: ['CBLOCK', 'NC_IN'], dataTypes: ['ST_LIB'], globals: ['gLib'] }])
  })

  it('the first library wins between libraries, and a disabled one adds nothing', () => {
    const libB: GraftArchive = { manifest: { name: 'lib_b' }, stPous: [{ name: 'NC_IN' }, { name: 'B_ONLY' }] }
    const off: GraftArchive = { manifest: { name: 'lib_off' }, stPous: [{ name: 'OFF' }] }
    const { projectData } = graftLibraryContent(project(), [libA, libB, off])
    expect(projectData.pous.map((p) => p.name)).toEqual(['PLC_PRG', 'MINE', 'CBLOCK', 'NC_IN', 'B_ONLY'])
  })

  it('returns the project itself when nothing is enabled or nothing is new', () => {
    const none = project({ libraries: undefined })
    expect(graftLibraryContent(none, [libA]).projectData).toBe(none)
    const p = project()
    const empty: GraftArchive = { manifest: { name: 'lib_a' }, cppBlocks: [{ name: 'MINE', code: '', variables: [] }] }
    expect(graftLibraryContent(p, [empty])).toEqual({ projectData: p, added: [] })
  })

  it('creates the type list and the resource when the project has none', () => {
    const bare: GraftableProject = { libraries: [{ name: 'lib_a' }], pous: [] }
    const lib: GraftArchive = {
      manifest: { name: 'lib_a' },
      cppBlocks: [{ name: 'C', code: '', variables: [] }],
      dataTypes: [{ name: 'T' }],
      globalVariables: [{ name: 'G' }],
    }
    const { projectData } = graftLibraryContent(bare, [lib])
    expect(projectData.pous[0]).toMatchObject({ name: 'C', documentation: '' })
    expect(projectData.dataTypes).toEqual([{ name: 'T' }])
    expect(projectData.configurations).toEqual({ resource: { globalVariables: [{ name: 'G' }] } })
  })

  it('adds globals to a configuration without a resource', () => {
    const p: GraftableProject = { libraries: [{ name: 'lib_a' }], pous: [], configurations: {} }
    const { projectData } = graftLibraryContent(p, [{ manifest: { name: 'lib_a' }, globalVariables: [{ name: 'G' }] }])
    expect(projectData.configurations).toEqual({ resource: { globalVariables: [{ name: 'G' }] } })
  })
})
