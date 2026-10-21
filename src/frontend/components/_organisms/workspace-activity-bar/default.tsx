import { resolveTargetCapabilities } from '@root/middleware/shared/utils/target-capabilities'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  type DebugResolverContext,
  type DebugSpec,
  resolveDebugConnection,
} from '../../../../backend/shared/hardware/debug-spec'
import type { DebugConnectionConfig } from '../../../../middleware/shared/ports/types'
import { projectCapabilities } from '../../../../middleware/shared/ports/types'
import {
  useCapabilities,
  useCompiler,
  useDebugger,
  useProject,
  useRuntime,
  useSimulator,
} from '../../../../middleware/shared/providers'
import { StopIcon } from '../../../assets/icons/interface/Stop'
import { useDebugPolling } from '../../../hooks/useDebugPolling'
import { useDebugSession } from '../../../hooks/useDebugSession'
import { useRunControlSync } from '../../../hooks/useRunControl'
import { isClearConsoleOnBuild, isConfirmOnlineChange, isDevMode } from '../../../services/editor-settings'
import { releaseForces } from '../../../services/forcing'
import { connectToRuntime, needsBoardPassword } from '../../../services/runtime-connect'
import { executeSaveProject } from '../../../services/save-actions'
import { useOpenPLCStore } from '../../../store'
import type { RuntimeConnection } from '../../../store/slices/device/types'
import { cn } from '../../../utils/cn'
import { withDetailLevel } from '../../../utils/console-detail'
import { decideAttach, parseCheckpointFingerprint, resolveDebugBuild } from '../../../utils/debug-attach'
import { logCompilerEvent } from '../../../utils/debugger-session'
import { isOpenPLCRuntimeTarget } from '../../../utils/device'
import { getErrorMessage } from '../../../utils/get-error-message'
import { createLogBatcher } from '../../../utils/log-batcher'
import { type BuildOption, BuildOptionsPopover } from '../../_features/[workspace]/build-options'
import { ChatButton } from '../../_molecules/workspace-activity-bar/default/chat'
import { DebuggerButton } from '../../_molecules/workspace-activity-bar/default/debugger'
import { PlayButton } from '../../_molecules/workspace-activity-bar/default/play'
import { SearchButton } from '../../_molecules/workspace-activity-bar/default/search'
import { ZoomButton } from '../../_molecules/workspace-activity-bar/default/zoom'
import { TooltipSidebarWrapperButton } from '../../_molecules/workspace-activity-bar/tooltip-button'
import type { RuntimeQuickConnectData } from '../modals/runtime-quick-connect-modal'

/** Does an upload carry online-debugger support? The project's choice, else the board's default. */
function projectDebugBuildDefault(): boolean {
  const state = useOpenPLCStore.getState()
  const board = state.deviceAvailableOptions.availableBoards.get(state.deviceDefinitions.configuration.deviceBoard)
  const caps = resolveTargetCapabilities(board)
  if (caps.isInProcessSimulator) return false
  return resolveDebugBuild(state.deviceDefinitions.configuration.debugBuild, caps.debugBuildByDefault)
}

const showDebuggerMessage = (
  type: 'info' | 'warning' | 'error' | 'question',
  title: string,
  message: string,
  buttons: string[],
  options?: { primaryButtonIndex?: number; dismissButtonIndex?: number },
): Promise<number> => {
  return new Promise((resolve) => {
    useOpenPLCStore.getState().modalActions.openModal('debugger-message', {
      type,
      title,
      message,
      buttons,
      ...options,
      onResponse: (buttonIndex: number) => resolve(buttonIndex),
    })
  })
}

const showDebuggerIpInput = (title: string, message: string, defaultValue: string): Promise<string | null> => {
  return new Promise((resolve) => {
    useOpenPLCStore.getState().modalActions.openModal('debugger-ip-input', {
      title,
      message,
      defaultValue,
      onSubmit: (value: string) => resolve(value),
      onCancel: () => resolve(null),
    })
  })
}

/** Login while not connected: ask for the board's address and password (null: cancelled). */
const askRuntimeConnection = (
  defaultIp: string,
  needsPassword: boolean,
): Promise<{ ip: string; password: string } | null> =>
  new Promise((resolve) => {
    const data: RuntimeQuickConnectData = {
      defaultIp,
      needsPassword,
      onSubmit: (answer) => resolve(answer),
      onCancel: () => resolve(null),
    }
    useOpenPLCStore.getState().modalActions.openModal('runtime-quick-connect', data)
  })

const disabledButtonClass = 'cursor-not-allowed opacity-50 [&>*:first-child]:hover:bg-transparent'

type DefaultWorkspaceActivityBarProps = {
  zoom?: {
    onClick: () => void
  }
}

