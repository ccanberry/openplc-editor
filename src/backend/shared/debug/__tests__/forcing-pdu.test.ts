/**
 * CODESYS-style forcing PDUs (FC 0x4E batch, FC 0x4F list forced) -- a contract with
 * openplc-runtime debug_handler.c (debugSetBatch / debugListForced, core 1.8.0).
 */
import { ModbusDebugResponse, ModbusFunctionCode } from '../../simulator/types'
import {
  buildListForcedRequest,
  buildSetBatchRequest,
  DEBUG_BATCH_MAX,
  parseListForcedResponse,
  parseSetBatchResponse,
} from '../modbus-pdu'

describe('buildSetBatchRequest', () => {
  it('emits [FC][count] then [arr][elem][op][len][value] per item', () => {
    const buf = buildSetBatchRequest([
      { index: (1 << 16) | 0x0203, op: 'force', value: new Uint8Array([0x0a, 0x0b]) },
      { index: 5, op: 'unforce', value: new Uint8Array([9]) },
      { index: 6, op: 'write', value: new Uint8Array([1]) },
      { index: 7, op: 'force' },
    ])
    expect(Array.from(buf)).toEqual([
      0x4e, 0x00, 0x04,
      0x01, 0x02, 0x03, 0x01, 0x00, 0x02, 0x0a, 0x0b, // force, 2 bytes
      0x00, 0x00, 0x05, 0x02, 0x00, 0x00, // unforce sends no value
      0x00, 0x00, 0x06, 0x00, 0x00, 0x01, 0x01, // write
      0x00, 0x00, 0x07, 0x01, 0x00, 0x00, // force without a value: empty (the PLC refuses it)
    ])
  })

  it('refuses an empty batch and one beyond the limit', () => {
    expect(() => buildSetBatchRequest([])).toThrow()
    const many = Array.from({ length: DEBUG_BATCH_MAX + 1 }, (_, i) => ({ index: i, op: 'unforce' as const }))
    expect(() => buildSetBatchRequest(many)).toThrow()
  })
})

describe('parseSetBatchResponse', () => {
  it('succeeds on [FC][SUCCESS]', () => {
    expect(parseSetBatchResponse(new Uint8Array([0x4e, ModbusDebugResponse.SUCCESS]))).toEqual({ success: true })
  })
  it('reports an error status', () => {
    const r = parseSetBatchResponse(new Uint8Array([0x4e, ModbusDebugResponse.ERROR_OUT_OF_BOUNDS]))
    expect(r.success).toBe(false)
    expect(r.error).toBe('ERROR_OUT_OF_BOUNDS')
  })
  it('flags an older core (exception reply) as unsupported', () => {
    const r = parseSetBatchResponse(new Uint8Array([0x4e | 0x80, 0x01]))
    expect(r).toMatchObject({ success: false, unsupported: true })
  })
  it('rejects a short reply', () => {
    expect(parseSetBatchResponse(new Uint8Array([0x4e])).success).toBe(false)
  })
})

describe('buildListForcedRequest', () => {
  it('emits [FC][arr][elem] of the cursor', () => {
    expect(Array.from(buildListForcedRequest((2 << 16) | 0x0105))).toEqual([0x4f, 0x02, 0x01, 0x05])
  })
})

describe('parseListForcedResponse', () => {
  const page = (more: number, next: number[], items: number[][]) =>
    new Uint8Array([
      ModbusFunctionCode.DEBUG_LIST_FORCED,
      ModbusDebugResponse.SUCCESS,
      more,
      ...next,
      0x00,
      items.length,
      ...items.flat(),
    ])

  it('reads every forced leaf and its value', () => {
    const r = parseListForcedResponse(
      page(0, [0, 0, 0], [
        [0x00, 0x00, 0x07, 0x00, 0x01, 0x01],
        [0x01, 0x00, 0x02, 0x00, 0x02, 0x8f, 0x42],
      ]),
    )
    expect(r.success).toBe(true)
    expect(r.next).toBeUndefined()
    expect(r.items.map((i) => [i.index, Array.from(i.value)])).toEqual([
      [7, [1]],
      [(1 << 16) | 2, [0x8f, 0x42]],
    ])
  })

  it('gives the next cursor when there is more', () => {
    const r = parseListForcedResponse(page(1, [0x03, 0x00, 0x10], []))
    expect(r).toMatchObject({ success: true, next: (3 << 16) | 0x10, items: [] })
  })

  it('flags a program or core that cannot list as unsupported', () => {
    expect(parseListForcedResponse(new Uint8Array([0x4f, ModbusDebugResponse.ERROR_NOT_SUPPORTED]))).toMatchObject({
      unsupported: true,
    })
    expect(parseListForcedResponse(new Uint8Array([0x4f | 0x80, 0x01]))).toMatchObject({ unsupported: true })
  })

  it('reports errors, short and truncated replies', () => {
    expect(parseListForcedResponse(new Uint8Array([0x4f, 0x83])).success).toBe(
      false,
    )
    expect(parseListForcedResponse(new Uint8Array([0x4f])).success).toBe(false)
    expect(parseListForcedResponse(new Uint8Array([0x4f, 0x7e, 0, 0])).success).toBe(false)
    // header says 1 item, the item header is cut short
    expect(parseListForcedResponse(new Uint8Array([0x4f, 0x7e, 0, 0, 0, 0, 0, 1, 0, 0])).success).toBe(false)
    // the item says 4 value bytes, 1 follows
    expect(parseListForcedResponse(new Uint8Array([0x4f, 0x7e, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 4, 9])).success).toBe(
      false,
    )
  })
})
