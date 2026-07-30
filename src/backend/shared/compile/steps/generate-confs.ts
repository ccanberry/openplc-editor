/**
 * Author the runtime v4 conf/* JSON strings (Modbus slave + master,
 * S7Comm, OPC-UA, EtherCAT) from a project's `servers`,
 * `remoteDevices`, and program metadata.
 *
 * Editor-canonical behaviour — every output string is byte-identical
 * to what the editor's `compileProgram` used to author inline in the
 * runtime-v4 branch.  Each conf is opaque to the
 * `composeRuntimeV4Bundle` step (which just slots them into
 * `conf/<name>.json`), so byte-identical here means byte-identical
 * uploads to the runtime, which means the v4 runtime sees the same
 * conf files regardless of which editor produced the program.
 *
 * Why this lives in shared:
 *  - The atomic generators (`generateModbusSlaveConfig`,
 *    `generateModbusMasterConfig`, `generateS7CommConfig`,
 *    `generateOpcUaConfig`, `generateEthercatConfig`,
 *    `validateEthercatConfig`) are already shared.
 *  - The orchestration (error-handling for OPC-UA, validation gate
 *    for EtherCAT, the specific log-message strings) used to live
 *    in two places: editor's `compiler-module.ts` and web's
 *    `compiler-adapter.ts`.  Drift between them surfaces as
 *    inconsistent error UX (one platform fails fast, the other
 *    silently produces a bad config).  This module is the single
 *    place where that orchestration lives.
 *
 * Pure function: no fs I/O, no DOM, no global state.  Caller passes
 * the project's `servers` / `remoteDevices`, the OPC-UA
 * resolver-input (`debugMapContent` + `instances`), and a log
 * callback that maps shared-pipeline progress events to the
 * platform's native log channel.
 */

// Frontend/utils imports — pure data transformers, Node-safe (no
// DOM dependencies).  Same legacy-tree path the editor's compiler-
// module.ts uses; flagged as an organisational smell (`backend-shared
// → frontend`) but functional, see the build-pipeline refactor plan.
import { getErrorMessage } from '../../../../frontend/utils/get-error-message'
import { generateModbusSlaveConfig } from '../../../../frontend/utils/modbus/generate-modbus-slave-config'
import { generateOpcUaConfig, OpcUaConfigError } from '../../../../frontend/utils/opcua'
import { generateS7CommConfig } from '../../../../frontend/utils/s7comm'
import type { HmiPublishPoint } from '../../../../middleware/shared/utils/hmi-publish'
import { generateEthercatConfig } from '../../ethercat/generate-ethercat-config'
import { validateEthercatConfig } from '../../ethercat/validate-ethercat-config'
import type { PLCRemoteDevice, PLCServer } from '../../types/PLC/open-plc'
import { generateModbusMasterConfig } from '../../utils/modbus/generate-modbus-master-config'

/**
 * Tagged shape for the program instances OPC-UA needs to resolve
 * `%I/%Q/%M` addresses against the runtime's variable table.  Matches
 * the editor's `projectData.configuration.resource.instances` slice.
 */
export interface OpcUaInstance {
  name: string
  task: string
  program: string
}

export interface GenerateConfsInput {
  /** Project's `data.servers` — Modbus slave, S7Comm, OPC-UA all
   *  read from this. */
  servers: PLCServer[] | undefined
  /** Project's `data.remoteDevices` — Modbus master + EtherCAT read
   *  from this. */
  remoteDevices: PLCRemoteDevice[] | undefined
  /** Program instances (mapped from `projectData.configuration.resource.
   *  instances`).  OPC-UA resolver uses this to bind addresses to
   *  the program that owns them. */
  instances: OpcUaInstance[]
  /** Strucpp's `debug-map.json` content (NOT `generated_debug.cpp`).
   *  OPC-UA's `parseDebugMap` reads this to resolve `%I/%Q/%M`.
   *  Caller pulls it out of the strucpp emitted-files map. */
  debugMapContent: string
  /** Auto-publish symbol data.  Present only when the project has
   *  publish-flagged globals — drives `conf/hmi_map.json` emission.
   *  `md5` is the same PROGRAM_MD5 `debug-map.json` carries so HMIs
   *  can verify they bind against the deployed program. */
  hmiPublish?: {
    md5: string
    windowBase: number
    windowCount: number
    points: HmiPublishPoint[]
  }
  /** Log channel.  OPC-UA generation emits informational progress
   *  via this; error logs go here too before the relevant errors
   *  are rethrown.  Each adapter wires its native log channel
   *  through this callback. */
  log: (message: string, level: 'info' | 'warning' | 'error') => void
}

/**
 * Each output is the JSON string that lands at `conf/<name>.json` in
 * the runtime v4 bundle, or `null` when the project has no config of
 * that type (the composer skips the file in that case).
 */
export interface GenerateConfsOutput {
  modbusSlave: string | null
  modbusMaster: string | null
  s7Comm: string | null
  opcUa: string | null
  /** EtherCAT is gated on `validateEthercatConfig`; this function
   *  throws BEFORE returning when validation fails.  Successful
   *  return guarantees either `null` (no devices) or a string that
   *  passed validation. */
  ethercat: string | null
  /** Auto-publish symbol file (`conf/hmi_map.json`).  `null` when the
   *  project publishes nothing. */
  hmiMap: string | null
}

