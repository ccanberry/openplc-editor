/**
 * Connect to the runtime -- one path for the board settings' Connect button and for Login while
 * not connected (which asks for the board password and connects instead of refusing).
 *
 *   1. The board password (MCM20.1): the one typed, or in dev mode the one kept for this IP.
 *   2. The runtime's users and version: a version that does not fit the board is refused; an
 *      older runtime without a version asks before going on.
 *   3. The Suite's own login when the launcher handed one over, else the login dialog (whose
 *      outcome this waits for), or the create-user dialog on a runtime without users.
 *   4. Dev mode: a password typed for a successful connection is kept for the next one.
 */
import type { RuntimePort } from '../../middleware/shared/ports/runtime-port'
import { openPLCStoreBase } from '../store'
import { validateRuntimeVersion } from '../utils/device'
import { isDevMode } from './editor-settings'

export type ConnectResult = { ok: true } | { ok: false; reason: string }

const ask = (title: string, message: string, buttons: string[], type = 'warning'): Promise<number> =>
  new Promise((resolve) => {
    openPLCStoreBase.getState().modalActions.openModal('debugger-message', {
      type,
      title,
      message,
      buttons,
      onResponse: (i: number) => resolve(i),
    })
  })

/** Wait for the login dialog: connected, or closed without connecting. */
const waitForLogin = (): Promise<boolean> =>
  new Promise((resolve) => {
    const unsubscribe = openPLCStoreBase.subscribe((state) => {
      if (state.runtimeConnection.connectionStatus === 'connected') {
        unsubscribe()
        resolve(true)
      } else if (!state.modals['runtime-login']?.open) {
        unsubscribe()
        resolve(false)
      }
    })
  })

export function needsBoardPassword(deviceBoard: string | undefined): boolean {
  return (deviceBoard || '').startsWith('MCM20.1')
}

export async function connectToRuntime(runtime: RuntimePort, req: { boardPassword?: string } = {}): Promise<ConnectResult> {
  const state = openPLCStoreBase.getState()
  const { deviceActions, modalActions } = state
  const { runtimeIpAddress: ip, deviceBoard } = state.deviceDefinitions.configuration
  if (!ip) return { ok: false, reason: 'no IP address set for the board' }

  if (needsBoardPassword(deviceBoard)) {
    if (req.boardPassword) {
      const r = await runtime.setBoardPassword(req.boardPassword)
      if (!r.success) {
        deviceActions.setRuntimeConnectionStatus('error')
        return { ok: false, reason: r.error ?? 'the board password was not taken' }
      }
    } else if (!(await runtime.hasBoardPassword())) {
      const kept = isDevMode() && (await runtime.useRememberedBoardPassword?.(ip))
      if (!kept) return { ok: false, reason: "enter the board's password" }
    }
  }

  deviceActions.setRuntimeConnectionStatus('connecting')
  let info: Awaited<ReturnType<RuntimePort['getUsersInfo']>>
  try {
    info = await runtime.getUsersInfo()
  } catch {
    deviceActions.setRuntimeConnectionStatus('error')
    return { ok: false, reason: `the runtime at ${ip} does not answer` }
  }
  if (info.error) {
    deviceActions.setRuntimeConnectionStatus('error')
    return { ok: false, reason: String(info.error) }
  }

  const version = validateRuntimeVersion(deviceBoard, info.runtimeVersion)
  if (version.status === 'mismatch') {
    deviceActions.setRuntimeConnectionStatus('error')
    await ask('Runtime Version Mismatch', version.message || 'Unknown version mismatch error', ['OK'], 'error')
    return { ok: false, reason: 'the runtime version does not fit this board' }
  }
  if (version.status === 'missing') {
    const choice = await ask('Older Runtime Detected', version.message || 'Could not detect runtime version.', [
      'Continue Anyway',
      'Cancel',
    ])
    if (choice !== 0) {
      deviceActions.setRuntimeConnectionStatus('disconnected')
      return { ok: false, reason: 'cancelled' }
    }
  }

  let connected = false
  if (info.hasUsers) {
    const suite = runtime.loginWithSuiteAccount ? await runtime.loginWithSuiteAccount() : null
    if (suite?.success && suite.accessToken) {
      deviceActions.setRuntimeJwtToken(suite.accessToken)
      deviceActions.setRuntimeConnectionStatus('connected')
      connected = true
    } else {
      modalActions.openModal('runtime-login', null)
      connected = await waitForLogin()
    }
  } else {
    modalActions.openModal('runtime-create-user', null)
    deviceActions.setRuntimeConnectionStatus('disconnected')
    return { ok: false, reason: 'the runtime has no user yet: create one, then connect again' }
  }
  if (!connected) return { ok: false, reason: 'not logged in to the runtime' }

  // The board must take the password now, not at the first upload's deploy step.
  const checked = await checkBoardPassword(runtime)
  if (!checked.ok) {
    deviceActions.setRuntimeConnectionStatus('error')
    return checked
  }

  if (req.boardPassword && isDevMode()) void runtime.rememberBoardPassword?.(ip)
  return { ok: true }
}

/**
 * Does the board take the password this connection holds? Asked at Connect, at Login and before
 * an upload or online change: a wrong password is said at once (and forgotten, so the next attempt
 * asks for it), instead of an upload compiling and then failing -- again and again -- at its
 * deploy step. Boards without a password, and an appliance that cannot check, pass.
 */
export async function checkBoardPassword(runtime: RuntimePort): Promise<ConnectResult> {
  const { runtimeIpAddress: ip, deviceBoard } = openPLCStoreBase.getState().deviceDefinitions.configuration
  if (!ip || !needsBoardPassword(deviceBoard) || !runtime.checkBoardPassword) return { ok: true }
  const r = await runtime.checkBoardPassword(ip)
  // Only a refusal stops here. A board that does not answer is said where it matters, by the
  // step that needs it (the upload's deploy, the Start), as before.
  if (r.success || !/refused/i.test(r.error ?? '')) return { ok: true }
  await runtime.setBoardPassword('')
  if (isDevMode()) void runtime.forgetBoardPasswords?.()
  const reason =
    "the board refused the board password: enter the board's root password again (board settings, under IP Address)"
  await ask('Board password', 'The board refused the board password. Enter the board\'s root password again in the board settings (under IP Address) and connect again.', ['OK'], 'error')
  return { ok: false, reason }
}
