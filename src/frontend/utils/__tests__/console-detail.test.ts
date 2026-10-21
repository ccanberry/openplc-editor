import { isDetailLine, withDetailLevel } from '../console-detail'

describe('console detail', () => {
  it.each([
    '[0.3 s] Found C/C++ POU: "MCODE" (function-block)',
    'Initial state - modbus_slave: enabled=False',
    'Compiling core/generated/globals_00.cpp...',
    'ccache /opt/arm9-toolchain-buster/bin/arm-linux-gnueabihf-g++ -std=c++17 -c x.cpp',
    "[3.4 s] Plugin 'robocard' is protected (plugins_protected.conf), leaving untouched",
    'make: Nothing to be done',
  ])('detail: %s', (line) => expect(isDetailLine(line)).toBe(true))

  it.each([
    '[0.0 s] Build process started',
    '[1.2 s] Compiling Structured Text to C++ with STruC++...',
    'online change: the running program is replaced without stopping',
    'Build complete: build-arm9/libplc.so',
  ])('a step: %s', (line) => expect(isDetailLine(line)).toBe(false))

  it('demotes only info lines', () => {
    expect(withDetailLevel({ level: 'info', message: 'Loaded 7 plugins from plugins.conf' }).level).toBe('debug')
    expect(withDetailLevel({ level: 'warning', message: 'Loaded 7 plugins from plugins.conf' }).level).toBe('warning')
    expect(withDetailLevel({ level: 'info', message: 'Build process started' }).level).toBe('info')
  })
})
