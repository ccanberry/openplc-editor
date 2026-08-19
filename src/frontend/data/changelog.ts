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
    version: '1.2.0',
    date: '2026-08-05',
    changes: [
      'RETAINED VARIABLES, and they survive a power cut. The runtime keeps them in persist/retain.json next to the runtime folder (not under build/, which a deploy or a clean wipes): the file is written back at every stop AND within a couple of seconds of a retained value changing, then applied over everything on the first scan. That is the soft-PLC equivalent of battery-backed SRAM — a hardware PLC writes retain every scan for free, a PC filesystem cannot, so the price is that changes in the last ~2 s before a hard cut are lost. Missing, corrupt or stale-keyed file is never fatal: one warning, compiled initial values, PLC keeps running.',
      'The Device dropdown now decides where a program is built and sent. It previously did not: every upload cross-compiled for the ARM9 and auto-deployed to 192.168.0.10 regardless of the board selected, because the target was a single global file on the compile server. The hardware target is now chosen per upload.',
      'New "Local (this PC)" board: builds and runs the program on the compile server itself, on the byte-identical v4 path, with no cross-compile and no deploy to the board. Use it to validate a program when no bench is available — a Local upload leaves the board untouched.',
      'Published resource globals: a variable marked Publish is assigned an %QW512+ address automatically and exported to conf/hmi_map.json, so an HMI binds by NAME instead of by hand-counted register offset (CoDeSys-style GVL groups).',
      'Simulated RoboCards. A card can be declared source:"sim" and behaves with a realistic timing model, so a rack can be brought up with cards missing. Inputs can be injected (plcctl PLUGIN_CMD:robocard:{"command":"inject",...}); loopback is no longer the default, because on a card that carries both inputs and outputs it ties DI to DO and silently freezes the program.',
      'When every card is simulated the RS-485 bus is no longer opened at all, so a fully simulated rack needs no serial port present.',
      'An AIO card\'s input span and output range come from robocard_config.json instead of a hardcoded 0-10 V. A card wired for 4-20 mA or ±10 V now reads and drives in the units it is actually configured for, and the declared range is what the scaling uses.',
      'Runtime refuses to start a second plc_main (file lock). A duplicate instance fighting the first for the cards is worse than a clean refusal.',
      'Fixed: DINTs read over the RoboCNC link came back word-swapped — REAL and DINT do not share a word order.',
      'Fixed: a bit output could stay latched forever after a dropped journal bank-flip; bits are now always re-journalled.',
      'Scan-time self-measurement: write 1 to the window register and the runtime reports min/max/mean scan time at :502 registers 1024+, then auto-clears.',
      'RoboCard I/O is faster and quieter: one frame per DIO card, poll() instead of a spin loop, analog outputs written only on change, and the supervisor polls card status at 4 Hz instead of every scan.',
    ],
  },
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