/**
 * Errors:
 *  - `OpcUaConfigError` (from `generateOpcUaConfig`) is logged with
 *    `OPC-UA Configuration Error:` prefix and rethrown.  Other
 *    errors from OPC-UA generation are logged as `Failed to
 *    generate OPC-UA config:` and rethrown.  The rethrow stops the
 *    caller's pipeline — same gate the editor's compileProgram
 *    runtime-v4 try/catch uses.
 *  - EtherCAT validation errors throw `Error('EtherCAT
 *    configuration is invalid: <joined messages>')` without logging
 *    here; caller surfaces the error message in its own catch.
 *
 * Both error paths abort BEFORE the composer runs — matching the
 * editor's "fail fast" gate.
 */
export function generateRuntimeConfs(input: GenerateConfsInput): GenerateConfsOutput {
  const { servers, remoteDevices, instances, debugMapContent, hmiPublish, log } = input

  // Modbus slave / master / S7Comm: pure helpers.  Each returns `null`
  // when the project has no config of that type.  Master also forwards
  // non-fatal skip diagnostics (e.g. an RTU device missing a serial
  // port) through `log` so they reach the build console.
  // Type assertions match the editor's call sites — the generators
  // accept a narrower shape than `PLCServer[]` / `PLCRemoteDevice[]`
  // but the runtime values are compatible.
  const modbusSlave = generateModbusSlaveConfig(servers as Parameters<typeof generateModbusSlaveConfig>[0])
  const modbusMaster = generateModbusMasterConfig(
    remoteDevices as Parameters<typeof generateModbusMasterConfig>[0],
    (msg) => log(msg, 'warning'),
  )
  const s7Comm = generateS7CommConfig(servers)

  // OPC-UA: throws `OpcUaConfigError` on invalid project state.
  // Editor logs the error message with a specific prefix BEFORE
  // rethrowing so the user sees the diagnostic in the compile log
  // even if the outer pipeline catches and short-circuits.
  let opcUa: string | null = null
  try {
    opcUa = generateOpcUaConfig(servers, debugMapContent, instances, (msg) => log(msg, 'info'))
  } catch (error) {
    if (error instanceof OpcUaConfigError) {
      log(`OPC-UA Configuration Error:\n${error.message}`, 'error')
    } else {
      log(`Failed to generate OPC-UA config: ${getErrorMessage(error)}`, 'error')
    }
    throw error
  }

  // EtherCAT: validate BEFORE returning so a bad config aborts the
  // compile before the composer runs.  Validation failures throw a
  // plain `Error` — caller's try/catch wraps it with the runtime-v4
  // "Stopping compilation process" log line, matching the editor.
  const ethercat = generateEthercatConfig(remoteDevices)
  const ethercatErrors = validateEthercatConfig(ethercat)
  if (ethercatErrors.length > 0) {
    throw new Error(`EtherCAT configuration is invalid: ${ethercatErrors.join('; ')}`)
  }

  // Auto-publish symbol file.  Pure transform of the allocation the
  // pipeline's publish step produced — same md5 as debug-map.json so
  // HMIs can verify the map matches the deployed program before
  // binding registers by name.
  let hmiMap: string | null = null
  if (hmiPublish && hmiPublish.points.length > 0) {
    hmiMap = generateHmiMapConfig(hmiPublish)
    // The :502 slave only exposes registers below its holding-register
    // qw_count.  The default (1024) covers the %QW512 window, but a
    // project that shrank the buffer would silently truncate the
    // published points — surface that loudly.
    if (modbusSlave) {
      warnOnTruncatedPublishWindow(modbusSlave, hmiPublish, log)
    }
  }

  return { modbusSlave, modbusMaster, s7Comm, opcUa, ethercat, hmiMap }
}

/**
 * Render `conf/hmi_map.json`.  Contract (see docs/AUTO_PUBLISH.md):
 * `md5` = PROGRAM_MD5 of the deployed program (same value as
 * debug-map.json / FC 0x45), `window` = the reserved auto-assign
 * span, `points` = one entry per published variable in declaration
 * order (`register` is the LOW word for `pair-lo-first` points).
 */
export function generateHmiMapConfig(hmiPublish: NonNullable<GenerateConfsInput['hmiPublish']>): string {
  return JSON.stringify(
    {
      md5: hmiPublish.md5,
      window: { base: hmiPublish.windowBase, count: hmiPublish.windowCount },
      points: hmiPublish.points,
    },
    null,
    2,
  )
}

/** Warn when the Modbus slave's holding-register buffer cuts off part
 *  of the published window (registers >= qw_count are unreachable). */
function warnOnTruncatedPublishWindow(
  modbusSlave: string,
  hmiPublish: NonNullable<GenerateConfsInput['hmiPublish']>,
  log: GenerateConfsInput['log'],
): void {
  let qwCount: number | undefined
  try {
    const parsed = JSON.parse(modbusSlave) as { buffer_mapping?: { holding_registers?: { qw_count?: number } } }
    qwCount = parsed.buffer_mapping?.holding_registers?.qw_count
  } catch {
    return
  }
  if (typeof qwCount !== 'number') return
  const highest = hmiPublish.points.reduce(
    (max, point) => Math.max(max, point.register + (point.kind === 'pair-lo-first' ? 1 : 0)),
    -1,
  )
  if (highest >= qwCount) {
    log(
      `Auto-publish: the Modbus slave holding-register buffer (qw_count=${qwCount}) is smaller than the highest ` +
        `published register (%QW${highest}). Raise the buffer size in the Modbus server settings or the HMI cannot read these points.`,
      'warning',
    )
  }
}
