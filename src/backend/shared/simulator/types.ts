export enum ModbusFunctionCode {
  DEBUG_INFO = 0x41,
  DEBUG_SET = 0x42,
  DEBUG_GET = 0x43,
  DEBUG_GET_LIST = 0x44,
  DEBUG_GET_MD5 = 0x45,
  // Online-debugger run control (Strategy B). Matches openplc-runtime
  // debug_handler.c FC 0x46-0x4B / plc_debug_control.
  DEBUG_SET_BREAKPOINTS = 0x46,
  DEBUG_CLEAR_BREAKPOINTS = 0x47,
  DEBUG_CONTINUE = 0x48,
  DEBUG_PAUSE = 0x49,
  DEBUG_STEP = 0x4a,
  DEBUG_STOPINFO = 0x4b,
  // CODESYS-style forcing (openplc-runtime core 1.8.0): writes / forces / unforces applied
  // together at one scan boundary, and the list of every forced leaf of the program.
  DEBUG_SET_BATCH = 0x4e,
  DEBUG_LIST_FORCED = 0x4f,
}

export enum ModbusDebugResponse {
  SUCCESS = 0x7e,
  ERROR_OUT_OF_BOUNDS = 0x81,
  ERROR_OUT_OF_MEMORY = 0x82,
  /** The running program cannot answer (built before the runtime feature it needs). */
  ERROR_NOT_SUPPORTED = 0x85,
}
