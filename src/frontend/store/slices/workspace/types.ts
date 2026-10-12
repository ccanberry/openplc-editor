import type {
  Architecture,
  DebugCheckpointEntry,
  DebugConnectionType,
  DebugTreeNode,
  FbInstanceInfo,
  Platform,
  PlcLogs,
} from '../../../../middleware/shared/ports/types'

// ---------------------------------------------------------------------------
// PLC Log Filters
// ---------------------------------------------------------------------------

export type PlcFilters = {
  levels: {
    debug: boolean
    info: boolean
    warning: boolean
    error: boolean
  }
  searchTerm: string
  timestampFormat: 'full' | 'time' | 'none'
}

// ---------------------------------------------------------------------------
// CODESYS-style forcing: prepared values (F7 force / Ctrl+F7 write)
// ---------------------------------------------------------------------------

/** One leaf of the running program's debug map. */
export type DebugLeafInfo = { path: string; type: string; hidden?: boolean }

/** A value prepared for the next Write / Force; `value` null = release the force at F7. */
export type DebugPreparedValue = { index: number; type: string; value: string | null }

/** The variable whose prepare dialog is open. */
export type DebugPrepareTarget = { path: string; index: number; type: string; enumValues?: string[] }

// ---------------------------------------------------------------------------
// Project tree
// ---------------------------------------------------------------------------

export type WorkspaceProjectTreeLeafType =
  | 'function'
  | 'function-block'
  | 'program'
  | 'data-type'
  | 'device'
  | 'resource'
  | 'server'
  | 'remote-device'
  | 'vendor-screen'
  | 'package-manager'
  | 'library-manager'
  | 'library-manifest'
  | 'ethercat-device'
  | null

// ---------------------------------------------------------------------------
// System configuration
// ---------------------------------------------------------------------------

export type SystemConfigs = {
  OS: Platform
  arch: Architecture
  shouldUseDarkMode: boolean
  isWindowMaximized: boolean
}

// ---------------------------------------------------------------------------
// Workspace State (superset of both editor and web)
// ---------------------------------------------------------------------------

export type WorkspaceState = {
  workspace: {
    editingState: 'save-request' | 'saved' | 'unsaved' | 'initial-state'
    systemConfigs: SystemConfigs
    recent: Array<{ lastOpenedAt: string; createdAt: string; path: string; name: string }>
    isCollapsed: boolean
    isModalOpen: Array<{ modalName: string; modalState: boolean }>
    discardChanges: boolean
    selectedProjectTreeLeaf: {
      label: string
      type: WorkspaceProjectTreeLeafType
    }
    close: {
      window: boolean
      app: boolean
      appDarwin: boolean
    }
    // PLC Logs
    isPlcLogsVisible: boolean
    plcLogs: PlcLogs
    plcLogsLastId: number | null
    plcFilters: PlcFilters
    // Debug state (union of editor + web fields)
    isDebuggerVisible: boolean
    debuggerTargetIp: string | null
    debugCContent: string | null
    debugVariableIndexes: Map<string, number>
    debugBoolValues: Map<string, string>
    debugNonBoolValues: Map<string, string>
    debugForcedVariables: Map<string, boolean>
    debugTick: number
    debugVariableTree: Map<string, DebugTreeNode>
    debugExpandedNodes: Map<string, boolean>
    fbDebugInstances: Map<string, FbInstanceInfo[]>
    fbSelectedInstance: Map<string, string>
    debugLocalMd5: string | null
    debugGraphList: string[]
    debugDataStale: boolean
    debugMd5Mismatch: { runtimeMd5: string; localMd5: string } | null
    /** Active transport for the running debug session — drives the
     *  per-poll batch size and any other transport-specific behaviour.
     *  Null when no session is active. */
    debugConnectionType: DebugConnectionType | null
    // -------- Online-debugger run control (FC 0x46-0x4B) --------
    /** Checkpoint map from the compiler's `checkpoint-map.json`, resolved to
     *  POU-local coordinates.  Drives which gutter lines are breakpointable
     *  and resolves armed breakpoints → runtime checkpoint ids. */
    debugCheckpointMap: DebugCheckpointEntry[]
    /** Armed breakpoints as composite `<pou>:<line>` keys (1-based line). */
    debugBreakpoints: string[]
    /** True while a task is halted at a checkpoint (breakpoint / single-step). */
    debugHalted: boolean
    /** Checkpoint id the target is currently halted on, or null when running. */
    debugStoppedCheckpointId: number | null
    /** Target's native byte order for multi-byte variable values on
     *  the wire.  Detected from the 0xDEAD sentinel in the MD5
     *  response: LE target writes the trailer as `[0xAD, 0xDE]`, BE
     *  target writes `[0xDE, 0xAD]`.  The editor's internal codecs
     *  always produce / consume little-endian bytes; the swap layer
     *  at the read / write boundaries flips on BE targets only.
     *
     *  Defaults to `'le'` because every shipped target today is LE.
     *  MD5 verification runs before any force / read transaction so
     *  the value is correct by the time any swap path executes. */
    debugTargetEndian: 'le' | 'be'
    // -------- CODESYS-style forcing --------
    /** Every leaf of the running program's map by packed address: its path and type. */
    debugLeaves: Map<number, DebugLeafInfo>
    /** Values prepared for the next Write (Ctrl+F7) / Force (F7), keyed by debug-map path.
     *  Session-only: nothing is sent until F7 / Ctrl+F7. */
    debugPrepared: Map<string, DebugPreparedValue>
    /** What the PLC holds forced (FC 0x4F), debug-map path -> forced value as shown; null
     *  when the PLC cannot say (older core or program) -- then only this editor's own forces
     *  are known (debugForcedVariables). */
    debugPlcForces: Map<string, string> | null
    /** Keys views want polled beyond the code on screen (force lists, the resource's global
     *  variables), by the view that asks. A key is a composite key or a debug-map path. */
    debugExtraKeys: Record<string, string[]>
    /** The variable whose prepare dialog is open. */
    debugPrepareTarget: DebugPrepareTarget | null
    // Project loading state
    isProjectLoading: boolean
    projectLoadingMessage: string
    /**
     * Whether the viewer has permission to persist changes to the open
     * project (e.g. they own it or have write access).  Only gates
     * operations that write to the backend — save, commit, branch
     * create/delete, stash, discard.  In-memory editing, simulation,
     * and compilation are always allowed: a viewer of a public project
     * works on a local copy and just can't push it back.  Set by
     * `handleOpenProjectResponse` from the backend `canEdit` flag;
     * absent (desktop editor / dev-local) ⇒ `true`.  Reset to `true`
     * on project close.
     */
    canEdit: boolean
  }
}

