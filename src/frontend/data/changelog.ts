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
