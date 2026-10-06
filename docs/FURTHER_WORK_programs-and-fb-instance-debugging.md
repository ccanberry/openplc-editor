> **Status: further work, not implemented** (planned 2026-10-06). Code references are to the
> commits of that day: STruC++ `feature/debug-checkpoints`, openplc-runtime core 1.2.0 (`a90533d`),
> this editor at `4f3a9da`. Re-check line numbers before starting.

# Further work: PROGRAMs back in the Cubotonic PLC + CODESYS V2 FB instance debugging

## Context

Two questions from the user, both answered with "do it the CODESYS way":

1. **Why is everything an FB?** The original `contahmi.pro` (CODESYS V2) has **26 PROGRAMs** and only
   5 FUNCTION_BLOCKs. The port (`workspace/CONTAHMI/docs/MIGRATION.md` §2) converted 23 PROGRAMs to
   FBs with global `X_inst` singletons, because matiec/STruC++ refused a PROGRAM calling a PROGRAM
   (strict IEC: only a task runs a PROGRAM). PLC_PRG calls several of them **conditionally**
   (`IF FactorySettings THEN FACTORY_SETTINGS_inst(); END_IF`), so moving each onto a task is not
   possible. **Decision:** teach STruC++ the CODESYS rule and restore the PROGRAMs.
2. **FB debugging.** Today a breakpoint in FB code halts on *every* instance (the hook only gets a
   checkpoint id, `plc_dbg_checkpoint(uint32_t)`), and the breadcrumb instance dropdown
   (`frontend/utils/debugger-session.ts` `buildFbInstanceMap`) lists only FBs declared directly in a
   PROGRAM: no arrays, no nesting. There is no "code or instance?" prompt. The design doc planned
   this (DEBUGGER_DESIGN.md §8.4, milestone M3) but it was never built. **Decision:** CODESYS V2
   exactly. Opening an FB while debugging asks *Implementation or Instance*. Instance opens a picker
   of every instance path, including nested FBs and each array element, and that tab shows that
   instance's values and its breakpoints halt that instance only. Implementation shows no values and
   its breakpoints halt every instance.

The board is wiped (`/home/root` empty) and the user wants to start from scratch. These changes
produce **core 1.3.0** and **Suite 1.5.0**; the from-scratch run should use them.

## Part A — PROGRAM calls PROGRAM (STruC++ fork `ccanberry/STruCpp`, branch feature/debug-checkpoints)

- **Semantic** (`src/semantic/analyzer.ts`): accept a call whose name resolves to a `program`
  symbol, from a PROGRAM or FB body, with FB-style named and positional parameters. Accept
  `PRG.var` access, which `checkInstanceAccess` now rejects for the "program" noun.
  - Error when a called PROGRAM is instantiated more than once in the configuration.
  - Error when a called PROGRAM declares located variables, because the runtime copies in/out
    per task program (`task->programs[p]->located_range`). The port keeps I/O in VAR_GLOBAL already.
- **Codegen** (`src/backend/codegen.ts`): one instance per called PROGRAM (CODESYS: the POU *is* its
  instance).
  - If a task instantiates that PROGRAM, reuse that instance. Otherwise emit a hidden member
    `Program_X X;` in the configuration, initialised like task instances (external refs, see
    `collectProgramInstances` ~L2848/2899).
  - A call emits `X.run()` through `emitPOUCallLine` (L5687) with the same parameter and EN/ENO
    path as FB calls (L5495–5525).
- **Debug table** (`src/backend/debug-table-gen.ts`, walk at L474–516): add the hidden instances
  under the bare path `X.<VAR>`, so the debugger tree, `retain-names.json` and watch all see
  `ALARMS.x`.
- Targeted tests: a call, a conditional call, var access, the double-instance error and the
  located-var error. Run only the new test files, not the whole suite (9p mount).
- Rebuild the editor's vendored strucpp tgz, as was done for the array-initializer fix.

### A2 — Cubotonic project (`workspace/Cubotonic`)
- In the 23 converted POUs, change `FUNCTION_BLOCK X` / `END_FUNCTION_BLOCK` to `PROGRAM` /
  `END_PROGRAM` and move them `pous/function-blocks/` → `pous/programs/`.
  - `OSZILLATOR_FB` stays an FB, as in the original.
  - Update `project.json` to match (POU types).
- `pous/programs/PLC_PRG.st`: delete the 24 `X_inst : X;` declarations (L121–144) and change
  `X_inst()` to `X()`. Also change every `X_inst.` reference in any POU (HMI_MIRROR, …) to `X.`.
- `workspace/CONTAHMI/tools/port_bodies.py` (the generator) stops converting PROGRAM→FB, so a
  regeneration can't undo this. Update `MIGRATION.md` §2.
- Retained-variable paths change (`PLC_PRG.X_INST.v` → `X.v`). The board was just wiped, so there is
  nothing to migrate; this goes in the changelog.
- Check `conf/hmi_map.json` and the HMI for any `_inst` path. Published variables are GVL globals,
  so none are expected.

## Part B — FB instance debugging

### B1 — STruC++
- **Checkpoints:** inside FB bodies and FB methods emit
  `::strucpp::debug::checkpoint_inst(id, this)` (codegen L3094); elsewhere keep `checkpoint(id)`.
