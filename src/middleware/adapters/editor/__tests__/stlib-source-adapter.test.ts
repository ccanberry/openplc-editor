import type { StlibSourcePort } from '../../../shared/ports/stlib-source-port'
import { createEditorStlibSourceAdapter } from '../stlib-source-adapter'

let adapter: StlibSourcePort
let onLibrariesChangedHandlers: Array<() => void>

function makeArchive(name: string, version: string) {
  return {
    formatVersion: 1,
    manifest: {
      name,
      version,
      namespace: name.toLowerCase(),
      functions: [],
      functionBlocks: [],
      types: [],
      headers: [],
      isBuiltin: false,
    },
    chunks: [],
    dependencies: [],
  }
}

beforeEach(() => {
  onLibrariesChangedHandlers = []
  window.bridge = {
    loadAllLibraries: jest.fn().mockResolvedValue([makeArchive('IEC', '1.0.0'), makeArchive('Oscat', '3.3.5')]),
    onLibrariesChanged: jest.fn((cb: () => void) => {
      onLibrariesChangedHandlers.push(cb)
      return () => undefined
    }),
  } as unknown as typeof window.bridge

  adapter = createEditorStlibSourceAdapter()
})

describe('listStlibs', () => {
  it('returns one descriptor per installed archive', async () => {
    const sources = await adapter.listStlibs()

    expect(window.bridge.loadAllLibraries).toHaveBeenCalledTimes(1)
    expect(sources).toEqual([
      { name: 'IEC', version: '1.0.0', sourceLabel: 'IEC' },
      { name: 'Oscat', version: '3.3.5', sourceLabel: 'Oscat' },
    ])
  })

  it('hits the IPC bridge only once across repeated calls (cache)', async () => {
    await adapter.listStlibs()
    await adapter.listStlibs()
    await adapter.listStlibs()
    expect(window.bridge.loadAllLibraries).toHaveBeenCalledTimes(1)
  })

  it('re-fetches after a libraries:changed notification', async () => {
    await adapter.listStlibs()
    expect(window.bridge.loadAllLibraries).toHaveBeenCalledTimes(1)

    onLibrariesChangedHandlers[0]()

    await adapter.listStlibs()
    expect(window.bridge.loadAllLibraries).toHaveBeenCalledTimes(2)
  })

  it('skips archives missing a name or version (defensive)', async () => {
    ;(window.bridge.loadAllLibraries as jest.Mock).mockResolvedValueOnce([
      makeArchive('Good', '1.0.0'),
      { manifest: { name: 'NoVersion' } },
      { manifest: { version: '2.0.0' } },
      makeArchive('AlsoGood', '0.1.0'),
    ])
    const sources = await adapter.listStlibs()
    expect(sources.map((s) => s.name)).toEqual(['Good', 'AlsoGood'])
  })
})

describe('readStlib', () => {
  it('returns a JSON string of the cached archive', async () => {
    await adapter.listStlibs() // prime the cache
    const json = await adapter.readStlib('IEC')
    const parsed = JSON.parse(json) as { manifest: { name: string; version: string } }
    expect(parsed.manifest.name).toBe('IEC')
    expect(parsed.manifest.version).toBe('1.0.0')
  })

  it('primes the cache automatically on first read', async () => {
    const json = await adapter.readStlib('Oscat')
    expect(window.bridge.loadAllLibraries).toHaveBeenCalledTimes(1)
    expect(JSON.parse(json).manifest.name).toBe('Oscat')
  })

  it('throws when the sourceLabel is unknown', async () => {
    await expect(adapter.readStlib('MissingLib')).rejects.toThrow(/Unknown stlib source 'MissingLib'/)
  })
})

describe('libraries:changed subscription', () => {
  it('registers exactly one listener via window.bridge', () => {
    expect(window.bridge.onLibrariesChanged).toHaveBeenCalledTimes(1)
  })

  it('survives missing onLibrariesChanged (older bridges / test harnesses)', () => {
    window.bridge = {
      loadAllLibraries: jest.fn().mockResolvedValue([]),
    } as unknown as typeof window.bridge
    expect(() => createEditorStlibSourceAdapter()).not.toThrow()
  })
})

