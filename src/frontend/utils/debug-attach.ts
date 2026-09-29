/**
 * Attach to a PLC that already runs this project's debug build — no download, no restart.
 *
 * The CoDeSys "login without download": on site, days after the last deploy and after any
 * number of reboots, connect and set a breakpoint. Three things must hold, and the program
 * MD5 alone proves only the first:
 *
 *   1. the target runs THIS program (MD5 of the ST source matches);
 *   2. it is a debug build and the machine allows halting (STOPINFO `runControl.enabled`);
 *   3. its checkpoint numbering is the one our local map uses (STruC++ fingerprint).
 *
 * (2) and (3) exist because a release and a debug build of one program share an MD5, and so
 * can two compiler versions that number checkpoints differently — arming ids from the wrong
 * map halts the program on the wrong statement, or never. Pure; no IPC, no store.
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
  | { attach: true }
  | {
      attach: false
      /** False when a download cannot help (breakpoints are switched off on the machine). */
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
  const rc = p.runControl
  if (!rc) {
    return {
      attach: false,
      canDeploy: true,
      reason:
        "The target's runtime does not report whether its program can be halted (it predates " +
        'attach support), so breakpoints cannot be verified without a download.',
    }
  }
  if (!rc.enabled && rc.stamped) {
    return {
      attach: false,
      canDeploy: false,
      reason:
        'The target runs a debug build, but breakpoints are switched off on this machine ' +
        '(OPENPLC_RUN_CONTROL=0 in its openplc service). A download would not change that.',
    }
  }
  if (!rc.enabled) {
    return {
      attach: false,
      canDeploy: true,
      reason: 'The target runs a release build of this program: it cannot be halted at a breakpoint.',
    }
  }
  if (!rc.stamped) {
    return {
      attach: false,
      canDeploy: true,
      reason:
        "The target's debug build predates checkpoint fingerprints, so its breakpoint numbering " +
        'cannot be checked against this project.',
    }
  }
  const local = p.localFingerprint
  if (!local) {
    return {
      attach: false,
      canDeploy: true,
      reason: "This project's debug build produced no checkpoint fingerprint to compare with the target's.",
    }
  }
  if (local.fingerprint !== rc.fingerprint >>> 0 || local.checkpointCount !== rc.checkpointCount) {
    return {
      attach: false,
      canDeploy: true,
      reason:
        `The target's debug build numbers its breakpoints differently (target ${rc.checkpointCount} ` +
        `checkpoints, map ${hex(rc.fingerprint)}; this project ${local.checkpointCount}, ` +
        `${hex(local.fingerprint)}). It was compiled by a different editor version.`,
    }
  }
  return { attach: true }
}

/**
 * Whether a build uploads with debug support. The project's own choice wins; otherwise the
 * board's default (`debugBuildByDefault` in its capabilities), otherwise no.
 */
export function resolveDebugBuild(projectChoice: boolean | undefined, boardDefault: boolean | undefined): boolean {
  return projectChoice ?? boardDefault ?? false
}