- **`runtime/include/debug_hook.hpp`:**
  - add a second hook `void(*)(uint32_t, const void*)` and the export `strucpp_set_debug_hook_inst`;
  - `checkpoint_inst` falls back to the plain hook when that one isn't installed, so new programs
    still run on core 1.2.0, with breakpoints acting on all instances.
- **Instance registry** from the debug-table walk (FB branch ~L353): every user-FB instance
  (globals, PROGRAM vars, nested FB members, every array element) records path, FB type and `&expr`.
  - Emit `strucpp_debug_fb_instance_count()` / `strucpp_debug_fb_instance_ptr(i)`.
  - Add `fbInstances: [{index, path, fbType}]` to debug-map.json and include it in the fingerprint.

### B2 — openplc-runtime (core 1.3.0)
- **`image_tables.cpp`:** resolve the optional symbols, install `plc_dbg_checkpoint_inst`, and hand
  the pointer table to plc_debug_control.
- **`plc_debug_control.cpp/.h`:**
  - breakpoints map `id → all | set<const void*>`; `checkpoint_inst` matches the instance;
  - record the stopped instance (reverse lookup pointer → index);
  - the whole-application halt from core 1.2.0 is unchanged.
- **`debug_handler.c`:**
  - new FC **0x4C SET_BKPTS_INST**: `u16 count`, then `count × [id u32][inst u32]` (BE),
    `0xFFFFFFFF` = all instances;
  - **STOPINFO** appends `[inst u32]` at bytes 16–19 and flag b3 "instance table present". Older
    debuggers read only the first 16 bytes; 0x46 stays.
- Extend the scratch standalone test (two fake instance pointers):
  - an instance breakpoint halts only for its own pointer;
  - an all-instances breakpoint halts for both;
  - STOPINFO reports the right instance.
- **Docs:** DEBUGGER_DESIGN.md decisions §12.2 (now a whole-application halt) and §8.4 (built);
  DEBUG_PROTOCOL.md (0x4C, STOPINFO).

### B3 — OpenPLC Editor (fork `ccanberry/openplc-editor`)
- **Instance list from the debug map's `fbInstances`:** this replaces the program-only scan in
  `buildFbInstanceMap` (`frontend/utils/debugger-session.ts:243`), so nested FBs and array elements
  appear. The key is the instance path.
- **Prompt:** opening or activating an FB tab while the debugger is attached asks *Implementation /
  Instance*.
  - **Instance** opens a picker listing that FB type's instance paths, with array elements expanded
    (`PLC_PRG.Valves[3]`) and a filter box.
  - The choice is kept per tab for the session. The breadcrumb (`_molecules/breadcrumbs`) shows
    "Implementation" or the path, and a click on it changes the choice.
- **Implementation view:** no live values. Its breakpoints apply to all instances.
- **Instance view:** that instance's values, through the existing `fbSelectedInstance` path in
  `debug-polling-filter.ts` / `use-debug-composite-key.ts`. Its breakpoints apply to that instance
  only and are drawn distinctly, with the path in the tooltip.
- **Breakpoints:**
  - stored as `{pou, line, instancePath | null}`;
  - sent with 0x4C when the core has the instance table (STOPINFO b3);
  - otherwise sent with 0x46, with a console warning that instance breakpoints act on all instances
    on this core.
- **Stop inside an FB:** open that FB's tab in the instance view of the instance that stopped
  (STOPINFO instance → path), with the current line marked.
- Suite **1.5.0** changelog (`frontend/data/changelog.ts`, `openplc-suite.iss`).

## Release (same route as core 1.2.0)
1. Commit and push each repository. openplc-runtime goes to `robotek` only; STruC++ and the editor
   go to the `ccanberry` forks.
2. Core: set `CORE_VERSION` 1.3.0 and add the `CORE_CHANGELOG` entry, run `build-arm9.sh`, then
   `stage-firmware.sh` (release gate), then `tag-release.sh`, and push the tags.
3. Update the appliance in place (`update-appliance.sh`) and delete its backup.
4. Rebuild the installers: SD-Card Creator, then `build-editor.sh`, `build-appliance.sh` and the
   Suite ISCC. Delete the old installers and install the new ones on this PC.
5. The board stays wiped for the user's from-scratch run (network update → RoboStudio → editor →
   autostart → HMI).

## Verification
- STruC++ targeted tests (A and B1) pass. The Cubotonic project compiles in the appliance with no
  `_inst` left. `retain-names.json` and the debug map show `ALARMS.x`-style paths.
- Runtime standalone run-control test passes (instance and all-instances cases, STOPINFO instance).
- **On the board, after the user's network update**, the PLC runs with the same scan rate and
  behaviour as before:
  - the HMI shows the same values;
  - start-up works: E-stop release, then System Reset to clear errors and enable, then homing.
- **Debugger on the board:**
  - a breakpoint in a restored PROGRAM halts the whole PLC (the card-bus exchange counter in the
    robocard stats freezes) and Continue resumes it;
  - an FB tab asks Implementation/Instance;
  - an instance breakpoint in `OSZILLATOR_FB` halts only that instance;
  - an Implementation breakpoint halts any instance;
  - stopping inside an FB opens the right instance; Step works.
