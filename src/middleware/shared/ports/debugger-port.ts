/**
 * DebuggerPort — Abstracts the debug protocol for reading/writing PLC variables.
 *
 * Editor adapter: Routes through IPC to main process Modbus clients
 *                 (TCP, RTU, WebSocket, or simulator virtual serial port).
 * Web adapter:    Routes through DebugBridge singleton which delegates to
 *                 WebRTCTransport, ModbusRtuTransport (simulator), or HTTP fallback.
 *
 * The underlying protocol is always Modbus PDU with custom function codes
 * (0x41-0x45) for debug operations. The port hides transport specifics.
 *
 * ## Editor IPC methods replaced:
 *   - window.bridge.debuggerConnect()
 *   - window.bridge.debuggerDisconnect()
 *   - window.bridge.debuggerGetVariablesList()
 *   - window.bridge.debuggerSetVariable()
 *   - window.bridge.debuggerVerifyMd5()
 *   - window.bridge.debuggerReadProgramStMd5()
 *   - window.bridge.readDebugFile()
 *
 * ## Web service methods replaced:
 *   - debugBridge.connect()
 *   - debugBridge.disconnect()
 *   - debugBridge.getVariablesList()
 *   - debugBridge.setVariable()
 *   - debugBridge.verifyMd5()
 *   - debugBridge.onStopped()
 *   - DebugTransport interface implementations
 */

import type { DebugConnectionConfig, DebugSetResult, DebugVariableResult, Md5VerifyResult, Unsubscribe } from './types'

/** Online-debugger run-control operation (maps to runtime FC 0x47-0x4A). */
export type DebugRunControlOp = 'clear' | 'continue' | 'pause' | 'step'

/** Halt state of the target, as reported by the runtime STOPINFO PDU (0x4B). */
export interface DebugStopInfo {
  success: boolean
  /** True when a task is halted at a checkpoint (breakpoint hit or single-step). */
  stopped?: boolean
  /** STruC++ checkpoint id the target is halted on (only meaningful when stopped). */
  checkpointId?: number
  error?: string
}

export interface DebuggerPort {
  /**
   * Connect to a debug target.
   * @param config — Connection target (TCP host, RTU serial, WebSocket, or simulator).
   *                 The adapter maps this to the platform's transport mechanism.
   */
  connect(config: DebugConnectionConfig): Promise<{ success: boolean; error?: string }>

  /** Disconnect from the current debug target. */
  disconnect(): Promise<{ success: boolean }>

  /**
   * Read variable values by their debug indexes (batched).
   * Returns tick count, last index processed, and raw data array.
   * `needsReconnect` signals the UI to re-establish the connection.
   */
  getVariablesList(indexes: number[]): Promise<DebugVariableResult>

  /**
   * Write or force a variable value.
   * @param index — Variable debug index
   * @param force — If true, the value is forced (overrides PLC logic)
   * @param valueBuffer — Raw value bytes (Uint8Array)
   */
  setVariable(index: number, force: boolean, valueBuffer?: Uint8Array): Promise<DebugSetResult>

  /**
   * Verify that the running program matches the expected MD5 hash.
   * Used to detect program mismatch before starting a debug session.
   * @param config — Connection target used for the verification request.
   */
  verifyMd5(expectedMd5: string, config: DebugConnectionConfig): Promise<Md5VerifyResult>

  /**
   * Read the MD5 hash of the compiled ST program from the debug artifacts.
   * Editor: reads from disk via IPC.
   * Web: reads from compiler API response or cached artifacts.
   */
  readProgramMd5(projectPath: string, boardTarget: string): Promise<{ success: boolean; md5?: string; error?: string }>

  /**
   * Read the debug file content (variable mapping produced by compiler).
   * Editor: reads .dbg file from disk.
   * Web: reads from compiler API response.
   */
  readDebugFile(
    projectPath: string,
    boardTarget: string,
  ): Promise<{ success: boolean; content?: string; error?: string }>

  /**
   * Arm the given set of STruC++ checkpoint ids as breakpoints (replaces the
   * current set).  Ids come from the compiler's `checkpoint-map.json`.  An
   * empty array is equivalent to `runControl('clear')`.
   */
  setBreakpoints(ids: number[]): Promise<{ success: boolean; error?: string }>

  /**
   * Issue a run-control command: `clear` (remove all breakpoints), `continue`
   * (resume from a halt), `pause` (halt at the next checkpoint), or `step`
   * (advance one checkpoint then re-halt).
   */
  runControl(op: DebugRunControlOp): Promise<{ success: boolean; error?: string }>

  /**
   * Poll the target's halt state (STOPINFO).  Drives the UI's stopped/running
   * indicator and the current-line highlight while a breakpoint is held.
   */
  getStopInfo(): Promise<DebugStopInfo>

  /**
   * Subscribe to debugger disconnection events (e.g., simulator stopped, connection lost).
   * Returns unsubscribe function.
   */
  onDisconnected(callback: () => void): Unsubscribe

  /** Check if the debugger is currently connected. */
  isConnected(): boolean
}