// ---------------------------------------------------------------------------
// Workspace Response
// ---------------------------------------------------------------------------

export type WorkspaceResponse = {
  ok: boolean
  title?: string
  message?: string
}

// ---------------------------------------------------------------------------
// Workspace Actions (superset of both editor and web)
// ---------------------------------------------------------------------------

export type WorkspaceActions = {
  setEditingState: (editingState: WorkspaceState['workspace']['editingState']) => void
  setRecent: (recent: WorkspaceState['workspace']['recent']) => void
  setSystemConfigs: (config: Partial<SystemConfigs>) => void
  setCloseWindow: (value: boolean) => void
  setCloseApp: (value: boolean) => void
  setCloseAppDarwin: (value: boolean) => void
  switchAppTheme: () => void
  toggleMaximizedWindow: () => void
  toggleCollapse: () => void
  toggleDiscardChanges: () => void
  setModalOpen: (modalName: string, modalState: boolean) => void
  setSelectedProjectTreeLeaf: (leaf: { label: string; type: WorkspaceProjectTreeLeafType }) => void
  clearWorkspace: () => void
  // PLC Logs
  setPlcLogsVisible: (isVisible: boolean) => void
  setPlcLogs: (logs: PlcLogs) => void
  setPlcLogsLastId: (lastId: number | null) => void
  appendPlcLogs: (newLogs: PlcLogs) => void
  clearPlcLogs: () => void
  setPlcLevelFilter: (level: 'debug' | 'info' | 'warning' | 'error', enabled: boolean) => void
  setPlcSearchTerm: (term: string) => void
  setPlcTimestampFormat: (format: 'full' | 'time' | 'none') => void
  // Debug actions
  setDebuggerVisible: (isVisible: boolean) => void
  setDebuggerTargetIp: (targetIp: string | null) => void
  setDebugCContent: (content: string | null) => void
  setDebugVariableIndexes: (indexes: Map<string, number>) => void
  setDebugBoolValues: (values: Map<string, string>) => void
  setDebugNonBoolValues: (values: Map<string, string>) => void
  setDebugForcedVariables: (forced: Map<string, boolean>) => void
  setDebugTick: (tick: number) => void
  setDebugVariableTree: (tree: Map<string, DebugTreeNode>) => void
  setDebugExpandedNodes: (expandedNodes: Map<string, boolean>) => void
  toggleDebugExpandedNode: (compositeKey: string) => void
  setFbDebugInstances: (instances: Map<string, FbInstanceInfo[]>) => void
  setFbSelectedInstance: (fbTypeName: string, key: string) => void
  setDebugLocalMd5: (md5: string | null) => void
  setDebugGraphList: (list: string[]) => void
  setDebugDataStale: (stale: boolean) => void
  setDebugMd5Mismatch: (mismatch: { runtimeMd5: string; localMd5: string } | null) => void
  setDebugConnectionType: (connectionType: DebugConnectionType | null) => void
  setDebugTargetEndian: (endian: 'le' | 'be') => void
  // Run control
  setDebugCheckpointMap: (entries: DebugCheckpointEntry[]) => void
  toggleBreakpoint: (compositeKey: string) => void
  setBreakpoints: (compositeKeys: string[]) => void
  clearBreakpoints: () => void
  setDebugHalt: (halted: boolean, checkpointId: number | null) => void
  clearDebugState: () => void
  clearFbDebugContext: () => void
  removeDebugVariable: (compositeKey: string) => void
  // CODESYS-style forcing
  setDebugLeaves: (leaves: Map<number, DebugLeafInfo>) => void
  /** Prepare `path` (null entry = remove the preparation). */
  setDebugPrepared: (path: string, entry: DebugPreparedValue | null) => void
  clearDebugPrepared: () => void
  setDebugPlcForces: (forces: Map<string, string> | null) => void
  setDebugExtraKeys: (source: string, keys: string[]) => void
  setDebugPrepareTarget: (target: DebugPrepareTarget | null) => void
  // Project loading
  setProjectLoading: (isLoading: boolean, message?: string) => void
  // Persist-permission flag (backend write access on the open project)
  setCanEdit: (value: boolean) => void
}

export type WorkspaceSlice = WorkspaceState & {
  workspaceActions: WorkspaceActions
}
