/**
 * Online-debugger run-control PDUs (FC 0x46-0x4B).
 *
 * These byte layouts are a contract with openplc-runtime debug_handler.c /
 * plc_debug_control. The assertions below pin the exact wire format so the
 * editor and runtime can never silently drift.
 */
import { ModbusDebugResponse, ModbusFunctionCode } from '../../simulator/types'
import {
  buildRunControlRequest,
  buildSetBreakpointsRequest,
  parseRunControlResponse,
  parseStopInfoResponse,
} from '../modbus-pdu'

describe('buildSetBreakpointsRequest', () => {
  it('emits [FC][count:U16BE][id:U32BE...] matching the runtime', () => {
    const buf = buildSetBreakpointsRequest([5, 258])
    expect(Array.from(buf)).toEqual([
      0x46, // FC
      0x00, 0x02, // count = 2 (U16BE)
      0x00, 0x00, 0x00, 0x05, // id 5 (U32BE)
      0x00, 0x00, 0x01, 0x02, // id 258 (U32BE)
    ])
  })

  it('emits a 3-byte header with zero ids for an empty set', () => {
    const buf = buildSetBreakpointsRequest([])
    expect(Array.from(buf)).toEqual([0x46, 0x00, 0x00])
  })

  it('masks ids to unsigned 32-bit', () => {
    const buf = buildSetBreakpointsRequest([0xffffffff])
    expect(Array.from(buf.subarray(3))).toEqual([0xff, 0xff, 0xff, 0xff])
  })
})

describe('buildRunControlRequest', () => {
  it.each([
    ModbusFunctionCode.DEBUG_CLEAR_BREAKPOINTS,
    ModbusFunctionCode.DEBUG_CONTINUE,
    ModbusFunctionCode.DEBUG_PAUSE,
    ModbusFunctionCode.DEBUG_STEP,
    ModbusFunctionCode.DEBUG_STOPINFO,
  ])('emits a bare 1-byte frame for FC 0x%s', (fc) => {
    const buf = buildRunControlRequest(fc)
    expect(Array.from(buf)).toEqual([fc])
  })
})

describe('parseStopInfoResponse', () => {
  it('parses [FC][status][stopped][id:U32BE] — stopped', () => {
    const r = parseStopInfoResponse(new Uint8Array([0x4b, ModbusDebugResponse.SUCCESS, 0x01, 0x00, 0x00, 0x00, 0x07]))
    expect(r).toEqual({ success: true, stopped: true, checkpointId: 7 })
  })

  it('parses the not-stopped case', () => {
    const r = parseStopInfoResponse(new Uint8Array([0x4b, ModbusDebugResponse.SUCCESS, 0x00, 0x00, 0x00, 0x00, 0x00]))
    expect(r).toEqual({ success: true, stopped: false, checkpointId: 0 })
  })

  it('rejects a too-short frame', () => {
    expect(parseStopInfoResponse(new Uint8Array([0x4b])).success).toBe(false)
  })

  it('rejects a function-code mismatch', () => {
    const r = parseStopInfoResponse(new Uint8Array([0x48, ModbusDebugResponse.SUCCESS, 0x00, 0, 0, 0, 0]))
    expect(r.error).toBe('Function code mismatch')
  })

  it('surfaces a non-success status', () => {
    const r = parseStopInfoResponse(new Uint8Array([0x4b, ModbusDebugResponse.ERROR_OUT_OF_BOUNDS]))
    expect(r.success).toBe(false)
    expect(r.error).toBe('ERROR_OUT_OF_BOUNDS')
  })

  it('rejects a success frame that is missing the payload', () => {
    const r = parseStopInfoResponse(new Uint8Array([0x4b, ModbusDebugResponse.SUCCESS, 0x01]))
    expect(r.success).toBe(false)
    expect(r.error).toContain('Incomplete')
  })
})

describe('parseRunControlResponse', () => {
  it('accepts a success ack', () => {
    expect(parseRunControlResponse(new Uint8Array([0x48, ModbusDebugResponse.SUCCESS]))).toEqual({ success: true })
  })

  it('rejects a too-short frame', () => {
    expect(parseRunControlResponse(new Uint8Array([0x48])).success).toBe(false)
  })

  it('surfaces a non-success status', () => {
    const r = parseRunControlResponse(new Uint8Array([0x48, ModbusDebugResponse.ERROR_OUT_OF_MEMORY]))
    expect(r.success).toBe(false)
    expect(r.error).toBe('ERROR_OUT_OF_MEMORY')
  })
})
