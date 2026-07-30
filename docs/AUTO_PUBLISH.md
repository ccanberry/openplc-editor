# Auto-Publish: Resources + Automatic Memory Arrangement

CoDeSys-style project globals for OpenPLC Editor: global variables can
be grouped into named GVLs and flagged **Publish**. Published variables
get their Modbus `:502` holding registers assigned **automatically at
compile time**, and the build emits a `conf/hmi_map.json` symbol file
so HMIs bind points **by name** instead of hardcoding register numbers.

Zero openplc-runtime changes, zero STruC++ changes — everything happens
in the editor's compile pipeline on an in-memory snapshot of the
project. Nothing synthetic is ever written into the user's project
files.

## The register contract

|              |                                                                                                                                                                                                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Window base  | `%QW512` (`HMI_PUBLISH_WINDOW_BASE` in `src/middleware/shared/utils/hmi-publish/allocate.ts`)                                                                                                                                                                                                   |
| Why 512      | Hardware windows claim low `%QW` space (robocard claims `%QW100+`); the publish window can never collide with them                                                                                                                                                                              |
| 16-bit types | `BOOL`, `BYTE`, `SINT`, `USINT`, `INT`, `UINT`, `WORD` — one `%QW` each, located directly on the global (`AT %QWn`), **read-write** over Modbus. `BOOL` takes a whole register (value 0/1) — simplest layout, every point stays word-addressable                                                |
| 32-bit types | `REAL`, `DINT`, `DWORD`, `UDINT` — two **consecutive** registers, **LOW word first** (RoboCNC convention), packed bit-exact, **read-only** in v1                                                                                                                                                |
| Unsupported  | `LREAL`, `LINT`, `ULINT`, `LWORD`, `STRING`, `WSTRING`, time types, arrays, user types — clear compile error                                                                                                                                                                                    |
| Manual pins  | A literal `%QW<n>` typed into a published variable's Location is honoured verbatim (for a 32-bit type it pins the pair's LOW register). Pins below `%QW512` compile with a hardware-collision warning. Any other location (alias, `%QX`, `%IW`, ...) on a published variable is a compile error |

### `conf/hmi_map.json`

Emitted into the Runtime v4 upload bundle next to the other
`conf/*.json` files, only when the project publishes at least one
variable:

```json
{
  "md5": "2b20c4fb9e190c6a9531132560f183a2",
  "window": { "base": 512, "count": 4 },
  "points": [
    {
      "name": "pub_counter",
      "group": "Counters",
      "register": 512,
      "type": "INT",
      "kind": "word",
      "access": "rw",
      "scale": null
    },
    {
      "name": "pub_speed",
      "group": "Axis",
      "register": 513,
      "type": "REAL",
      "kind": "pair-lo-first",
      "access": "ro",
      "scale": null
    }
  ]
}
```

- `md5` is the **same PROGRAM_MD5** as `debug-map.json` / `defines.h`
  (the value the runtime reports through the debug protocol's FC 0x45
  DEBUG_GET_MD5 query). An HMI should verify it against the running
  program before trusting the map — a stale map means stale registers.
- `window.count` covers the registers used from `base` up to the
  highest in-window point (pins below the base are excluded).
- `register` is the Modbus holding-register number (`%QW<register>`).
  For `pair-lo-first` points the value is `lo + (hi << 16)` with
  `hi = register + 1`; `REAL` is the IEEE-754 bit pattern of that
  32-bit word (bit-exact — pack the two words back and reinterpret).
- `scale` is reserved (always `null` today).

### How a REAL becomes two registers

The compile step injects, in memory only:

- `__HMI_PUB_GLUE` — a hybrid C++ function block (compiled through the
  standard `c_blocks` pipeline) with one `IN_<i>` input and a
  `LO_<i>` / `HI_<i>` word-pair output per 32-bit published variable.
  `REAL` packs via `memcpy` (bit-exact); `DINT` / `DWORD` / `UDINT` cast.
- `__HMI_PUBLISH` — an ST program that imports each 32-bit global via
  `VAR_EXTERNAL`, declares the located pair words
  (`AT %QWn` / `AT %QWn+1`), and wires value → glue → words each scan.
- `task_hmi_pub` — a dedicated 100 ms cyclic task (priority 10) with
  instance `inst_hmi_pub` running the mirror program.

Word-only projects skip all of that — the only transformation is the
in-memory `AT %QWn` on each published 16-bit global. The names above
are reserved; a user POU/task/instance with the same name is a compile
error.

## UI usage

Open **Resource → Global Variables**:

- **Publish** column — toggle per variable (transfer icon). Muted =
  not published.
- **Group** column — free-text GVL label with a dropdown of the groups
  already in use. Empty = group `Global`. Storage stays one flat
  array; the group is a per-variable tag, so old projects load
  unchanged.
- When more than one group exists, a header strip above the table
  shows each group with its variable count; clicking a group collapses
  or expands its rows.
- The table/code toggle round-trips publish + group: the IEC code view
  cannot express them, so they are preserved by merging on variable
  name when the code view is committed.

Compile output lists the allocation
(`Auto-publish: N variable(s) mapped at %QW512+ ...`) plus any
warnings (pin collisions, pins below the window, a Modbus slave
`qw_count` too small to expose the window — note the default buffer of
1024 already covers `%QW512+`).

## Stability guarantees

Assignments are persisted in `project.json` under a dedicated section:

```json
"hmiPublish": { "assignments": { "pub_counter": "%QW512", "pub_speed": "%QW513" } }
```

- The map is recomputed by the shared allocator
  (`src/middleware/shared/utils/hmi-publish/`) with the stored map fed
  back as **pinned** registers — allocation is deterministic and
  idempotent, so re-running never moves anything.
- The store refreshes the map before every build and every save
  (`projectActions.refreshHmiPublishAssignments`), so **deleting one
  published variable never renumbers the others across builds** —
  within a session and across sessions.
- Freed registers may be reused by NEW variables. That is safe by
  design: HMIs bind by name through `hmi_map.json` and verify `md5`.
- A variable that changes type from a word to a pair keeps its
  register when the neighbouring register is free; otherwise it is
  reallocated with a warning.
- Projects that publish nothing never get the section — their
  `project.json` stays byte-identical.

The allocator registers under the IEC address registry's consumer kind
`hmi-publish` (`iec-address/registry/types.ts`); it owns its own linear
scan because the registry has no pair or window-base concept, but it
reuses the registry's address parsing and mirrors its two-pass
pinned-then-lowest-free model.

## Extension points touched

- Schema: `publish` / `group` on `PLCVariableSchema`, `hmiPublish` on
  `PLCProjectDataSchema` (`src/backend/shared/types/PLC/open-plc.ts`) —
  all optional, legacy projects load and compile identically.
- Compile step: `src/backend/shared/compile/steps/allocate-published-globals.ts`,
  called from `runCompilePipeline` before ST transpilation.
- Emission: `generateRuntimeConfs` (`hmiMap` output) →
  `composeRuntimeV4Bundle` (`conf/hmi_map.json`).

## Phase 2 (not in v1)

- **Wide-type write-back** — HMI writes a register pair, the PLC
  global follows (needs a scan-coherent read-modify pass in the glue).
- **Runtime-side publish for unlocatable types** — `STRING`, `LREAL`,
  64-bit integers need a runtime symbol channel instead of `%QW`
  registers.
- **GVL block modifiers** — `CONSTANT` / `RETAIN` / `PERSISTENT` per
  group, plus group-level publish defaults.
- **Scaling** — the `scale` field is reserved for fixed-point export
  of engineering units.
