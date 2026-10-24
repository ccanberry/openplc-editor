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
    version: '1.11.4',
    date: '2026-10-24',
    changes: [
      'The robocnc_link library has RCNC_CATALOG (core 2.4.0): the programs robocnc holds and the init versions of one of them, for a PLC program to hand to its operator panel. Choosing the version a start takes is a write of its index to 2351 before the start.',
    ],
  },
  {
    version: '1.11.3',
    date: '2026-10-24',
    changes: [
      'Logged in, the build button does the online change at once: a click asks OK / Cancel / Go offline, without a menu first.',
      'A wrong board password is said at once: Connect, Login and every upload check it with the board first. The board refusing it stops there with a message (and the password is forgotten, so the next attempt asks for it), instead of compiling and then failing at the deploy step again and again. In dev mode the password is kept encrypted for this Windows user, as before.',
      'Logged in, the Value column of a GVL shows an array or a function block instance as a tree: closed at first, opened with its arrow to its elements or members, each with its live value (nested for arrays of function blocks). What is opened stays open while you look at other tabs.',
      'Typing in a variables code view (a GVL or a POU) lights the build button while logged in, before the code is applied to the project.',
      'File > Settings fits any screen: the dialog scrolls when the window is small.',
      'The Suite launcher: a second start says the Suite is already running (and brings the Editor to the front) instead of stacking launchers; every WSL step has a time limit, and when WSL does not answer a dialog offers to reset it; however the Editor ends, the runtime the Suite started is stopped, and a runtime left over by an earlier crash is taken over and stopped too.',
    ],
  },
  {
    version: '1.11.2',
    date: '2026-10-21',
    changes: [
      'Logged in, the build menu has one purpose, as in CODESYS: Online change. It asks first: OK changes the program on the PLC without stopping it, Cancel does nothing, Go offline logs out. Build only, Build and upload and Clean build and upload are in the menu again after a logout. The build menu icon is turned 90 degrees while logged in.',
      'When the change cannot be made online (another task layout, a halted breakpoint, an older core), the editor says why and offers Go offline and download (log out, then a normal download that stops and starts the PLC) or Cancel.',
      'File > Settings (Ctrl+,), now also in the File menu: the live values update period (1.0 s by default; it left the floating bar), Ask before an online change, Verbose console (off by default: the console shows the build steps, warnings and errors, not every compiler command and plugin state), Clear the console at each build, and Dev mode.',
      'The code view of a GVL fills its tab.',
    ],
  },
  {
    version: '1.11.1',
    date: '2026-10-21',
    changes: [
      'Build and upload no longer waits for the console: the console added the build output one line at a time and drew all its lines again for each, about 0.1 s a line, so a hundred lines of compiler output made a sub-second compile look like 15 s. The lines now come in bursts and only new lines are drawn.',
      'Only the generated files that changed are compiled: a change to one initial value compiles the file that holds it, not a hundred files again from the compiler cache, and the log lists only what was compiled. A clean build still compiles everything.',
      "The Suite brings its runtime to this release's when it starts (1.11.0 shipped the previous runtime's sources).",
    ],
  },
  {
    version: '1.11.0',
    date: '2026-10-21',
    changes: [
      'Global variable lists, as in CODESYS: Global Variables in the project tree holds one GVL per group (the groups become GVLs by themselves), each in its own tab with its table and its code. The code view is that GVL alone, in VAR_GLOBAL, VAR_GLOBAL RETAIN and VAR_GLOBAL RETAIN PERSISTENT blocks: moving a line to another block changes its flag. Add GVL, Rename and Delete are in the menu of a GVL; the GVL column of a row moves it to another GVL. Names stay unique across every GVL. The group filters are gone, and so are the Resource tab\'s global variables: the Resource tab holds the tasks and the program instances.',
      'No VAR_EXTERNAL needed: a program or function block uses any global variable directly (CODESYS). The VAR_EXTERNAL rows are hidden in the variable tables; existing ones are kept and still compile.',
      'Faster builds: each POU compiles to its own file and only what a change touches is compiled again (adding a global used in one program recompiles a few files in about 1.5 s instead of the whole project). The console shows how long each step took.',
      'Download while logged in to a running PLC does an online change by itself: the program changes without stopping the PLC, and the login stays. When the change cannot be done online (another task layout, a halted breakpoint, an older core) the editor says why and offers a normal download.',
      'PERSISTENT (CODESYS VAR RETAIN PERSISTENT): the Persistent column of the global variables and VAR RETAIN PERSISTENT in a POU. "Clean build and upload" is a reset cold now: every retained value goes back to its initial value, except the persistent ones (kept on the board in persist/retain.json.before-clean too).',
      'The editor logs out by itself when the PLC stops, from RoboStudio, a terminal or the editor. Start PLC shows its progress until the PLC runs.',
      'Login while not connected asks for the board address and password, connects and logs in, instead of refusing.',
      'File > Settings (Ctrl+,): Dev mode, off by default. On, the board password of the last connection is kept, encrypted for this Windows user, and Connect and Login use it again without asking. Switching it off deletes every kept password.',
    ],
  },
  {
    version: '1.10.5',
    date: '2026-10-20',
    changes: [
      "The Suite's runtime is brought to core 2.1.0's (openplc-runtime 18ef20b) when the Suite starts. On the board, core 2.1.0 exchanges the RoboCard cards on every PLC scan even when a card misses a reply, and reports a failed card to the program by its address: %IW198 bit a is the card at address a (CardFailed AT %IW198 : WORD). Programs need no change and no new upload.",
    ],
  },
  {
    version: '1.10.4',
    date: '2026-10-19',
    changes: [
      'A watch list, as in CODESYS: type a variable into the Watch box of the debugger panel (POU.name, a global, a member or an array element, with suggestions) and press Enter; it shows its live value, expands, and is removed with x. The list is kept per project on this PC. The Debug column of the variable tables is gone: variables are no longer marked to be watched.',
      'Live values is a switch in the strip over the code (on by default), with the period of the reads, 0.1 to 1.0 s (0.2 s as before). Off, the code shows no values and they are not read; hover, the watch list and forcing work as before.',
      'Live values in programs that declare only VAR_EXTERNALs (MESSAGES, MIXING_HEAD) -- hovering showed them, the code did not.',
      'Hovering an indexed array shows the element the index selects now, also when the index is itself an element or a member (AX[P_VAL[1700]]); hovering the name shows that element (or FB instance), not the whole array.',
      'Connecting to a board asks only for the board password: the editor logs in to the Suite\'s own runtime by itself. The login dialog remains for a runtime that is not the Suite\'s.',
    ],
  },
  {
    version: '1.10.3',
    date: '2026-10-19',
    changes: [
      'RoboCNC link library: RCNC_NC_SYNC reports the nozzle tip as well as the axes (TIP_X/Y/Z = axis minus the controller\'s active tool, with TOOL_NO and TOOL_X/Y/Z), the position the Eckelmann control reported. For core 2.0.0, where the controller keeps the tool active: upload the machine\'s PLC program again so its position checks compare tip heights. On an older core the tip equals the axis, as before.',
    ],
  },
  {
    version: '1.10.2',
    date: '2026-10-19',
    changes: [
      'Build and Upload to a board whose PLC is stopped now succeeds: the program is downloaded and the PLC stays stopped (Start runs it), as in CODESYS. It used to report the upload as failed and cancel a Login with download, although the program was on the board.',
      'Logged in, hovering shows the live value of whatever is under the mouse: an array (its elements), a function block instance or a structure (its members), or a member path such as TON0.Q or ARR[i].X with the index read live. Array elements are read from the PLC only while hovered.',
      'Logged in, opening a function block from the project tree asks whether to show its implementation or one of its instances, arrays of the block included (PLC_PRG.Valves[3]); clicking it again while it is open asks again. The instance list above the code has Implementation too.',
    ],
  },
  {
    version: '1.10.1',
    date: '2026-10-13',
    changes: [
      'Live values in every program, not only PLC_PRG: a PROGRAM called from another POU (CODESYS style, e.g. TANK_STIRRERS from PLC_PRG) has no task instance of its own, and its variables and the function block instances it declares showed no values. They are now found under the program\'s own name.',
      'A breakpoint stop brings its POU on screen with the cursor on the halted line. The new Follow box in the run-control strip turns this off; it is on after installation.',
      'The resource\'s global variables have a None filter: it hides every row and collapses the list. The chosen filter is remembered.',
      'The PLC log no longer fills with "Failed to send plugin command (unexpected): Socket not connected" while a board configuration tab is open: the PLC runs on the board, so this PC answers that its plugins are there.',
    ],
  },
  {
    version: '1.10.0',
    date: '2026-10-12',
    changes: [
      'Forcing as in CODESYS, while logged in: click a variable\'s live value to PREPARE a value -- in the ST/IL code, on an LD contact or coil, in the watch list, in a program\'s variable table or in the resource\'s global variables (new Value column). A BOOL click cycles <TRUE> / <FALSE> / none; other types open a small dialog. Nothing is sent until Force values (F7) forces every prepared value, or Write values (Ctrl+F7) writes them once; Alt+F7 releases every force. The PLC applies all of them in the same scan.',
      'Forced values are marked F (orange) everywhere, read from the PLC itself: forces set from another PC, a tool or before this login show too. The new Forces tab lists everything the PLC holds forced, with Unforce selected / Unforce all. Logging out with forces active asks whether to release them or keep them on the PLC.',
      'Force lists, saved with the project: named sets of variables and values (a bench simulation, a tank test). Deploy prepares a whole list at once, exactly as if each variable had been clicked; F7 then forces it. A force list replaces RoboStudio\'s Force tab.',
      'An online change keeps the forces. Needs core 1.8.0 on the board; on an older core forcing still works, but only the forces set from this editor are known.',
    ],
  },
  {
    version: '1.9.1',
    date: '2026-10-12',
    changes: [
      'Online change holds the PLC for no more than a scan: with core 1.7.1 on the board the switch no longer stops every task for ~0.4 s while the retained variables are re-attached (measured with Cubotonic on the MCM20.1). The PLC appliance is brought up to core 1.7.1 at the next start.',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-10-12',
    changes: [
      'Online change (Build options, while logged in): the board replaces its running program with the new build at a scan boundary, without stopping -- no output drop, no fieldbus restart. Every variable keeps its value (new ones start at their initial value), running timers and edge detectors included; the Suite then logs in to the new program by itself. Refused, with the old program running on, when the tasks changed (a task added, removed, or its interval or priority) -- then use Build and upload. Needs core 1.7.0 on the board.',
      'The ST compiler keeps a library block\'s internal state (a timer\'s start time, an edge detector\'s memory) in the program\'s variable map, hidden from the variable tree, so an online change can carry it.',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-10-12',
    changes: [
      'Login (was Debugger): connects to the running program without a download whenever it is this project, release build or debug build, and shows the live values. Breakpoints are on when the board runs this project\'s debug build; otherwise the console says why they are off. Only a different program asks for a download.',
      'While logged in, any change to the project lights Build/Upload: the PLC runs an older program than the one on screen until it is uploaded.',
      'A list as the initial value of one value -- 116,5 typed for 116.5 in a REAL -- is one error at that variable, with the fix ("write 116.5"). It used to pass the ST compiler and break every C++ file of the program at once.',
      'Faster uploads: the board is reached over one ssh connection for the whole upload instead of about fifteen (each cost the board ~0.7 s), and only the files that changed are compiled again (an upload of an unchanged program compiles in 0.2 s instead of 6.6 s; a resource value change compiles one file).',
    ],
  },
  {
    version: '1.7.2',
    date: '2026-10-12',
    changes: [
      'The Suite\'s runtime only compiles and uploads: it starts no PLC runtime on this PC, so no 10 ms cycle, no plugins and no port 502 here -- a program runs only on the board. (An older runtime of this PC ran a copy of the program next to the one on the board, which could starve the PC and cost the connection to the board.)',
      'An older runtime appliance is brought up to this Suite\'s version the next time the Suite starts, with its settings (board address, plugin lists) kept. The installer used to leave an existing appliance as it was.',
    ],
  },
  {
    version: '1.7.1',
    date: '2026-10-12',
    changes: [
      'The OpenPLC Suite opens full-screen (F11 leaves it).',
      'Global variables: the group buttons are filters. Pressing one or more shows only the variables of those groups, and a pressed button is plainly lit (it used to hide the group and dim the button). "Remove all filters" shows everything again.',
      'The runtime\'s default login is now "robotek": the Suite moves an appliance that still has the old "openplc" account over the next time it starts.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-10-11',
    changes: [
      'One board: the "Local (this PC)" board is gone, programs go to the MCM20.1. Without a board a program still compiles on this PC; to rehearse it without the machine\'s hardware, use SIM mode in RoboStudio RT 1.2.0.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-10-10',
    changes: [
      'A PROGRAM may call another PROGRAM, as in CODESYS: the called program is its own single instance, published under its name (ALARMS.count). Refused, with a compile error: a called program that also runs on a task, and one with located variables.',
      'A called PROGRAM\'s VAR RETAIN variables are retained under the program\'s name (MAINTENANCE.LubricationStartTime).',
      'Programs build 4-5 times faster (Cubotonic for the MCM20.1: 24 s -> 5 s; the program file 5.9 MB -> 1 MB), and an MCM20.1 upload no longer also builds and starts a copy of the program on this PC.',
      'An MCM20.1 upload moves a retained value to the new name a variable got (INSTANCE0.X_INST.v -> X.v when a POU became a PROGRAM again), so counters and calibrations keep their values; the board keeps the file as it was in persist/retain.json.before-rename.',
      'OpenPLC Suite starts with no console window.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-10-07',
    changes: [
      'Installer: the OpenPLC Runtime + ARM9 toolchain also installs on an older Windows 10 (before 2004, e.g. LTSC 2019 on industrial PCs), which has WSL 1 only. Setup switches on WSL 1 (one UAC prompt, then a restart) and the appliance is registered the way WSL 1 distributions install; before, it tried wsl --install, which that Windows does not have.',
    ],
  },
  {
    version: '1.4.2',
    date: '2026-10-07',
    changes: [
      'An upload to the MCM20.1 also sends the program\'s variable map compressed (about 1 MB -> 50 KB) and its auto-publish map, or removes them: the board (core 1.3.0) serves them to the HMI and RoboStudio, so no PC needs a copy of the project.',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-10-06',
    changes: [
      'MCM20.1: the editor shows the board\'s real PLC state, read from the board\'s Modbus port without logging in: Stop while it runs, Start/Debug while it is stopped, UNKNOWN when the board cannot be reached.',
      'MCM20.1: Start and Stop act on the board\'s PLC, with the board password of this connection (still kept in memory only, never saved). Boot autostart stays in RoboStudio.',
      'MCM20.1: uploading to a running PLC asks once; the upload stops the PLC, loads the new program and starts it again.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-10-06',
    changes: [
      'Shared-memory link between the PLC and RoboCNC on the board: the PLC runs at 100 Hz beside 1 kHz EtherCAT.',
      'RoboCard I/O is exchanged once per PLC scan (bus.sync_to_scan, the IEC 61131-3 process image), with a 5 ms reply timeout and predictive receive.',
      'Per-card window bases (di/do/ai/ao_base) in robocard_config.json; the card protocol is built from the robocard repository.',
      'Retained variables: POU-level VAR RETAIN and the per-global Retain flag both reach retain-names.json.',
      'Debugger: attach to a debug build already running on the board; debug uploads by default; a program load starts with no breakpoints.',
      'On the board the PLC starts only after RoboCNC is serving; a full deploy also ships robocard_tool and program.st.',
      'Fixed: a scan that ended late lost its %Q writes (outputs stayed set).',
      'Fixed: global and program ARRAY initializers compiled to zeros; IEC counters; POUs with no interface.',
      'Fixed: the :502 slave now drops clients that vanished (keepalive), so ghost connections no longer fill its 4 slots.',
      'An upload sends only the PLC program (with its debug map, retained-variable names and source). The PLC runtime on the board is installed by the SD-Card Creator, the PLC configuration by RoboStudio; an upload to a board without them stops and says which tool to use.',
      'MCM20.1 board settings: a Board Password field under the IP address. You type the board\'s root password to connect; it is kept in memory for that connection only (never saved in the project or anywhere else) and its sole use is uploading. A wrong one is reported as refused.',
      'After an upload the PLC is started again only if it was running before; boot autostart is RoboStudio\'s switch and is never changed by an upload.',
    ],
  },
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
