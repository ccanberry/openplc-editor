/**
 * WebSocketDebugTransport.sendDebugCommand — the generic raw-PDU seam the
 * online-debugger run-control ops (FC 0x46-0x4B) route through.  The
 * Socket.IO layer is mocked so we can drive `debug_response` deterministically
 * and assert the transport returns the raw response PDU bytes (or throws).
 */
import { io } from 'socket.io-client'

import { WebSocketDebugTransport } from '../websocket-debug-transport'

jest.mock('socket.io-client', () => ({ io: jest.fn() }))

const mockedIo = io as unknown as jest.Mock

type Handler = (payload: unknown) => void

function makeFakeSocket() {
  const handlers: Record<string, Handler> = {}
  return {
    handlers,
    io: { on: jest.fn() },
    on: jest.fn((event: string, handler: Handler) => {
      handlers[event] = handler
    }),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  }
}

async function connectedTransport() {
  const fake = makeFakeSocket()
  mockedIo.mockReturnValue(fake)
  const transport = new WebSocketDebugTransport({ host: '127.0.0.1', port: 8443, token: 'jwt' })
  const connectPromise = transport.connect()
  fake.handlers['connected']({ status: 'ok' })
  await connectPromise
  return { transport, fake }
}

describe('WebSocketDebugTransport.sendDebugCommand', () => {
  beforeEach(() => mockedIo.mockReset())

  it('resolves the raw response PDU bytes on success', async () => {
    const { transport, fake } = await connectedTransport()

    const pending = transport.sendDebugCommand(new Uint8Array([0x48])) // DEBUG_CONTINUE
    // Runtime respond_short ack: [FC][status=SUCCESS(0x7E)].
    fake.handlers['debug_response']({ success: true, data: '48 7E' })

    expect(Array.from(await pending)).toEqual([0x48, 0x7e])
    // The PDU must reach the wire as space-separated hex (the runtime's
    // parse_hex_string is space-separated only — a hardware-proven gotcha).
    expect(fake.emit).toHaveBeenCalledWith('debug_command', { command: '48' })
  })

  it('rejects when the runtime reports a failure', async () => {
    const { transport, fake } = await connectedTransport()

    const pending = transport.sendDebugCommand(new Uint8Array([0x4b]))
    fake.handlers['debug_response']({ success: false, error: 'boom' })

    await expect(pending).rejects.toThrow('boom')
  })

  it('throws synchronously when not connected', async () => {
    const transport = new WebSocketDebugTransport({ host: '127.0.0.1', port: 8443, token: 'jwt' })
    await expect(transport.sendDebugCommand(new Uint8Array([0x48]))).rejects.toThrow('Not connected to target')
  })
})
