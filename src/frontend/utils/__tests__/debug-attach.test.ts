import { decideAttach, parseCheckpointFingerprint, resolveDebugBuild } from '../debug-attach'

const rc = (over: Partial<{ enabled: boolean; stamped: boolean; armed: boolean; checkpointCount: number; fingerprint: number }> = {}) => ({
  enabled: true,
  stamped: true,
  armed: false,
  checkpointCount: 88,
  fingerprint: 0xdeadbeef,
  ...over,
})
const local = { checkpointCount: 88, fingerprint: 0xdeadbeef }

describe('decideAttach', () => {
  it('logs in with breakpoints when program, run control and checkpoint layout all match', () => {
    expect(decideAttach({ connected: true, md5Match: true, runControl: rc(), localFingerprint: local })).toEqual({
      attach: true,
      breakpoints: true,
    })
  })

  it('does not log in to an unreachable target, but a download may still work', () => {
    const d = decideAttach({ connected: false, connectError: 'ECONNREFUSED' })
    expect(d).toMatchObject({ attach: false, canDeploy: true })
    if (!d.attach) expect(d.reason).toContain('ECONNREFUSED')
  })

  it('does not log in to a different program', () => {
    expect(decideAttach({ connected: true, md5Match: false, runControl: rc(), localFingerprint: local })).toMatchObject(
      { attach: false, canDeploy: true },
    )
  })

  it('a runtime that predates the STOPINFO extension: values only', () => {
    expect(decideAttach({ connected: true, md5Match: true, localFingerprint: local })).toMatchObject({
      attach: true,
      breakpoints: false,
    })
  })

  it('a release build of the same program: values only, said so', () => {
    const d = decideAttach({
      connected: true,
      md5Match: true,
      runControl: rc({ enabled: false, stamped: false, checkpointCount: 0, fingerprint: 0 }),
      localFingerprint: local,
    })
    expect(d).toMatchObject({ attach: true, breakpoints: false })
    if (d.attach) expect(d.note).toMatch(/release build/)
  })

  it('breakpoints switched off on the machine: values only', () => {
    const d = decideAttach({ connected: true, md5Match: true, runControl: rc({ enabled: false }), localFingerprint: local })
    expect(d).toMatchObject({ attach: true, breakpoints: false })
    if (d.attach) expect(d.note).toContain('OPENPLC_RUN_CONTROL=0')
  })

  it('an unstamped (older) debug build: values only', () => {
    expect(
      decideAttach({ connected: true, md5Match: true, runControl: rc({ stamped: false }), localFingerprint: local }),
    ).toMatchObject({ attach: true, breakpoints: false })
  })

  it('a different checkpoint layout (another compiler): values only, fingerprint or count', () => {
    expect(
      decideAttach({ connected: true, md5Match: true, runControl: rc({ fingerprint: 0x12345678 }), localFingerprint: local }),
    ).toMatchObject({ attach: true, breakpoints: false })
    expect(
      decideAttach({ connected: true, md5Match: true, runControl: rc({ checkpointCount: 87 }), localFingerprint: local }),
    ).toMatchObject({ attach: true, breakpoints: false })
  })

  it('no local fingerprint: values only', () => {
    expect(decideAttach({ connected: true, md5Match: true, runControl: rc(), localFingerprint: null })).toMatchObject({
      attach: true,
      breakpoints: false,
    })
  })
})

describe('parseCheckpointFingerprint', () => {
  it('reads the sidecar the debug build writes', () => {
    expect(parseCheckpointFingerprint('{"checkpointCount": 88, "fingerprint": 3735928559}')).toEqual(local)
  })
  it('rejects missing, malformed and partial content', () => {
    expect(parseCheckpointFingerprint(undefined)).toBeNull()
    expect(parseCheckpointFingerprint('not json')).toBeNull()
    expect(parseCheckpointFingerprint('{"checkpointCount": 88}')).toBeNull()
  })
})

describe('resolveDebugBuild', () => {
  it("the project's choice wins over the board default", () => {
    expect(resolveDebugBuild(false, true)).toBe(false)
    expect(resolveDebugBuild(true, false)).toBe(true)
  })
  it("the board's default applies when the project says nothing, else release", () => {
    expect(resolveDebugBuild(undefined, true)).toBe(true)
    expect(resolveDebugBuild(undefined, undefined)).toBe(false)
  })
})