export const DefaultWorkspaceActivityBar = ({ zoom }: DefaultWorkspaceActivityBarProps) => {
  const {
    project: { data: projectData, meta: projectMeta },
    deviceDefinitions,
    deviceAvailableOptions: { availableBoards },
    consoleActions: { addLog, addLogs, clearLogs, requestConsoleFollow },
  } = useOpenPLCStore()

  // Project-type capability matrix.  Drives which set of action
  // buttons the activity bar shows — the program path (Build /
  // Run / Debug) for PLC projects, the library path (Build
  // Library) for library projects.  See `projectCapabilities` in
  // `middleware/shared/ports/types.ts`.
  const projectCaps = projectCapabilities(projectMeta)

  const compiler = useCompiler()
  const runtime = useRuntime()
  const simulator = useSimulator()
  const debuggerPort = useDebugger()
  const projectPort = useProject()
  const capabilities = useCapabilities()
  const debugSession = useDebugSession()
  useDebugPolling({ debugTreesRef: debugSession.debugTreesRef })
  // Online-debugger run control: keeps the runtime's breakpoint set in sync
  // with placed breakpoints and polls the halt state (no-op on non-debug builds).
  useRunControlSync()

  const [isCompiling, setIsCompiling] = useState(false)
  const [isDebuggerProcessing, setIsDebuggerProcessing] = useState(false)
  // Whether this login may arm breakpoints: false when the target runs this program as a release
  // build (or one whose checkpoint numbering is not this project's) -- live values only.
  const loginBreakpointsRef = useRef(true)
  // CHANGED SINCE LOGIN: any edit made while logged in means the PLC runs an older program than
  // the one on screen, so Build/Upload is lit until it is uploaded (or the session ends).
  const [changedSinceLogin, setChangedSinceLogin] = useState(false)
  const loginDataRef = useRef<unknown>(null)
  // The Login handler, for the re-login after an online change (defined further down).
  const reloginRef = useRef<(() => Promise<void>) | null>(null)
  // Log out, asking first when variables are forced; false = the operator cancelled.
  const goOfflineRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true))
  const [simulatorRunning, setSimulatorRunning] = useState(false)
  const pendingSimulatorDebugRef = useRef(false)
  // True while an upload runs: its own stop of the PLC is not a reason to log out.
  const deployingRef = useRef(false)
  // Start pressed, the PLC not RUNNING yet (the board waits for robocnc before it starts it).
  const [plcStarting, setPlcStarting] = useState(false)

  const connectionStatus = useOpenPLCStore((state) => state.runtimeConnection.connectionStatus)
  const plcStatus = useOpenPLCStore((state): RuntimeConnection['plcStatus'] => state.runtimeConnection.plcStatus)
  const jwtToken = useOpenPLCStore((state) => state.runtimeConnection.jwtToken)
  const isDebuggerVisible = useOpenPLCStore((state) => state.workspace.isDebuggerVisible)
  const canEdit = useOpenPLCStore((state) => state.workspace.canEdit)

  useEffect(() => {
    if (!isDebuggerVisible) {
      loginDataRef.current = null
      setChangedSinceLogin(false)
      return
    }
    if (loginDataRef.current === null) {
      loginDataRef.current = projectData
      return
    }
    if (projectData !== loginDataRef.current) setChangedSinceLogin(true)
  }, [isDebuggerVisible, projectData])

  const currentBoardInfo = availableBoards.get(deviceDefinitions.configuration.deviceBoard)
  const isSimulatorBoard = resolveTargetCapabilities(currentBoardInfo).isInProcessSimulator

  // LOGGED OUT WHEN THE PLC STOPS OR THE BOARD IS GONE -- stopped from RoboStudio, a terminal or
  // here, an error, or the runtime connection lost. The session showed values of a program that no
  // longer runs and its breakpoints went with it. An upload's own stop is not counted (it logs in
  // again to the new program, or out when the PLC stays stopped).
  useEffect(() => {
    if (!isDebuggerVisible || isSimulatorBoard || deployingRef.current || isDebuggerProcessing) return
    const lost = connectionStatus !== 'connected'
    const stopped = plcStatus === 'STOPPED' || plcStatus === 'EMPTY' || plcStatus === 'ERROR'
    if (!lost && !stopped) return
    addLog({
      id: crypto.randomUUID(),
      level: 'warning',
      message: `Logged out: ${lost ? 'the connection to the runtime was lost' : `the PLC is ${plcStatus}`}.`,
    })
    void debugSession.stopSession()
  }, [plcStatus, connectionStatus, isDebuggerVisible, isSimulatorBoard, isDebuggerProcessing, debugSession, addLog])

  // Sync simulatorRunning when the simulator stops externally
  useEffect(() => {
    const unsub = simulator.onStopped(() => {
      pendingSimulatorDebugRef.current = false
      setSimulatorRunning(false)
      const { workspace } = useOpenPLCStore.getState()
      if (workspace.isDebuggerVisible) {
        void debugSession.stopSession()
      }
    })
    return unsub
  }, [simulator, debugSession])

  // Stop simulator if the board is switched away while it's running
  const prevIsSimulatorBoardRef = useRef(isSimulatorBoard)
  useEffect(() => {
    const wasSimulator = prevIsSimulatorBoardRef.current
    prevIsSimulatorBoardRef.current = isSimulatorBoard

    if (wasSimulator && !isSimulatorBoard && simulator.isRunning()) {
      addLog({
        id: crypto.randomUUID(),
        level: 'info',
        message: 'Board changed from simulator. Stopping simulator.',
      })
      void simulator.stop()
      if (isDebuggerVisible) {
        const { workspaceActions } = useOpenPLCStore.getState()
        workspaceActions.clearDebugState()
      }
    }
  }, [isSimulatorBoard, isDebuggerVisible, simulator, addLog])

  const executeSave = useCallback(async (): Promise<boolean> => {
    const result = await executeSaveProject(projectPort, capabilities)
    return result.success
  }, [projectPort])

  // ---------------------------------------------------------------------------
  // Build (Compile)
  // ---------------------------------------------------------------------------

  const handleBuild = useCallback(
    async (overrides?: {
      compileOnly?: boolean
      cleanBuild?: boolean
      debugCheckpoints?: boolean
      /** Never stop a running PLC -- for the debugger's compile-only attach probe, which
       *  must leave the machine exactly as it is. */
      keepPlcRunning?: boolean
      /** ONLINE CHANGE: the board swaps its running program for this build at a scan
       *  boundary, keeping every variable's value. Nothing is stopped. */
      onlineChange?: boolean
      /** The online change was chosen by the editor (logged in, PLC running): refused, ask
       *  before falling back to a stop-and-download. */
      autoOnline?: boolean
      /** Never turn this upload into an online change (the fallback download itself). */
      noAutoOnline?: boolean
      /** The online change was already confirmed (or chosen at login): do not ask again. */
      onlineConfirmed?: boolean
    }): Promise<boolean> => {
      if (isCompiling) return false

      // LOGGED IN, A BUILD HAS ONE PURPOSE: THE ONLINE CHANGE (CODESYS "Login with online change",
      // TIA "download in RUN") -- the board swaps its program at a scan boundary and keeps every
      // value, nothing stops. Build only / download / clean download need a logout first. Asked
      // first (File > Settings: Ask before an online change): OK, Cancel, or Go offline.
      if (
        !overrides?.onlineConfirmed &&
        !overrides?.noAutoOnline &&
        !overrides?.keepPlcRunning &&
        useOpenPLCStore.getState().workspace.isDebuggerVisible
      ) {
        if (isConfirmOnlineChange()) {
          const choice = await showDebuggerMessage(
            'question',
            'Online change',
            'The program on the PLC is changed online: the PLC keeps running, every variable keeps its ' +
              'value and the new code takes over at the end of a scan.\n\nGo offline logs out; Build, ' +
              'Build and upload and Clean build and upload are then in the build menu.',
            ['OK', 'Cancel', 'Go offline'],
            { primaryButtonIndex: 0, dismissButtonIndex: 1 },
          )
          if (choice === 2) await goOfflineRef.current()
          if (choice !== 0) return false
        }
        return handleBuildRef.current({
          ...overrides,
          compileOnly: false,
          cleanBuild: false,
          onlineChange: true,
          autoOnline: true,
          onlineConfirmed: true,
        })
      }
      const wasLoggedIn = useOpenPLCStore.getState().workspace.isDebuggerVisible
      // Every build line carries the time since the build started, so a slow step shows itself.
      const buildStart = performance.now()
      const elapsed = () => `[${((performance.now() - buildStart) / 1000).toFixed(1)} s]`
      // The build's lines arrive one IPC message each: added in bursts, not one render per line.
      const buildLog = createLogBatcher(addLogs)
      let onlineRefusal: string | null = null

      // Reveal the console and re-attach it to the tail so build output is
      // visible from the first line, even if the console was collapsed or the
      // user had scrolled up. One-shot — it won't fight a later manual scroll.
      if (isClearConsoleOnBuild()) clearLogs()
      requestConsoleFollow()

      // Always save the full project before building. The compile
      // pipeline reads source from disk (project.json, devices/*.json,
      // pous/**, ...) so any in-memory edit that hasn't been flushed
      // yet compiles from the previous session's bytes.
      //
      // We used to gate this on `editingState === 'unsaved'`, but that
      // flag was effect-driven and lagged behind store mutations by a
      // render (a quick "change a vendor-screen field → click Build"
      // could miss the save). Each editor's dirty-tracking is also
      // independent — Monaco buffers, vendor screens, the manifest,
      // ladder/FBD nodes — so a workspace-level boolean was always a
      // lossy summary. `executeSaveProject` is the same call the
      // library-build path makes for the same reason: walks every
      // project file and flushes the in-memory state to disk. Cost is
      // a few JSON.stringify + file writes; save is idempotent when
      // nothing changed.
      //
      // Viewers without write permission (public projects they don't
      // own) can compile their in-memory edits but can't push them
      // back; skip the pre-build save for them so the doomed backend
      // write never gates the build.
      if (canEdit) {
        const saved = await executeSave()
        if (!saved) return false
      }

      setIsCompiling(true)

      // Targets that build through the device runtime (everything except the
      // arduino-cli / in-process-simulator pipelines, i.e. directUsbUpload)
      // run the FINAL build step ON the device. If the runtime is actively
      // scanning a program, that heavy on-device work can stall the build or
      // make the running program miss scan cycles / deadlines. So when we're
      // connected to a RUNNING runtime, require the user to stop the PLC first
      // and, on their consent, stop it before compiling.
      {
        const state = useOpenPLCStore.getState()
        const boardInfo = state.deviceAvailableOptions.availableBoards.get(
          state.deviceDefinitions.configuration.deviceBoard,
        )
        const requiresRuntimeConnection = !resolveTargetCapabilities(boardInfo).directUsbUpload
        const { connectionStatus: connStatus, plcStatus: runStatus } = state.runtimeConnection
        if (
          !overrides?.keepPlcRunning &&
          !overrides?.onlineChange &&
          requiresRuntimeConnection &&
          connStatus === 'connected' &&
          runStatus === 'RUNNING'
        ) {
          // MCM20.1: the upload's deploy step stops the board's PLC itself and starts it again
          // with the new program (scripts/deploy-arm9.sh restarts it only if it was running).
          // Stopping it here first would leave the machine stopped after the upload, so the
          // editor only asks and leaves the stop and restart to the deploy.
          const deployRestarts = (state.deviceDefinitions.configuration.deviceBoard || '').startsWith('MCM20.1')
          const response = await showDebuggerMessage(
            'warning',
            deployRestarts ? 'Upload to a running PLC' : 'Stop PLC',
            deployRestarts
              ? 'The PLC on the board is running. The upload stops it, loads the new program and starts it again.'
              : 'The PLC must be stopped before continuing.',
            deployRestarts ? ['Cancel', 'Upload'] : ['Cancel', 'Stop PLC and Continue'],
            // Cancel is first (left, neutral); proceed is the blue primary on
            // the right; Escape / click-away routes to Cancel.
            { primaryButtonIndex: 1, dismissButtonIndex: 0 },
          )
          if (response !== 1) {
            // User declined — abort the build and leave the PLC running.
            setIsCompiling(false)
            return false
          }
        }
        if (
          !(state.deviceDefinitions.configuration.deviceBoard || '').startsWith('MCM20.1') &&
          !overrides?.keepPlcRunning &&
          !overrides?.onlineChange &&
          requiresRuntimeConnection &&
          connStatus === 'connected' &&
          runStatus === 'RUNNING'
        ) {
          const stopResult = await runtime.stopPlc()
          if (!stopResult.success) {
            addLog({
              id: crypto.randomUUID(),
              level: 'error',
              message: `Failed to stop PLC: ${stopResult.error ?? 'Unknown error'}`,
            })
            setIsCompiling(false)
            return false
          }
          useOpenPLCStore.getState().deviceActions.setPlcRuntimeStatus('STOPPED')
          addLog({ id: crypto.randomUUID(), level: 'info', message: 'PLC stopped before build.' })
        }
      }

      addLog({ id: crypto.randomUUID(), level: 'info', message: 'Build process started' })

      // Auto-publish stability: persist the current publish-register
      // allocation into the store BEFORE snapshotting, so this build's
      // registers become pinned for every later build in the session
      // (deleting a published variable never renumbers the others).
      useOpenPLCStore.getState().projectActions.refreshHmiPublishAssignments()

      // Compile-time alias resolution: snapshot the project with every
      // variable's `location` resolved to a concrete IEC address (alias name
      // → current address, literal → verbatim, missing → unlocated). The
      // compile pipeline reads `variable.location` verbatim — it never sees
      // aliases.
      const freshProjectData = useOpenPLCStore.getState().projectActions.getCompileReadyProjectData()

      // Success is reported back so the debugger's compile-and-deploy path can
      // gate connecting on a clean deploy.  Normal callers `void` the result.
      let buildOk = false
      // A download stops the PLC on the way: the auto-logout must not read that as a stop.
      if (!overrides?.compileOnly) deployingRef.current = true
      try {
        // Track whether the compile stream already surfaced an error so we
        // don't log a second, generic "Compilation failed" after a failed
        // build (the stream already reported the real error).
        let streamedError = false
        const result = await compiler.compileProgram(
          {
            projectData: freshProjectData,
            boardTarget: deviceDefinitions.configuration.deviceBoard,
            projectPath: projectMeta.path,
            // `compileOnly` is dictated entirely by the sidebar build
            // menu (Build / Build & Upload / Clean Build & Upload).
            // Default to `false` so the few callers that invoke
            // `handleBuild()` with no overrides also get an upload.
            compileOnly: overrides?.compileOnly ?? false,
            cleanBuild: overrides?.cleanBuild ?? false,
            onlineChange: overrides?.onlineChange ?? false,
            // Debug deploy: instrument the program so the runtime cross-compiles
            // a halt-able `.so` and emits checkpoint-map.json.  Off for normal
            // builds. Set by the debugger's compile-and-deploy path.
            // Debug support by default where the board asks for it (MCM20.1), so a debugger can
            // attach to the running program later without a download; the project can opt out.
            debugCheckpoints: overrides?.debugCheckpoints ?? projectDebugBuildDefault(),
            isSimulator: isSimulatorBoard,
            runtimeIpAddress: deviceDefinitions.configuration.runtimeIpAddress || null,
            runtimeJwtToken: jwtToken || null,
            // Live serial-port picker value from the device store.
            // Threaded through so arduino-cli upload uses the
            // picker's current selection even when the user hasn't
            // saved the project yet (the legacy disk-read path lags
            // the live store by one save cycle).
            communicationPort: deviceDefinitions.configuration.communicationPort || undefined,
            // User-authored configuration-screen data — the shared
            // compile pipeline emits `vpp_config.h` from this for
            // arduino-cli VPP boards (Arduino Opta, P1AM).  Same
            // store path on editor + web, single source of truth.
            vendorScreenData: deviceDefinitions.configuration.vendorScreenData,
          },
          (event) => {
            if (event.plcStatus) {
              useOpenPLCStore
                .getState()
                .deviceActions.setPlcRuntimeStatus(event.plcStatus as NonNullable<RuntimeConnection['plcStatus']>)
            }
            if (event.level === 'error' || event.stage === 'error') {
              streamedError = true
            }
            if (event.message && /online change refused/i.test(event.message)) onlineRefusal = event.message
            logCompilerEvent(event.message ? { ...event, message: `${elapsed()} ${event.message}` } : event, (entry) =>
              buildLog.add(withDetailLevel(entry)),
            )
            if (event.firmwarePath && isSimulatorBoard) {
              void simulator.loadFirmware(event.firmwarePath).then((loadResult) => {
                buildLog.flush()
                if (loadResult.success) {
                  setSimulatorRunning(true)
                  addLog({ id: crypto.randomUUID(), level: 'info', message: 'Simulator is running.' })
                  if (pendingSimulatorDebugRef.current) {
                    pendingSimulatorDebugRef.current = false
                    // Simulator's debug spec resolves to the trivial
                    // `{ connectionType: 'simulator' }` config — see
                    // the hals.json entry.  Pass it explicitly so the
                    // session's downstream MD5-verification path has
                    // the right transport instead of falling back to
                    // `connectAndStart`'s internal default.
                    void debugSession.connectAndStart({ connectionType: 'simulator', connectionParams: {} })
                  }
                } else {
                  pendingSimulatorDebugRef.current = false
                  addLog({
                    id: crypto.randomUUID(),
                    level: 'error',
                    message: `Failed to start simulator: ${loadResult.error ?? 'Unknown error'}`,
                  })
                }
              })
            }
          },
        )

        buildLog.flush()
        if (!result.success && !streamedError) {
          addLog({ id: crypto.randomUUID(), level: 'error', message: result.error ?? 'Compilation failed' })
        }
        buildOk = result.success
      } catch (err: unknown) {
        buildLog.flush()
        addLog({ id: crypto.randomUUID(), level: 'error', message: `Build error: ${getErrorMessage(err)}` })
      } finally {
        setIsCompiling(false)
      }
      deployingRef.current = false
      if (buildOk) {
        addLog({
          id: crypto.randomUUID(),
          level: 'info',
          message: `${overrides?.compileOnly ? 'Build' : overrides?.onlineChange ? 'Online change' : 'Build and upload'} finished in ${((performance.now() - buildStart) / 1000).toFixed(1)} s`,
        })
      }
      if (!buildOk && overrides?.autoOnline) {
        const reason = onlineRefusal
          ? String(onlineRefusal).replace(/^.*online change refused:\s*/i, '')
          : 'the online change did not complete'
        const choice = await showDebuggerMessage(
          'warning',
          'Online change not possible',
          `The program on the PLC was not changed: ${reason}.\n\nGo offline and download: you are logged ` +
            'out, the PLC stops, takes the new program and starts again.',
          ['Go offline and download', 'Cancel'],
          { primaryButtonIndex: 0, dismissButtonIndex: 1 },
        )
        if (choice !== 0) return false
        if (useOpenPLCStore.getState().workspace.isDebuggerVisible && !(await goOfflineRef.current())) return false
        return handleBuildRef.current({
          ...overrides,
          onlineChange: false,
          autoOnline: false,
          noAutoOnline: true,
          onlineConfirmed: true,
        })
      }
      // A DOWNLOAD WHILE LOGGED IN restarted the program: the session belongs to the old one. Log
      // in again to the new one when it runs; logged out when the PLC stays stopped.
      if (buildOk && wasLoggedIn && !overrides?.compileOnly && !overrides?.onlineChange) {
        void (async () => {
          await debugSession.stopSession()
          if (useOpenPLCStore.getState().runtimeConnection.plcStatus === 'RUNNING') {
            addLog({ id: crypto.randomUUID(), level: 'info', message: 'Download done: logging in to the new program...' })
            await new Promise((resolve) => setTimeout(resolve, 300))
            void reloginRef.current?.()
          } else {
            addLog({ id: crypto.randomUUID(), level: 'info', message: 'Logged out: the PLC is stopped after the download.' })
          }
        })()
      }
      // Uploaded while logged in: the PLC runs what is on screen again.
      if (buildOk && !overrides?.compileOnly) {
        loginDataRef.current = useOpenPLCStore.getState().project.data
        setChangedSinceLogin(false)
      }
      // After an online change the running program is a new build (a new MD5 and variable
      // map): log in to it again, which reads the new map -- no download, nothing stopped.
      if (buildOk && overrides?.onlineChange && useOpenPLCStore.getState().workspace.isDebuggerVisible) {
        addLog({ id: crypto.randomUUID(), level: 'info', message: 'Online change done: logging in to the new program...' })
        void (async () => {
          await debugSession.stopSession()
          await new Promise((resolve) => setTimeout(resolve, 300))
          void reloginRef.current?.()
        })()
      }
      return buildOk
    },
    [
      compiler,
      projectData,
      projectMeta,
      deviceDefinitions,
      isSimulatorBoard,
      simulator,
      debugSession,
      addLog,
      addLogs,
      clearLogs,
      isCompiling,
      executeSave,
      canEdit,
      jwtToken,
      runtime,
      requestConsoleFollow,
    ],
  )

  const handleBuildRef = useRef(handleBuild)
  handleBuildRef.current = handleBuild

  // ---------------------------------------------------------------------------
  // Build Library (.stlib)
  // ---------------------------------------------------------------------------

  const handleBuildLibrary = useCallback(
    async (overrides?: { cleanBuild?: boolean }) => {
      if (isCompiling) return

      // Reveal the console and re-attach to the tail (see handleBuild).
      requestConsoleFollow()

      // Always save before building.  The manifest tab and any POU
      // bodies may have edits the workspace-level `editingState`
      // doesn't track (each editor manages its own dirty flag against
      // its file-slice entry), and the build pipeline reads everything
      // off disk — `library.json`, `pous/**`, and the rest — so a
      // stale on-disk copy would compile from the previous session's
      // content.  `executeSaveProject` is the same full-project save
      // the PLC build invokes; it walks every file the project owns
      // and flushes the in-memory buffer to disk before the build
      // starts.
      const saved = await executeSave()
      if (!saved) return

      if (!compiler.compileLibrary) {
        addLog({
          id: crypto.randomUUID(),
          level: 'error',
          message: 'Current platform does not implement library builds.',
        })
        return
      }

      setIsCompiling(true)
      addLog({
        id: crypto.randomUUID(),
        level: 'info',
        message: overrides?.cleanBuild ? 'Library build started (clean)' : 'Library build started',
      })

      try {
        const result = await compiler.compileLibrary(
          { projectData, projectPath: projectMeta.path, cleanBuild: overrides?.cleanBuild ?? false },
          (event) => {
            if (!event.message) return
            addLog({
              id: crypto.randomUUID(),
              level: event.level === 'error' || event.stage === 'error' ? 'error' : 'info',
              message: event.message,
            })
          },
        )
        if (!result.success) {
          addLog({
            id: crypto.randomUUID(),
            level: 'error',
            message: result.error ?? 'Library build failed.',
          })
        } else if (result.verification && !result.verification.success) {
          addLog({
            id: crypto.randomUUID(),
            level: 'warning',
            message: `Library built, but verification reported: ${result.verification.message ?? 'unknown'}`,
          })
        }
      } catch (err) {
        addLog({
          id: crypto.randomUUID(),
          level: 'error',
          message: `Library build error: ${getErrorMessage(err)}`,
        })
      } finally {
        setIsCompiling(false)
      }
    },
    [compiler, projectData, projectMeta, addLog, addLogs, clearLogs, isCompiling, executeSave, requestConsoleFollow],
  )

  // ---------------------------------------------------------------------------
  // PLC control (Start/Stop for runtime targets)
  // ---------------------------------------------------------------------------

  const handlePlcControl = useCallback(async (): Promise<void> => {
    if (!jwtToken || connectionStatus !== 'connected' || plcStarting) return

    try {
      if (plcStatus === 'RUNNING') {
        const result = await runtime.stopPlc()
        if (!result.success) {
          addLog({
            id: crypto.randomUUID(),
            level: 'error',
            message: `Failed to stop PLC: ${result.error ?? 'Unknown error'}`,
          })
          return
        }
      } else {
        // START, AND SAY WHEN IT RUNS. On the MCM20.1 the board holds the start until robocnc is
        // ready (up to two minutes after a robocnc restart); the reply comes back before that, so
        // without this the button looked like it did nothing.
        setPlcStarting(true)
        addLog({ id: crypto.randomUUID(), level: 'info', message: 'Starting the PLC...' })
        try {
          const result = await runtime.startPlc()
          if (!result.success) {
            addLog({
              id: crypto.randomUUID(),
              level: 'error',
              message: `Failed to start PLC: ${result.error ?? 'Unknown error'}`,
            })
            return
          }
          const t0 = performance.now()
          for (let i = 0; i < 150; i++) {
            const st = await runtime.getStatus()
            const status = typeof st.status === 'string' ? st.status.replace('STATUS:', '').trim() : ''
            if (st.success && status) {
              useOpenPLCStore
                .getState()
                .deviceActions.setPlcRuntimeStatus(status as NonNullable<RuntimeConnection['plcStatus']>)
            }
            if (status === 'RUNNING') {
              addLog({
                id: crypto.randomUUID(),
                level: 'info',
                message: `PLC running (${((performance.now() - t0) / 1000).toFixed(0)} s).`,
              })
              return
            }
            if (i === 5) {
              addLog({
                id: crypto.randomUUID(),
                level: 'info',
                message: 'The board is still starting the PLC (it waits for robocnc to be ready)...',
              })
            }
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }
          addLog({
            id: crypto.randomUUID(),
            level: 'warning',
            message: 'The PLC did not report RUNNING within 150 s: see its log in RoboStudio (System page).',
          })
          return
        } finally {
          setPlcStarting(false)
        }
      }

      const statusResult = await runtime.getStatus()
      if (statusResult.success && statusResult.status) {
        useOpenPLCStore
          .getState()
          .deviceActions.setPlcRuntimeStatus(statusResult.status as NonNullable<RuntimeConnection['plcStatus']>)
      }
    } catch (error: unknown) {
      addLog({ id: crypto.randomUUID(), level: 'error', message: `PLC control error: ${getErrorMessage(error)}` })
    }
  }, [runtime, jwtToken, connectionStatus, plcStatus, addLog, plcStarting])

  // ---------------------------------------------------------------------------
  // Simulator control (Start/Stop simulator + auto-debug)
  // ---------------------------------------------------------------------------

  const handleSimulatorControl = useCallback(async (): Promise<void> => {
    try {
      if (simulatorRunning) {
        await debugSession.stopSession()
        setSimulatorRunning(false)
        addLog({ id: crypto.randomUUID(), level: 'info', message: 'Simulator stopped.' })
      } else {
        pendingSimulatorDebugRef.current = true
        handleBuildRef.current().catch(() => {
          pendingSimulatorDebugRef.current = false
        })
      }
    } catch (error: unknown) {
      pendingSimulatorDebugRef.current = false
      addLog({ id: crypto.randomUUID(), level: 'error', message: `Simulator control error: ${getErrorMessage(error)}` })
    }
  }, [debugSession, simulatorRunning, addLog])

  // ---------------------------------------------------------------------------
  // MD5 verification — runs after debug compilation for non-simulator
  // ---------------------------------------------------------------------------

  const handleMd5Verification = async (
    projectPath: string,
    boardTarget: string,
    debugConfig: DebugConnectionConfig,
    isRuntimeTarget: boolean,
  ) => {
    const { consoleActions, runtimeConnection, deviceActions } = useOpenPLCStore.getState()

    try {
      // If runtime target + PLC stopped, offer to start
      if (isRuntimeTarget && runtimeConnection.plcStatus === 'STOPPED' && runtimeConnection.jwtToken) {
        const response = await showDebuggerMessage(
          'question',
          'PLC Stopped',
          'The PLC is currently stopped. The debugger requires the PLC to be running. Would you like to start the PLC now?',
          ['Yes', 'No'],
        )
        if (response === 1) {
          consoleActions.addLog({ id: crypto.randomUUID(), level: 'info', message: 'Login cancelled.' })
          setIsDebuggerProcessing(false)
          return
        }

        consoleActions.addLog({ id: crypto.randomUUID(), level: 'info', message: 'Starting PLC...' })
        const startResult = await runtime.startPlc()
        if (!startResult.success) {
          await showDebuggerMessage(
            'error',
            'Start PLC Failed',
            `Could not start the PLC: ${startResult.error || 'Unknown error'}`,
            ['OK'],
          )
          setIsDebuggerProcessing(false)
          return
        }
        deviceActions.setPlcRuntimeStatus('RUNNING')
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }

      // Read local MD5
      consoleActions.addLog({ id: crypto.randomUUID(), level: 'info', message: 'Verifying program MD5...' })
      const md5Result = await debuggerPort.readProgramMd5(projectPath, boardTarget)
      if (!md5Result.success || !md5Result.md5) {
        await showDebuggerMessage('error', 'MD5 Extraction Failed', md5Result.error ?? 'Could not extract MD5', ['OK'])
        setIsDebuggerProcessing(false)
        return
      }

      // Connect debug transport before MD5 verification — the web platform
      // needs an active transport (WebRTC or HTTP fallback) to query the device.
      // connect() is idempotent: connectAndStart will reuse this connection.
      const preConnectResult = await debuggerPort.connect(debugConfig)
      if (!preConnectResult.success) {
        await showDebuggerMessage(
          'error',
          'Connection Error',
          `Could not connect to debug target: ${preConnectResult.error ?? 'Unknown error'}`,
          ['OK'],
        )
        setIsDebuggerProcessing(false)
        return
      }

      const verifyResult = await debuggerPort.verifyMd5(md5Result.md5, debugConfig)
      if (!verifyResult.success) {
        await debuggerPort.disconnect()
        await showDebuggerMessage(
          'error',
          'Connection Error',
          `Could not verify MD5: ${verifyResult.error ?? 'Unknown error'}`,
          ['OK'],
        )
        setIsDebuggerProcessing(false)
        return
      }

      if (verifyResult.match) {
        consoleActions.addLog({ id: crypto.randomUUID(), level: 'info', message: 'MD5 verified. Starting debugger...' })
        // Surface the active transport in the store so transport-specific
        // pollers (useDebugPolling) can size their batches against the
        // real frame budget rather than guessing from the board target.
        useOpenPLCStore.getState().workspaceActions.setDebugConnectionType(debugConfig.connectionType)
        // Persist the target's byte order — detected from the MD5
        // response trailer in the runtime — so the swap layer at the
        // read / write boundaries flips on BE targets.  Default to
        // `'le'` when the trailer was missing or malformed (older
        // runtimes); detectTargetEndian already logged a warning.
        useOpenPLCStore.getState().workspaceActions.setDebugTargetEndian(verifyResult.targetEndian ?? 'le')
        await debugSession.connectAndStart(debugConfig, { breakpoints: loginBreakpointsRef.current })
        setIsDebuggerProcessing(false)
      } else {
        // Disconnect before re-upload; the recursive call will reconnect
        await debuggerPort.disconnect()

        consoleActions.addLog({
          id: crypto.randomUUID(),
          level: 'warning',
          message: `MD5 mismatch. Target: ${verifyResult.targetMd5}, Expected: ${md5Result.md5}`,
        })
        const response = await showDebuggerMessage(
          'warning',
          'Program Mismatch',
          'The program on the target does not match. Upload the current project?',
          ['Yes', 'No'],
        )
        if (response === 0) {
          const runtimeIpAddress = deviceDefinitions.configuration.runtimeIpAddress || null
          const runtimeJwtToken = useOpenPLCStore.getState().runtimeConnection.jwtToken || null
          // See the handleBuild call above — compile-time alias resolution.
          const freshProjectData = useOpenPLCStore.getState().projectActions.getCompileReadyProjectData()
          const uploadLog = createLogBatcher(consoleActions.addLogs)
          const compileResult = await compiler.compileProgram(
            {
              projectData: freshProjectData,
              boardTarget,
              projectPath,
              compileOnly: false,
              // The session this upload is for needs breakpoints.
              debugCheckpoints: isRuntimeTarget,
              isSimulator: false,
              runtimeIpAddress,
              runtimeJwtToken,
            },
            (event) => logCompilerEvent(event, (entry) => uploadLog.add(withDetailLevel(entry))),
          )
          uploadLog.flush()
          if (compileResult.success) {
            loginBreakpointsRef.current = isRuntimeTarget
            consoleActions.addLog({
              id: crypto.randomUUID(),
              level: 'info',
              message: 'Upload completed. Re-verifying...',
            })
            await new Promise((resolve) => setTimeout(resolve, 2000))
            void handleMd5Verification(projectPath, boardTarget, debugConfig, isRuntimeTarget)
          } else {
            consoleActions.addLog({
              id: crypto.randomUUID(),
              level: 'error',
              message: `Upload failed: ${compileResult.error ?? 'Unknown error'}`,
            })
            setIsDebuggerProcessing(false)
          }
        } else {
          setIsDebuggerProcessing(false)
        }
      }
    } catch (error: unknown) {
      await debuggerPort.disconnect()
      consoleActions.addLog({
        id: crypto.randomUUID(),
        level: 'error',
        message: `MD5 verification error: ${getErrorMessage(error)}`,
      })
      setIsDebuggerProcessing(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Debug-spec resolver — surface picker / prompt / error dialogs and
  // return a connection-ready DebugConnectionConfig, or null if the
  // user cancelled or no config could be resolved.
  // ---------------------------------------------------------------------------

  // Renderer-local prompt cache for the DHCP-IP-style flows.  Keyed
  // by `<packageId>|<deviceId>|<cacheKey>` (or `builtin|<board>|<cacheKey>`
  // for hals.json entries) so two boards sharing a `cacheKey` value
  // don't see each other's last-entered IP.  Lives on a ref so it
  // survives across re-renders without triggering them.
  const promptCacheRef = useRef<Record<string, Record<string, string>>>({})

  const resolveDebugConfigWithUx = useCallback(
    async (boardTarget: string, spec: DebugSpec | undefined): Promise<DebugConnectionConfig | null> => {
      if (!spec) {
        await showDebuggerMessage(
          'warning',
          'Debugging Not Available',
          "This board hasn't declared a debug spec.  The VPP package (or hals.json entry) must provide a `debug` block.",
          ['OK'],
        )
        return null
      }

      // Build resolver context from current store state on each call —
      // captures the user's freshest screen edits without forcing the
      // user to save first.
      const buildContext = (): DebugResolverContext => {
        const store = useOpenPLCStore.getState()
        const cfg = store.deviceDefinitions.configuration
        const rtConn = store.runtimeConnection
        // `vendorScreenData` is already keyed by section ID (e.g.
        // `modbus_rtu`); resolver state's `screens` shape matches
        // 1:1 so we pass it straight through.
        const screens = (cfg.vendorScreenData ?? {}) as Record<string, Record<string, unknown>>
        const cacheBucketKey = `${cfg.deviceBoard}`
        const promptCache = promptCacheRef.current[cacheBucketKey] ?? {}
        return {
          state: {
            configuration: {
              deviceBoard: cfg.deviceBoard,
              ...(cfg.communicationPort ? { communicationPort: cfg.communicationPort } : {}),
              ...(cfg.runtimeIpAddress ? { runtimeIpAddress: cfg.runtimeIpAddress } : {}),
            },
            screens,
            runtimeConnection: {
              ...(rtConn.connectionStatus ? { connectionStatus: rtConn.connectionStatus } : {}),
              ...(rtConn.jwtToken ? { jwtToken: rtConn.jwtToken } : {}),
            },
            promptCache,
          },
          capabilities: {
            runtimeConnected: runtime.isReadyForDebug?.() === true && rtConn.connectionStatus === 'connected',
            jwtToken: Boolean(rtConn.jwtToken),
          },
        }
      }

      let selectedChannelIndex: number | undefined
      // Loop: pickers/prompts re-invoke the resolver with extra state
      // until it returns config or error/unsupported/cancelled.
      // Capped at 8 iterations as a defensive guard against spec
      // bugs that could otherwise loop forever.
      for (let iteration = 0; iteration < 8; iteration += 1) {
        const outcome = resolveDebugConnection(spec, buildContext(), selectedChannelIndex)
        if (outcome.kind === 'config') {
          return outcome.config
        }
        if (outcome.kind === 'error') {
          await showDebuggerMessage('warning', outcome.title, outcome.body, ['OK'])
          return null
        }
        if (outcome.kind === 'unsupported') {
          // Defensive — buildContext already errored at top-level on
          // missing spec, so we shouldn't reach here normally.
          return null
        }
        if (outcome.kind === 'pick') {
          const buttons = outcome.channels.map((c) => c.label)
          const choice = await showDebuggerMessage('question', outcome.title, outcome.body, buttons)
          if (choice < 0 || choice >= outcome.channels.length) return null
          selectedChannelIndex = outcome.channels[choice].index
          continue
        }
        if (outcome.kind === 'prompt') {
          const bucketKey = boardTarget
          const bucket = (promptCacheRef.current[bucketKey] ??= {})
          for (const field of outcome.fields) {
            const previous = field.cacheKey ? bucket[field.cacheKey] : undefined
            const result = await showDebuggerIpInput(field.title, field.message, previous ?? field.defaultValue ?? '')
            if (result === null) return null
            const trimmed = result.trim()
            if (!trimmed) return null
            if (field.cacheKey) bucket[field.cacheKey] = trimmed
          }
          selectedChannelIndex = outcome.channelIndex
          continue
        }
      }
      return null
    },
    [runtime],
  )

  // ---------------------------------------------------------------------------
  // Debugger click — full orchestration for non-simulator targets
  // ---------------------------------------------------------------------------

  /**
   * Attach, deploy, or cancel. Compiles the project's debug build locally (no upload, PLC
   * untouched), then probes the target over the debug channel: program MD5, run control, and
   * the checkpoint fingerprint (utils/debug-attach.ts). Asks before any download.
   */
  const planDebugConnection = async (
    projectPath: string,
    boardTarget: string,
    debugConfig: DebugConnectionConfig,
  ): Promise<'attach' | 'monitor' | 'online' | 'deploy' | 'cancel'> => {
    const { consoleActions } = useOpenPLCStore.getState()
    const log = (level: 'info' | 'warning', message: string) =>
      consoleActions.addLog({ id: crypto.randomUUID(), level, message })

    log('info', 'Login: checking whether the target runs this program...')
    const compiled = await handleBuild({ compileOnly: true, debugCheckpoints: true, keepPlcRunning: true })
    if (!compiled) return 'cancel'

    const md5Result = await debuggerPort.readProgramMd5(projectPath, boardTarget)
    const mapResult = await debuggerPort.readCheckpointMap(projectPath, boardTarget)
    const probe: Parameters<typeof decideAttach>[0] = {
      connected: false,
      localFingerprint: parseCheckpointFingerprint(mapResult.fingerprintContent),
    }
    const conn = await debuggerPort.connect(debugConfig)
    if (conn.success) {
      probe.connected = true
      if (md5Result.success && md5Result.md5) {
        const verify = await debuggerPort.verifyMd5(md5Result.md5, debugConfig)
        probe.md5Match = verify.success && verify.match === true
      }
      const info = await debuggerPort.getStopInfo()
      if (info.success) probe.runControl = info.runControl
      await debuggerPort.disconnect()
    } else {
      probe.connectError = conn.error
    }

    const decision = decideAttach(probe)
    if (decision.attach) {
      if (decision.breakpoints) {
        log('info', "The target runs this project's debug build: logging in without a download, breakpoints on.")
        return 'attach'
      }
      log('info', `The target runs this program: logging in without a download. ${decision.note ?? ''}`)
      return 'monitor'
    }
    log('warning', decision.reason)
    if (!decision.canDeploy) {
      await showDebuggerMessage('error', 'Cannot debug this target', decision.reason, ['OK'])
      return 'cancel'
    }
    // The PLC runs another version of this program: CODESYS asks "online change or download".
    // The online change keeps the PLC running and every value; the download restarts it.
    const st = useOpenPLCStore.getState()
    const canOnline =
      st.runtimeConnection.plcStatus === 'RUNNING' && (st.deviceDefinitions.configuration.deviceBoard || '').startsWith('MCM20.1')
    if (canOnline) {
      const choice = await showDebuggerMessage(
        'question',
        'Login: the program has changed',
        `${decision.reason}\n\nOnline change: the running PLC takes the new program at a scan boundary, nothing ` +
          'stops and every value is kept. Download: the PLC stops, takes the new program and starts again.',
        ['Online change and log in', 'Download and log in', 'Cancel'],
        { primaryButtonIndex: 0, dismissButtonIndex: 2 },
      )
      return choice === 0 ? 'online' : choice === 1 ? 'deploy' : 'cancel'
    }
    const response = await showDebuggerMessage(
      'question',
      'Login: download the program?',
      `${decision.reason}\n\nDownload this project (with breakpoint support) to the target and log in? ` +
        'The PLC program restarts.',
      ['Download and log in', 'Cancel'],
      { primaryButtonIndex: 0, dismissButtonIndex: 1 },
    )
    return response === 0 ? 'deploy' : 'cancel'
  }

  /** Connect to the board's runtime for Login: dev mode's kept password first, else ask for the
   *  address and the board password (services/runtime-connect.ts does the rest). */
  const ensureRuntimeConnection = useCallback(async (): Promise<boolean> => {
    const { consoleActions } = useOpenPLCStore.getState()
    if (isDevMode()) {
      const r = await connectToRuntime(runtime)
      if (r.ok) return true
    }
    for (;;) {
      const st = useOpenPLCStore.getState()
      const answer = await askRuntimeConnection(
        st.deviceDefinitions.configuration.runtimeIpAddress || '',
        needsBoardPassword(st.deviceDefinitions.configuration.deviceBoard),
      )
      if (!answer) {
        consoleActions.addLog({ id: crypto.randomUUID(), level: 'info', message: 'Login cancelled: not connected.' })
        return false
      }
      if (answer.ip) st.deviceActions.setRuntimeIpAddress(answer.ip)
      const r = await connectToRuntime(runtime, answer.password ? { boardPassword: answer.password } : {})
      if (r.ok) return true
      if (r.reason === 'cancelled') return false
      consoleActions.addLog({ id: crypto.randomUUID(), level: 'warning', message: `Not connected: ${r.reason}` })
    }
  }, [runtime])

  const handleDebuggerClick = useCallback(async () => {
    // Simulator targets debug through the Start Simulator button
    // (compile + load firmware + connect), so the Debugger button
    // is hidden for them at the JSX level — but guard here too in
    // case the gate ever flips.
    if (isSimulatorBoard) return

    const { workspace, project, deviceDefinitions: devDefs, consoleActions } = useOpenPLCStore.getState()

    // Toggle off
    if (workspace.isDebuggerVisible) {
      await goOfflineRef.current()
      return
    }

    if (isDebuggerProcessing) return
    setIsDebuggerProcessing(true)

    try {
      // Mirror the build flow: always save before starting the
      // debugger so the on-disk project matches what the user sees
      // on screen. Avoids the race where an editor change hadn't
      // bubbled up to `editingState === 'unsaved'` yet. Viewers
      // without write permission skip the save (same rationale as
      // the build path — backend write would fail).
      if (canEdit) {
        const saved = await executeSave()
        if (!saved) {
          setIsDebuggerProcessing(false)
          return
        }
      }

      const boardTarget = devDefs.configuration.deviceBoard
      const projectPath = project.meta.path
      const boardInfo = availableBoards.get(boardTarget)

      // NOT CONNECTED: connect first instead of refusing -- the kept password in dev mode, else
      // one dialog for the board's address and password.
      if (isOpenPLCRuntimeTarget(boardInfo) && useOpenPLCStore.getState().runtimeConnection.connectionStatus !== 'connected') {
        const connected = await ensureRuntimeConnection()
        if (!connected) {
          setIsDebuggerProcessing(false)
          return
        }
      }

      const debugConfig = await resolveDebugConfigWithUx(boardTarget, boardInfo?.debug)
      if (!debugConfig) {
        setIsDebuggerProcessing(false)
        return
      }

      // `isRuntimeTarget` gates two things: the network debug DEPLOY below,
      // and the "PLC stopped, start it?" dialog inside MD5 verification.  Tied
      // to whether the active channel needs the runtime alive — websocket/tcp
      // targets do, rtu/simulator targets don't.
      const isRuntimeTarget = debugConfig.connectionType === 'websocket' || debugConfig.connectionType === 'tcp'

      if (isRuntimeTarget) {
        // LOGIN WITHOUT DOWNLOAD when the target already runs this project's debug build:
        // compile it here exactly as a deploy would (the checkpoint maps land in
        // build/<target>/src) but upload nothing and leave the PLC running, then ask the target
        // whether it is that program, with run control on and the same checkpoint layout. Only
        // when it is not does the debugger offer the download -- which restarts the PLC.
        const plan = await planDebugConnection(projectPath, boardTarget, debugConfig)
        loginBreakpointsRef.current = plan !== 'monitor'
        if (plan === 'cancel') {
          consoleActions.addLog({ id: crypto.randomUUID(), level: 'info', message: 'Login cancelled.' })
          setIsDebuggerProcessing(false)
          return
        }
        if (plan === 'online') {
          // Refused, handleBuild asks before falling back to a download (autoOnline).
          const changed = await handleBuild({
            compileOnly: false,
            debugCheckpoints: true,
            onlineChange: true,
            autoOnline: true,
            onlineConfirmed: true,
          })
          if (!changed) {
            consoleActions.addLog({
              id: crypto.randomUUID(),
              level: 'info',
              message: 'Login cancelled: the program on the PLC was not changed.',
            })
            setIsDebuggerProcessing(false)
            return
          }
        }
        if (plan === 'deploy') {
          // Debug deploy (CoDeSys "download"): instrument every statement, upload to the
          // runtime, cross-compile the halt-able `.so` and deploy it to the target -- THEN
          // connect. Reuses the full build/upload path (pre-build save, stop-PLC prompt,
          // alias resolution, upload) via `handleBuild`.
          const deployed = await handleBuild({ compileOnly: false, debugCheckpoints: true })
          if (!deployed) {
            consoleActions.addLog({
              id: crypto.randomUUID(),
              level: 'info',
              message: 'Login cancelled: the download did not complete.',
            })
            setIsDebuggerProcessing(false)
            return
          }
        }
      } else {
        // Local transports (simulator / RTU): instrument the program in the
        // project build dir only — there is no network runtime to deploy to.
        // Resolve alias-bound locations to concrete addresses first (same
        // pre-compile snapshot the build/upload paths use) — the compiler only
        // understands `%…` literals, not alias names.
        const freshProjectData = useOpenPLCStore.getState().projectActions.getCompileReadyProjectData()
        consoleActions.addLog({ id: crypto.randomUUID(), level: 'info', message: 'Starting debug compilation...' })
        const debugLog = createLogBatcher(consoleActions.addLogs)
        const debugCompileResult = await compiler.compileForDebug(
          { projectData: freshProjectData, boardTarget, projectPath },
          (event) => logCompilerEvent(event, (entry) => debugLog.add(withDetailLevel(entry))),
        )
        debugLog.flush()
        if (!debugCompileResult.success) {
          consoleActions.addLog({
            id: crypto.randomUUID(),
            level: 'error',
            message: `Debug compilation failed: ${debugCompileResult.error ?? 'Unknown error'}`,
          })
          setIsDebuggerProcessing(false)
          return
        }
      }

      void handleMd5Verification(projectPath, boardTarget, debugConfig, isRuntimeTarget)
    } catch (error: unknown) {
      consoleActions.addLog({
        id: crypto.randomUUID(),
        level: 'error',
        message: `Debugger init error: ${getErrorMessage(error)}`,
      })
      setIsDebuggerProcessing(false)
    }
  }, [
    debuggerPort,
    runtime,
    compiler,
    debugSession,
    projectData,
    deviceDefinitions,
    projectMeta,
    availableBoards,
    isSimulatorBoard,
    isDebuggerProcessing,
    canEdit,
    executeSave,
    addLog,
    resolveDebugConfigWithUx,
    handleBuild,
    ensureRuntimeConnection,
  ])
  reloginRef.current = handleDebuggerClick
  goOfflineRef.current = async () => {
    const { workspace } = useOpenPLCStore.getState()
    if (!workspace.isDebuggerVisible) return true
    // FORCES OUTLIVE THE LOGIN: they stay on the PLC until released. Say so, and let the
    // operator choose, before the session that shows them goes.
    const forced = workspace.debugPlcForces ? workspace.debugPlcForces.size : workspace.debugForcedVariables.size
    if (forced > 0) {
      const i = await showDebuggerMessage(
        'warning',
        'Variables are forced',
        `${forced} variable(s) are forced on the PLC. A force stays on the PLC after logout, until it is ` +
          'released, the PLC program is downloaded again or the PLC restarts.',
        ['Release and log out', 'Keep forced and log out', 'Cancel'],
        { dismissButtonIndex: 2 },
      )
      if (i === 2) return false
      if (i === 0) await releaseForces(debuggerPort)
    }
    await debugSession.stopSession()
    return true
  }

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <>
      <TooltipSidebarWrapperButton tooltipContent='Search'>
        <SearchButton />
      </TooltipSidebarWrapperButton>
      <TooltipSidebarWrapperButton tooltipContent='Open/Close Toolbox'>
        <ZoomButton {...zoom} />
      </TooltipSidebarWrapperButton>
      {/* Program-build affordances: hidden for library projects.
          Library builds use a dedicated button (Phase 7 wires the
          actual compile dispatch — for Phase 3 we render a disabled
          placeholder that surfaces in the right spot). */}
      {projectCaps.hasProgramBuild && (
        <>
          <BuildOptionsPopover
            disabled={isCompiling || isSimulatorBoard}
            attention={changedSinceLogin}
            loggedIn={isDebuggerVisible && !isSimulatorBoard}
            triggerTooltip={
              isSimulatorBoard
                ? 'Use Start to build and run'
                : isCompiling
                  ? 'Compiling…'
                  : isDebuggerVisible
                    ? changedSinceLogin
                      ? 'Changed since login: online change to put it on the PLC'
                      : 'Online change'
                    : 'Build options'
            }
            // Direct-USB targets (every arduino-cli board, simulator)
            // always allow upload — arduino-cli connects via USB at
            // upload time, no prior network handshake needed.  Runtime
            // v3/v4 targets must be connected first since the upload
            // goes over the network to the on-device webserver.
            //
            // Capability-driven (`directUsbUpload`) rather than
            // `isArduinoTarget`, because VPP-IO boards (Opta) flip
            // `pinMapping: false` and the legacy
            // `isArduinoTarget` helper keys off `pinMapping`.  Those
            // boards still upload over USB via arduino-cli, so the
            // gate needs the more direct flag.
            uploadAvailable={(() => {
              const caps = resolveTargetCapabilities(currentBoardInfo)
              if (caps.directUsbUpload) return true
              return connectionStatus === 'connected'
            })()}
            uploadDisabledReason='must be connected to the device to upload'
            onSelect={(option: BuildOption) => {
              switch (option) {
                case 'build-only':
                  void handleBuild({ compileOnly: true, cleanBuild: false })
                  break
                case 'build-upload':
                  void handleBuild({ compileOnly: false, cleanBuild: false })
                  break
                case 'clean-upload':
                  void handleBuild({ compileOnly: false, cleanBuild: true })
                  break
                case 'online-change':
                  // Logged in: handleBuild asks OK / Cancel / Go offline, then changes online.
                  void handleBuild({ compileOnly: false })
                  break
              }
            }}
          />
          <TooltipSidebarWrapperButton
            tooltipContent={
              isSimulatorBoard
                ? simulatorRunning
                  ? 'Stop Simulator'
                  : 'Start Simulator'
                : connectionStatus !== 'connected'
                  ? 'Connect to runtime first'
                  : plcStarting
                    ? 'Starting the PLC...'
                    : plcStatus === 'RUNNING'
                      ? 'Stop PLC'
                      : 'Start PLC'
            }
          >
            <PlayButton
              onClick={isSimulatorBoard ? () => void handleSimulatorControl() : () => void handlePlcControl()}
              disabled={
                isSimulatorBoard ? isCompiling || isDebuggerProcessing : connectionStatus !== 'connected' || plcStarting
              }
              className={cn(
                isSimulatorBoard
                  ? isCompiling || isDebuggerProcessing
                    ? disabledButtonClass
                    : ''
                  : connectionStatus !== 'connected' || plcStarting
                    ? disabledButtonClass
                    : '',
              )}
            >
              {(isSimulatorBoard ? simulatorRunning : plcStatus === 'RUNNING') ? <StopIcon /> : null}
            </PlayButton>
          </TooltipSidebarWrapperButton>
          <TooltipSidebarWrapperButton
            tooltipContent={
              isSimulatorBoard
                ? 'Use Start to debug'
                : isDebuggerVisible
                  ? 'Logout'
                  : 'Login: live values of the running program (and breakpoints on a debug build)'
            }
          >
            <DebuggerButton
              onClick={() => void handleDebuggerClick()}
              disabled={isDebuggerProcessing || isSimulatorBoard}
              isActive={isDebuggerVisible}
              className={cn((isDebuggerProcessing || isSimulatorBoard) && disabledButtonClass)}
            />
          </TooltipSidebarWrapperButton>
        </>
      )}
      {/* Library-build affordance: shown only for library projects.
          Two options surface via the `libraryMode` popover:
            - "Build"       → fast build (verification short-
              circuited by MD5 cache hit, when warm).
            - "Clean build" → skip verification cache and force a
              fresh avr-gcc verify against the simulator target. */}
      {projectCaps.hasLibraryBuild && (
        // No outer `TooltipSidebarWrapperButton`: `BuildOptionsPopover`
        // already renders its own Radix tooltip via `triggerTooltip`,
        // and the wrapper's tooltip persisted on top of the popover
        // contents once the menu opened (PLC build button doesn't wrap
        // either — same idiom here for consistency).
        <BuildOptionsPopover
          disabled={isCompiling}
          triggerTooltip={isCompiling ? 'Building library…' : 'Build Library'}
          libraryMode={true}
          uploadAvailable={false}
          uploadDisabledReason='library builds do not upload'
          onSelect={(option: BuildOption) => {
            switch (option) {
              case 'build-only':
                void handleBuildLibrary({ cleanBuild: false })
                break
              case 'clean-upload':
                void handleBuildLibrary({ cleanBuild: true })
                break
            }
          }}
        />
      )}
      <TooltipSidebarWrapperButton tooltipContent='AI Chat'>
        <ChatButton />
      </TooltipSidebarWrapperButton>
    </>
  )
}
