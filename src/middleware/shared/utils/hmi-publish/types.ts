/**
 * Auto-publish (HMI symbol window) — data model.
 *
 * A project global flagged `publish` claims one (16-bit types) or two
 * consecutive (32-bit types) `%QW` holding registers inside a reserved
 * window so HMIs can bind values by NAME through the generated
 * `conf/hmi_map.json` symbol file instead of hardcoding register
 * numbers. See `allocate.ts` for the allocation contract and
 * `docs/AUTO_PUBLISH.md` for the full feature description.
 */

/** How a published variable occupies the window.
 *  - `word`: one `%QW` register, value as-is (BOOL publishes 0/1).
 *  - `pair-lo-first`: two consecutive `%QW` registers, LOW word first
 *    (RoboCNC convention), packed bit-exact from the 32-bit value. */
export type HmiPublishKind = 'word' | 'pair-lo-first'

/** HMI access direction for a point. Direct-located 16-bit variables
 *  are naturally read-write over Modbus; 32-bit pairs are mirrored
 *  into the window each publish scan and therefore read-only (v1 —
 *  write-back is a phase-2 item). */
export type HmiPublishAccess = 'rw' | 'ro'

/** One published register (or register pair) in `hmi_map.json`. */
export interface HmiPublishPoint {
  /** Variable name — the HMI binding key. Unique among globals. */
  name: string
  /** GVL group label ("Global" when the variable has none). */
  group: string
  /** Modbus holding-register number (`%QW<register>`). For pairs this
   *  is the LOW word; the high word is `register + 1`. */
  register: number
  /** Declared IEC type (`INT`, `REAL`, ...). */
  type: string
  kind: HmiPublishKind
  access: HmiPublishAccess
  /** Reserved for future fixed-point scaling; always `null` today. */
  scale: null
}

/** Minimal variable slice the allocator reads — compatible with both
 *  the renderer's port-shape `PLCVariable` and the compile pipeline's
 *  schema-shape variable. */
export interface HmiPublishVariable {
  name: string
  type: { definition: string; value: string }
  location?: string
  publish?: boolean
  group?: string
}

export interface HmiPublishAllocation {
  /** `name → %QW<n>` for every published variable (LOW word for
   *  pairs). This is the map persisted in `project.json`'s
   *  `data.hmiPublish.assignments` and fed back as pinned on the next
   *  run — the stability contract. Empty when `errors` is non-empty. */
  assignments: Record<string, string>
  /** `hmi_map.json` points, in variable declaration order. */
  points: HmiPublishPoint[]
  /** Fatal problems (unsupported type, unusable manual location).
   *  A non-empty list must abort the compile. */
  errors: string[]
  /** Non-fatal diagnostics (pin collisions, pins below the window). */
  warnings: string[]
  /** First register of the reserved window. */
  windowBase: number
  /** Registers used from `windowBase` up to the highest point inside
   *  the window (0 when nothing landed inside the window). */
  windowCount: number
}

/** Serialized shape stored under `project.json` `data.hmiPublish`. */
export interface HmiPublishProjectSection {
  assignments: Record<string, string>
}
