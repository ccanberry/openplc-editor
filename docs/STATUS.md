# OpenPLC Editor — Status Snapshot (2026-07-30)

Point-in-time status of this repo after the CONTAHMI migration push of
2026-07-29/30 (full story: `workspace/CONTAHMI/docs/MIGRATION.md`). Split out of
the retired root `OPENPLC_STATUS.md` during the 2026-07-30 workspace
reorganisation; the runtime half lives in `openplc-runtime/docs/STATUS.md`.

**Last commit:** `fb9eb1d` docs(changelog): RoboCNC POU EN idiom, RCNC_CONNECT,
DRIVE_CONNECT_REQ — on top of the 1.0.9 on-board debug channel work
(`0877d16`) and the debug-deploy outcome fix (`ae79627`).

**UNCOMMITTED: the auto-publish feature (26 paths — 22 modified, 4 new).**
Implemented and green 2026-07-30, deliberately left uncommitted pending
Robotek review. Feature doc: `docs/AUTO_PUBLISH.md`. Summary:

- `publish` + `group` flags on resource globals (Publish toggle + Group column,
  collapsible GVL groups in the resource editor; old projects load unchanged).
- Compile step `allocate-published-globals.ts`: auto-assigns flagged globals
  into reserved window `%QW512+` (allocated last — never collides with the
  robocard `%QW100+` hardware windows). 16-bit types located directly (rw);
  REAL/DINT/DWORD/UDINT become bit-exact lo-word-first register pairs via an
  invisible compile-time glue POU on a 100 ms task (ro in v1);
  LREAL/LINT/STRING rejected with a compile error.
- `conf/hmi_map.json` in every runtime-v4 bundle (name → register/type/
  pair-kind/group/access + PROGRAM_MD5) — HMIs bind by name, verify md5.
- Address stability: assignments persisted as `data.hmiPublish.assignments`
  in project.json, fed back pinned each build (deleting a var never renumbers
  the rest — proven in E2E).
- Verification: all touched suites green (~735 tests incl. 55 new), tsc /
  eslint / validate:arch clean, E2E against real STruC++ on a scratch
  FULL_DEMO (generated AT %QW512+, glue POU, task, md5-matching map).
- Phase-2 (not built): wide-type write-back, publishing unlocatable/POU-local
  vars via the debug path, GVL block modifiers (CONSTANT/RETAIN per group).

**Editor status otherwise:** opens/validates `workspace/CONTAHMI`
(46/46 POUs, 0 fallbacks) and `workspace/ROBOCNC_LINK`. The compile +
deploy of CONTAHMI has NOT been run yet (Windows-editor gate). Known editor
facts that still hold: connect to runtime at :8443 (bare-host address,
self-signed accepted); ARM9 status proxy reflects the board's plcctl STATUS.

**Pending gates:**

1. Review + commit the auto-publish feature.
2. Open `workspace/CONTAHMI` in the Windows editor → build → deploy to the v4
   runtime (the TRAFFIC_DEMO deploy is the rehearsal for this gate).
3. After that lands: migrate CONTAHMI telemetry from hand-written HMI_MIRROR
   to Publish flags (command words with pulse/level semantics stay explicit);
   teach qt_hmi / web_hmi / debug-GUI to bind via hmi_map.json + md5.
