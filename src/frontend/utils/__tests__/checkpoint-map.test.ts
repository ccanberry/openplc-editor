import { parseCheckpointMap } from '../checkpoint-map'

describe('parseCheckpointMap', () => {
  it('parses the editor-native {id,pou,line} shape', () => {
    const json = JSON.stringify([
      { id: 0, pou: 'main', line: 10 },
      { id: 1, pou: 'main', line: 11 },
    ])
    expect(parseCheckpointMap(json)).toEqual([
      { id: 0, pou: 'main', line: 10 },
      { id: 1, pou: 'main', line: 11 },
    ])
  })

  it('accepts a { checkpoints: [...] } wrapper', () => {
    const json = JSON.stringify({ checkpoints: [{ id: 3, pou: 'helper', line: 4 }] })
    expect(parseCheckpointMap(json)).toEqual([{ id: 3, pou: 'helper', line: 4 }])
  })

  it('falls back to the raw {id,file,startLine} compiler form, stripping .st', () => {
    const json = JSON.stringify([{ id: 5, file: 'main.st', startLine: 7, startCol: 3, endLine: 7, endCol: 20 }])
    expect(parseCheckpointMap(json)).toEqual([{ id: 5, pou: 'main', line: 7 }])
  })

  it('strips a .il extension in the fallback form too', () => {
    const json = JSON.stringify([{ id: 6, file: 'seq.il', startLine: 2 }])
    expect(parseCheckpointMap(json)).toEqual([{ id: 6, pou: 'seq', line: 2 }])
  })

  it('prefers pou/line over file/startLine when both are present', () => {
    const json = JSON.stringify([{ id: 8, pou: 'main', line: 12, file: 'x.st', startLine: 99 }])
    expect(parseCheckpointMap(json)).toEqual([{ id: 8, pou: 'main', line: 12 }])
  })

  it('skips malformed entries but keeps the good ones', () => {
    const json = JSON.stringify([
      { id: 0, pou: 'main', line: 10 },
      { id: 'x', pou: 'main', line: 2 }, // bad id
      { pou: 'main', line: 3 }, // missing id
      { id: 1, pou: '', line: 4 }, // empty pou
      { id: 2, line: 5 }, // no pou and no file
      { id: 3, file: '.st', startLine: 5 }, // file resolves to empty pou
      { id: 9, pou: 'main', line: 20 },
    ])
    expect(parseCheckpointMap(json)).toEqual([
      { id: 0, pou: 'main', line: 10 },
      { id: 9, pou: 'main', line: 20 },
    ])
  })

  it('rejects non-integer lines', () => {
    expect(parseCheckpointMap(JSON.stringify([{ id: 0, pou: 'main', line: 1.5 }]))).toEqual([])
  })

  it('returns [] for invalid JSON', () => {
    expect(parseCheckpointMap('not json{')).toEqual([])
  })

  it('returns [] for a non-array, non-wrapped payload', () => {
    expect(parseCheckpointMap(JSON.stringify({ foo: 1 }))).toEqual([])
    expect(parseCheckpointMap(JSON.stringify(42))).toEqual([])
  })

  it('skips non-object array members', () => {
    expect(parseCheckpointMap(JSON.stringify([null, 5, 'x', { id: 0, pou: 'main', line: 1 }]))).toEqual([
      { id: 0, pou: 'main', line: 1 },
    ])
  })
})
