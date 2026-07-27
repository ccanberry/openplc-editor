// Robotek OpenPLC Suite changelog, shown in the "!" About panel (activity bar,
// just above Exit). Newest first. Keep in sync with the suite version in
// installer/openplc-suite.iss (MyAppVersion): add an entry each time you bump
// it. `version` is matched against ROBOTEK_VERSION to flag the running build.

export interface ChangelogEntry {
  version: string
  /** Release date, ISO yyyy-mm-dd. */
  date: string
  changes: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '2026-07-27',
    changes: [
      'RoboCNC C-block POUs no longer declare their own EN input. EN is the implicit IEC 61131-3 enable pin: the compiler gates the block body on it and never assigns a declared EN member, so a body that re-tested `if (EN)` never ran and every READ_PARAM / WRITE_PARAM / MCODE / MRESET call was a silent no-op. Drop `EN : BOOL` from VAR_INPUT and the `if (EN)` wrapper — pass EN at the call site as before.',
      'New RCNC_CONNECT block: opens and verifies the OpenPLC↔RoboCNC Modbus link on demand (connectCNC-style), so a program can establish the link from an init/connection POU instead of relying on the first parameter access to connect lazily.',
      'RoboCNC drive (fieldbus) connection is now client-controlled: WRITE_PARAM_INT to DRIVE_CONNECT_REQ (holding 2057) connects on a 0→1 edge and disconnects on 1→0; DRIVE_CONNECTED (input 1015) reports the actual state. With system.json drive_connect:"manual" the drives connect only when the PLC program asks.',
    ],
  },
  {
    version: '1.0.9',
    date: '2026-07-21',
    changes: [
      'On-board debugging: the Debug button now attaches to the physical MCM20.1 board over Modbus TCP :502 (its :502 slave routes the debug protocol to plc_main) instead of the compile-server mirror, so breakpoints halt the REAL program and hold the DIO/AIO outputs.',
      'Debugger no longer cancels on benign ssh host-key notices relayed during the arm9 deploy (the editor now trusts the pipeline’s authoritative build outcome).',
      'Runtime: stopping or killing the process (SIGTERM) now drives all card outputs to 0 via the graceful plugin teardown, instead of leaving them latched.',
      'Editor shows the board’s real PLC status right after connect (the compile server proxies the board’s plcctl STATUS for arm9 targets).',
      'Added this About / changelog panel (the "!" icon) and kept the suite version on the title bar.',
    ],
  },
  {
    version: '1.0.8',
    date: '2026-07-21',
    changes: [
      'Suite version shown on the title bar: "OpenPLC Editor Robotek v<version>".',
      'Online-debugger UI (inline breakpoint gutter + run-control toolbar); the Debug button auto-deploys the instrumented build to the target.',
    ],
  },
  {
    version: '1.0.7',
    date: '2026-07-20',
    changes: ['Online-debugger UI groundwork; rebuilt OpenPLC runtime appliance.'],
  },
]