describe('stubs for what a library grafts into the consumer', () => {
  const v = (name: string, cls: string, type?: string) => ({ name, class: cls, type: type ? { value: type } : undefined })
  function read(extra: Record<string, unknown>, manifestExtra: Record<string, unknown> = {}) {
    const archive = makeArchive('nc_link', '1.0.0')
    Object.assign(archive.manifest, manifestExtra)
    window.bridge.loadAllLibraries = jest.fn().mockResolvedValue([{ ...archive, ...extra }])
    return adapter.readStlib('nc_link').then(
      (json) =>
        JSON.parse(json) as {
          manifest: {
            functionBlocks: Array<{ name: string; inputs: unknown[]; outputs: unknown[]; inouts: unknown[] }>
            functions: Array<{ name: string; returnType: string; parameters: unknown[] }>
            types: Array<{ name: string; kind: string; fields?: unknown[] }>
            globals: Array<{ name: string; type: string }>
          }
        },
    )
  }

  it('declares C/C++ blocks, ST blocks, functions, programs, types and globals', async () => {
    const m = (
      await read({
        cppBlocks: [{ name: 'RCNC_SYNC', code: '', variables: [v('EN', 'input', 'BOOL'), v('OK', 'output')] }],
        stPous: [
          { name: 'FB_X', pouType: 'function-block', interface: { variables: [v('IO', 'inOut', 'INT')] } },
          {
            name: 'P_SET',
            pouType: 'function',
            interface: { returnType: 'BOOL', variables: [v('N', 'input', 'INT'), v('R', 'inOut', 'REAL'), v('O', 'output', 'INT')] },
            documentation: 'doc',
          },
          { name: 'F_NORET', pouType: 'function', interface: { variables: [] } },
          { name: 'NC_LINK_IN', pouType: 'program' },
          { pouType: 'program' },
          { name: 'ODD', pouType: 'something' },
        ],
        dataTypes: [
          { name: 'ST_A', derivation: 'structure', variable: [{ name: 'F', type: { value: 'INT' } }, { name: 'G' }, {}] },
          { name: 'ST_S', derivation: 'structure' },
          { name: 'E_A', derivation: 'enumerated' },
          { name: 'T_A', derivation: 'directly-derived' },
          {},
        ],
        globalVariables: [{ name: 'P_VAL', type: { value: 'ARRAY [0..2047] OF REAL' } }, { name: 'NOTYPE' }, {}],
      })
    ).manifest
    expect(m.functionBlocks.map((f) => f.name)).toEqual(['RCNC_SYNC', 'FB_X'])
    expect(m.functionBlocks[0]).toMatchObject({ inputs: [{ name: 'EN', type: 'BOOL' }], outputs: [{ name: 'OK', type: 'BOOL' }] })
    expect(m.functionBlocks[1]).toMatchObject({ inouts: [{ name: 'IO', type: 'INT' }] })
    expect(m.functions.map((f) => [f.name, f.returnType])).toEqual([
      ['P_SET', 'BOOL'],
      ['F_NORET', 'BOOL'],
      ['NC_LINK_IN', 'BOOL'],
    ])
    expect(m.functions[0]?.parameters).toEqual([
      { name: 'N', type: 'INT', direction: 'input' },
      { name: 'R', type: 'REAL', direction: 'inout' },
      { name: 'O', type: 'INT', direction: 'output' },
    ])
    expect(m.functions[2]?.parameters).toEqual([])
    expect(m.types).toEqual([
      { name: 'ST_A', kind: 'struct', fields: [{ name: 'F', type: 'INT' }, { name: 'G', type: 'BOOL' }] },
      { name: 'ST_S', kind: 'struct', fields: [] },
      { name: 'E_A', kind: 'enum' },
      { name: 'T_A', kind: 'alias' },
    ])
    expect(m.globals).toEqual([{ name: 'P_VAL', type: 'ARRAY [0..2047] OF REAL' }])
  })

  it("an author's manifest entry of the same name wins", async () => {
    const m = (
      await read(
        {
          cppBlocks: [{ name: 'RCNC_SYNC', code: '', variables: [] }],
          stPous: [{ name: 'p_set', pouType: 'function' }],
          dataTypes: [{ name: 'st_a', derivation: 'structure' }],
          globalVariables: [{ name: 'p_val', type: { value: 'INT' } }],
        },
        {
          functionBlocks: [{ name: 'RCNC_SYNC', inputs: [], outputs: [], inouts: [] }],
          functions: [{ name: 'P_SET', returnType: 'INT', parameters: [] }],
          types: [{ name: 'ST_A', kind: 'struct' }],
          globals: [{ name: 'P_VAL', type: 'REAL' }],
        },
      )
    ).manifest
    expect(m.functionBlocks).toHaveLength(1)
    expect(m.functions).toEqual([{ name: 'P_SET', returnType: 'INT', parameters: [] }])
    expect(m.types).toHaveLength(1)
    expect(m.globals).toEqual([{ name: 'P_VAL', type: 'REAL' }])
  })

  it('leaves an archive without grafted content as it is', async () => {
    const m = (await read({})).manifest
    expect(m.functions).toEqual([])
    expect((m as { globals?: unknown }).globals).toBeUndefined()
  })

  it('fills a manifest that lacks the lists', async () => {
    window.bridge.loadAllLibraries = jest.fn().mockResolvedValue([
      { manifest: { name: 'bare', version: '1' }, cppBlocks: [{ name: 'C', code: '', variables: [] }] },
      { cppBlocks: [{ name: 'C', code: '', variables: [] }] },
    ])
    const m = JSON.parse(await adapter.readStlib('bare')) as { manifest: { functionBlocks: unknown[]; globals: unknown[] } }
    expect(m.manifest.functionBlocks).toHaveLength(1)
    expect(m.manifest.globals).toEqual([])
  })
})
