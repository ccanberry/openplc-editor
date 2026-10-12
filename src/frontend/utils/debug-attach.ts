/**
 * LOGIN: attach to the PLC that runs this project, with no download and no restart.
 *
 * The CoDeSys "login without download": on site, days after the last deploy and after any
 * number of reboots, connect and watch the program run. What is shown depends on what runs:
 *
 *   1. the target runs THIS program (MD5 of the ST source matches) -> LOGIN, live values,
 *      whatever kind of build it is (release or debug: one source, one MD5, one variable map);
 *   2. ...and it is a debug build with run control on (STOPINFO `runControl.enabled`) whose
 *      checkpoint numbering is the one our local map uses (STruC++ fingerprint) -> breakpoints
 *      too. Otherwise breakpoints stay off -- arming ids from the wrong map would halt the
 *      program on the wrong statement, or never -- and the reason is said.
 *
 * Only a DIFFERENT program (or no answer) refuses the login; then a download is offered.
 * Pure; no IPC, no store.
 */
import type { DebugStopInfo } from '../../middleware/shared/ports/debugger-port'

/** `checkpoint-fingerprint.json`, written next to `checkpoint-map.json` by a debug build. */
export interface CheckpointFingerprint {
  checkpointCount: number
  fingerprint: number
}

export interface AttachProbe {
  /** The debug channel answered. */
  connected: boolean
  connectError?: string
  /** The target's program MD5 equals the project's. */
  md5Match?: boolean
  /** The target's STOPINFO extension; undefined when its runtime predates it. */
  runControl?: DebugStopInfo['runControl']
  /** The fingerprint of the local debug build just compiled from this project. */
  localFingerprint?: CheckpointFingerprint | null
}

export type AttachDecision =
  | {
      attach: true
      /** Breakpoints can be armed: a debug build with this project's checkpoint layout. */
      breakpoints: boolean
      /** Why breakpoints are off, when they are. */
      note?: string
    }
  | {
      attach: false
      /** False when a download cannot help. */
      canDeploy: boolean
      reason: string
    }

export function parseCheckpointFingerprint(content: string | undefined | null): CheckpointFingerprint | null {
  if (!content) return null
  try {
    const v = JSON.parse(content) as Partial<CheckpointFingerprint>
    if (typeof v.checkpointCount !== 'number' || typeof v.fingerprint !== 'number') return null
    return { checkpointCount: v.checkpointCount, fingerprint: v.fingerprint >>> 0 }
  } catch {
    return null
  }
}

const hex = (n: number) => `0x${(n >>> 0).toString(16).padStart(8, '0')}`

export function decideAttach(p: AttachProbe): AttachDecision {
  if (!p.connected) {
    return {
      attach: false,
      canDeploy: true,
      reason: `The target's debug channel did not answer${p.connectError ? ` (${p.connectError})` : ''}.`,
    }
  }
  if (!p.md5Match) {
    return {
      attach: false,
      canDeploy: true,
      reason: 'The target is running a different program, or a different version of this one.',
    }
  }
  // The program matches: login, live values. Breakpoints only when they can be trusted.
  const valuesOnly = (note: string): AttachDecision => ({ attach: true, breakpoints: false, note })
  const rc = p.runControl
  if (!rc) {
    return valuesOnly(
      "The target's runtime does not report whether its program can be halted (it predates attach " +
        'support): live values only, no breakpoints.',
    )
  }
  if (!rc.enabled && rc.stamped) {
    return valuesOnly(
      'The target runs a debug build, but breakpoints are switched off on this machine ' +
        '(OPENPLC_RUN_CONTROL=0 in its openplc service): live values only.',
    )
  }
  if (!rc.enabled) {
    return valuesOnly(
      'The target runs a release build of this program: live values only. Download a debug build for breakpoints.',
    )
  }
  if (!rc.stamped) {
    return valuesOnly(
      "The target's debug build predates checkpoint fingerprints, so its breakpoint numbering cannot be " +
        'checked against this project: live values only.',
    )
  }
  const local = p.localFingerprint
  if (!local) {
    return valuesOnly("This project's debug build produced no checkpoint fingerprint to compare with: live values only.")
  }
  if (local.fingerprint !== rc.fingerprint >>> 0 || local.checkpointCount !== rc.checkpointCount) {
    return valuesOnly(
      `The target's debug build numbers its breakpoints differently (target ${rc.checkpointCount} ` +
        `checkpoints, map ${hex(rc.fingerprint)}; this project ${local.checkpointCount}, ` +
        `${hex(local.fingerprint)}): it was compiled by a different editor version. Live values only.`,
    )
  }
  return { attach: true, breakpoints: true }
}

/**
 * Whether a build uploads with debug support. The project's own choice wins; otherwise the
 * board's default (`debugBuildByDefault` in its capabilities), otherwise no.
 */
export function resolveDebugBuild(projectChoice: boolean | undefined, boardDefault: boolean | undefined): boolean {
  return projectChoice ?? boardDefault ?? false
}
