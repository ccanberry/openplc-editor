import { resolveCheckpointsToPouLocal } from '../resolve-checkpoints'

// Per-POU file exactly as the ST splitter produces it (header + VAR block +
// body), mirroring the fork smoke test: body's first statement is on file
// line 6.
const mainFile = `PROGRAM main
VAR
  a : INT;
  b : INT;
END_VAR
  a := 1;
  b := a + 2;
END_PROGRAM
`

// POU with a blank line between END_VAR and the body (xml2st commonly emits
// one) — the body's first statement is on file line 7.
const gapFile = `PROGRAM gap
VAR
  x : INT;
END_VAR

  x := 5;
END_PROGRAM
`

// POU with no variables — body starts right after the header (file line 2).
const novarFile = `PROGRAM novar
  y := 9;
END_PROGRAM
`

describe('resolveCheckpointsToPouLocal', () => {
  it('subtracts the declaration header so body lines are 1-based', () => {
    const resolved = resolveCheckpointsToPouLocal(
      [
        { id: 0, file: 'main.st', startLine: 6 },
        { id: 1, file: 'main.st', startLine: 7 },
      ],
      new Map([['main.st', mainFile]]),
    )
    expect(resolved).toEqual([
      { id: 0, pou: 'main', line: 1 },
      { id: 1, pou: 'main', line: 2 },
    ])
  })

  it('skips a blank line between END_VAR and the first statement', () => {
    const resolved = resolveCheckpointsToPouLocal([{ id: 4, file: 'gap.st', startLine: 6 }], new Map([['gap.st', gapFile]]))
    expect(resolved).toEqual([{ id: 4, pou: 'gap', line: 1 }])
  })

  it('handles a POU with no VAR block (body right after the header)', () => {
    const resolved = resolveCheckpointsToPouLocal(
      [{ id: 2, file: 'novar.st', startLine: 2 }],
      new Map([['novar.st', novarFile]]),
    )
    expect(resolved).toEqual([{ id: 2, pou: 'novar', line: 1 }])
  })

  it('strips a .il extension for IL POUs', () => {
    const ilFile = `PROGRAM seq\nVAR\n  n : INT;\nEND_VAR\n  n := n + 1;\nEND_PROGRAM\n`
    const resolved = resolveCheckpointsToPouLocal([{ id: 3, file: 'seq.il', startLine: 5 }], new Map([['seq.il', ilFile]]))
    expect(resolved).toEqual([{ id: 3, pou: 'seq', line: 1 }])
  })

  it('returns [] when the splitter did not run (monolithic fallback)', () => {
    expect(resolveCheckpointsToPouLocal([{ id: 0, file: 'program.st', startLine: 3 }], null)).toEqual([])
  })

  it('drops checkpoints whose file is not in the split map', () => {
    expect(
      resolveCheckpointsToPouLocal([{ id: 0, file: 'ghost.st', startLine: 3 }], new Map([['main.st', mainFile]])),
    ).toEqual([])
  })

  it('drops checkpoints that resolve into the declaration header (line < 1)', () => {
    // startLine 5 is the END_VAR line — above the body, so line = 5 - 6 + 1 = 0.
    expect(
      resolveCheckpointsToPouLocal([{ id: 0, file: 'main.st', startLine: 5 }], new Map([['main.st', mainFile]])),
    ).toEqual([])
  })

  it('drops a checkpoint whose file name reduces to an empty POU name', () => {
    // A pathological `.st` file name strips to an empty POU — skip it rather
    // than emit a nameless breakpoint the gutter could never key on.
    const bareFile = `PROGRAM x\n  a := 1;\nEND_PROGRAM\n`
    expect(resolveCheckpointsToPouLocal([{ id: 0, file: '.st', startLine: 2 }], new Map([['.st', bareFile]]))).toEqual([])
  })

  it('caches the body offset per file across many checkpoints', () => {
    const resolved = resolveCheckpointsToPouLocal(
      [
        { id: 0, file: 'main.st', startLine: 6 },
        { id: 1, file: 'main.st', startLine: 7 },
        { id: 2, file: 'main.st', startLine: 6 },
      ],
      new Map([['main.st', mainFile]]),
    )
    expect(resolved.map((r) => r.line)).toEqual([1, 2, 1])
  })
})
