/**
 * Auto-publish compile step.
 *
 * Runs BEFORE ST transpilation. Scans the project's global variables
 * for the `publish` flag, assigns each flagged variable a Modbus
 * `%QW` holding register through the shared `hmi-publish` allocator
 * (window base `%QW512`, persisted assignments honoured as pins), and
 * rewrites the IN-MEMORY project model so the rest of the pipeline
 * emits everything unchanged:
 *
 *   - 16-bit types (BOOL/BYTE/SINT/USINT/INT/UINT/WORD) get their
 *     assigned register written into `variable.location`, so the
 *     configuration emitter produces `AT %QWn` and the point is
 *     naturally read-write over Modbus.
 *
 *   - 32-bit types (REAL/DINT/DWORD/UDINT) cannot sit at a single
 *     `%QW`, so the step injects a synthetic hybrid C++ function
 *     block (`__HMI_PUB_GLUE`, compiled through the standard
 *     c_blocks pipeline) that packs each value bit-exact into a
 *     lo/hi word pair via `memcpy`, plus a synthetic ST program
 *     (`__HMI_PUBLISH`) that declares the located pair words
 *     (`AT %QWn` / `%QWn+1`, LOW word first — RoboCNC convention),
 *     wires value → glue → located words every scan, and a dedicated
 *     100 ms cyclic task + instance. Read-only in v1.
 *
 * NOTHING synthetic is ever saved into the user's project files —
 * the transformation happens on the compile snapshot only. Projects
 * with no published globals pass through untouched (identity).
 */

import type { HmiPublishPoint } from '../../../../middleware/shared/utils/hmi-publish'
import { allocateHmiPublish, classifyPublishType } from '../../../../middleware/shared/utils/hmi-publish'
import type { PLCProjectData } from '../../types/PLC/open-plc'

/** Names claimed by the synthetic POUs / resource objects. `__`
 *  prefixes are accepted by STruC++ and effectively impossible to
 *  collide with user identifiers; an actual collision is reported as
 *  a compile error rather than silently merged. */
export const HMI_PUBLISH_GLUE_FB = '__HMI_PUB_GLUE'
export const HMI_PUBLISH_PROGRAM = '__HMI_PUBLISH'
export const HMI_PUBLISH_TASK = 'task_hmi_pub'
export const HMI_PUBLISH_INSTANCE = 'inst_hmi_pub'

type CppPouSidecar = { name: string; code: string; variables: unknown[] }

/** Schema-shape project data + the C/C++ sidecar the pipeline carries. */
export type PublishProjectData = PLCProjectData & { originalCppPous?: CppPouSidecar[] }

export interface PreparePublishedGlobalsResult {
  /** Transformed compile snapshot (the INPUT object when the project
   *  publishes nothing — identity fast path). */
  projectData: PublishProjectData
  /** True when at least one global carries the publish flag. */
  hasPublishes: boolean
  /** Fatal problems — the pipeline must bail before transpiling. */
  errors: string[]
  /** Non-fatal diagnostics to surface in the build log. */
  warnings: string[]
  /** `name → %QW<n>` (LOW word for pairs) for every published var. */
  assignments: Record<string, string>
  /** `hmi_map.json` points in declaration order. */
  points: HmiPublishPoint[]
  windowBase: number
  windowCount: number
}

type SchemaGlobalVariable = PLCProjectData['configuration']['resource']['globalVariables'][number]
type SchemaPou = PLCProjectData['pous'][number]

interface PairVar {
  variable: SchemaGlobalVariable
  /** Pin index inside the glue FB (`IN_<i>` / `LO_<i>` / `HI_<i>`). */
  index: number
  /** LOW-word register; high word is `register + 1`. */
  register: number
  /** Uppercase IEC type name (REAL / DINT / DWORD / UDINT). */
  typeName: string
}

export function preparePublishedGlobals(input: PublishProjectData): PreparePublishedGlobalsResult {
  const globals = input.configuration?.resource?.globalVariables ?? []
  const published = globals.filter((v) => v.publish === true && v.name)
  if (published.length === 0) {
    return {
      projectData: input,
      hasPublishes: false,
      errors: [],
      warnings: [],
      assignments: {},
      points: [],
      windowBase: 0,
      windowCount: 0,
    }
  }

  const allocation = allocateHmiPublish(globals, input.hmiPublish?.assignments ?? {})
  const errors = [...allocation.errors]
  const warnings = [...allocation.warnings]

  // Split published vars into direct-located words and glue pairs.
  const pairVars: PairVar[] = []
  for (const variable of published) {
    const cls = classifyPublishType(variable.type)
    if (cls?.kind === 'pair-lo-first') {
      const assigned = allocation.assignments[variable.name]
      /* istanbul ignore next -- defensive: allocation errors already bail below */
      const register = assigned ? Number(/^%QW(\d+)$/.exec(assigned)?.[1] ?? -1) : -1
      pairVars.push({
        variable,
        index: pairVars.length,
        register,
        typeName: variable.type.value.toUpperCase(),
      })
    }
  }

  // Collision guard for the synthetic names — vanishingly unlikely,
  // but silently shadowing a user POU would corrupt their program.
  if (pairVars.length > 0) {
    for (const pou of input.pous ?? []) {
      if (pou.data.name === HMI_PUBLISH_GLUE_FB || pou.data.name === HMI_PUBLISH_PROGRAM) {
        errors.push(
          `Auto-publish: POU name "${pou.data.name}" is reserved for the generated publish glue. Rename the POU.`,
        )
      }
    }
    for (const task of input.configuration.resource.tasks ?? []) {
      if (task.name === HMI_PUBLISH_TASK) {
        errors.push(
          `Auto-publish: task name "${HMI_PUBLISH_TASK}" is reserved for the generated publish task. Rename the task.`,
        )
      }
    }
    for (const instance of input.configuration.resource.instances ?? []) {
      if (instance.name === HMI_PUBLISH_INSTANCE) {
        errors.push(
          `Auto-publish: instance name "${HMI_PUBLISH_INSTANCE}" is reserved for the generated publish instance. Rename the instance.`,
        )
      }
    }
  }

  if (errors.length > 0) {
    return {
      projectData: input,
      hasPublishes: true,
      errors,
      warnings,
      assignments: {},
      points: [],
      windowBase: allocation.windowBase,
      windowCount: 0,
    }
  }

  // Rewrite globals IN MEMORY: direct words get `AT %QWn`; pair vars
  // get their location STRIPPED (a 32-bit value cannot sit at a %QW —
  // any literal the user typed served as the pair's pinned register).
  const pairNames = new Set(pairVars.map((p) => p.variable.name))
  const rewrittenGlobals = globals.map((variable) => {
    if (variable.publish !== true || !variable.name) return variable
    if (pairNames.has(variable.name)) {
      return variable.location ? { ...variable, location: '' } : variable
    }
    return { ...variable, location: allocation.assignments[variable.name] }
  })

  const pous = [...(input.pous ?? [])]
  const tasks = [...(input.configuration.resource.tasks ?? [])]
  const instances = [...(input.configuration.resource.instances ?? [])]
  const originalCppPous = [...(input.originalCppPous ?? [])]

  if (pairVars.length > 0) {
    pous.push(buildGlueFbStubPou(pairVars), buildPublishProgramPou(pairVars))
    originalCppPous.push(buildGlueCppSidecar(pairVars))
    tasks.push({ name: HMI_PUBLISH_TASK, triggering: 'Cyclic', interval: 'T#100ms', priority: 10 })
    instances.push({ name: HMI_PUBLISH_INSTANCE, task: HMI_PUBLISH_TASK, program: HMI_PUBLISH_PROGRAM })
  }

  const projectData: PublishProjectData = {
    ...input,
    pous,
    configuration: {
      ...input.configuration,
      resource: {
        ...input.configuration.resource,
        tasks,
        instances,
        globalVariables: rewrittenGlobals,
      },
    },
    originalCppPous,
  }

  return {
    projectData,
    hasPublishes: true,
    errors,
    warnings,
    assignments: allocation.assignments,
    points: allocation.points,
    windowBase: allocation.windowBase,
    windowCount: allocation.windowCount,
  }
}

/* ────────────────────── synthetic POU builders ─────────────────────────── */

/** Glue FB pin descriptors, shared by the ST stub and the C++ sidecar. */
function gluePins(pairVars: PairVar[]): {
  inputs: Array<{ name: string; typeName: string }>
  outputs: Array<{ name: string }>
} {
  return {
    inputs: pairVars.map((p) => ({ name: `IN_${p.index}`, typeName: p.typeName })),
    outputs: pairVars.flatMap((p) => [{ name: `LO_${p.index}` }, { name: `HI_${p.index}` }]),
  }
}

/**
 * ST stub for the hybrid C++ FB — same shape `generateSTCode`
 * (frontend/utils/cpp) produces for user C++ POUs: an `{external}`
 * block declaring the pin struct + pointer wiring, a one-shot setup
 * call, and the per-scan loop call. STruC++ pastes the `{external}`
 * bodies verbatim into the generated C++.
 */
function buildGlueFbStubPou(pairVars: PairVar[]): SchemaPou {
  const { inputs, outputs } = gluePins(pairVars)
  const structName = `${HMI_PUBLISH_GLUE_FB.toUpperCase()}_VARS`
  const setupName = `${HMI_PUBLISH_GLUE_FB.toLowerCase()}_setup`
  const loopName = `${HMI_PUBLISH_GLUE_FB.toLowerCase()}_loop`

  const assignments = [...inputs, ...outputs].map((pin) => `vars.${pin.name} = &${pin.name};\n`).join('')
  const body = `{external
${structName} vars;
${assignments}}
if hasBeenInitialized = False then
{external
${setupName}(&vars);
}
hasBeenInitialized := True;
end_if;
{external
${loopName}(&vars);
}`

  const variables: SchemaPou['data']['variables'] = [
    ...inputs.map((pin) => ({
      name: pin.name,
      class: 'input' as const,
      type: { definition: 'base-type' as const, value: pin.typeName as never },
      location: '',
      documentation: '',
    })),
    ...outputs.map((pin) => ({
      name: pin.name,
      class: 'output' as const,
      type: { definition: 'base-type' as const, value: 'WORD' as never },
      location: '',
      documentation: '',
    })),
    {
      name: 'hasBeenInitialized',
      class: 'local' as const,
      type: { definition: 'base-type' as const, value: 'BOOL' as never },
      location: '',
      documentation: '',
    },
  ]

  return {
    type: 'function-block',
    data: {
      language: 'st',
      name: HMI_PUBLISH_GLUE_FB,
      variables,
      body: { language: 'st', value: body },
      documentation: 'Auto-generated publish glue (bit-exact 32-bit to word-pair packing).',
    },
  }
}

/**
 * Synthetic publish program: imports each 32-bit published global via
 * VAR_EXTERNAL, declares the located pair words, and mirrors value →
 * glue → words every scan of the publish task.
 */
function buildPublishProgramPou(pairVars: PairVar[]): SchemaPou {
  const variables: SchemaPou['data']['variables'] = [
    ...pairVars.map((p) => ({
      name: p.variable.name,
      class: 'external' as const,
      type: p.variable.type,
      location: '',
      documentation: '',
    })),
    {
      name: '__hmi_glue',
      class: 'local' as const,
      type: { definition: 'derived' as const, value: HMI_PUBLISH_GLUE_FB },
      location: '',
      documentation: '',
    },
    ...pairVars.flatMap((p) => [
      {
        name: `__hmi_pub_${p.index}_lo`,
        class: 'local' as const,
        type: { definition: 'base-type' as const, value: 'WORD' as never },
        location: `%QW${p.register}`,
        documentation: '',
      },
      {
        name: `__hmi_pub_${p.index}_hi`,
        class: 'local' as const,
        type: { definition: 'base-type' as const, value: 'WORD' as never },
        location: `%QW${p.register + 1}`,
        documentation: '',
      },
    ]),
  ]

  const callArgs = pairVars.map((p) => `IN_${p.index} := ${p.variable.name}`).join(', ')
  const bodyLines = [`__hmi_glue(${callArgs});`]
  for (const p of pairVars) {
    bodyLines.push(`__hmi_pub_${p.index}_lo := __hmi_glue.LO_${p.index};`)
    bodyLines.push(`__hmi_pub_${p.index}_hi := __hmi_glue.HI_${p.index};`)
  }

  return {
    type: 'program',
    data: {
      language: 'st',
      name: HMI_PUBLISH_PROGRAM,
      variables,
      body: { language: 'st', value: bodyLines.join('\n') },
      documentation: 'Auto-generated publish mirror for 32-bit published globals.',
    },
  }
}

/**
 * C++ sidecar for the glue FB — flows through `buildCBlocksFromPous`
 * exactly like a user C++ POU: `generateCBlocksHeader` emits the
 * `__HMI_PUB_GLUE_VARS` struct, `generateCBlocksCode` renames
 * setup()/loop() and #defines each pin to `(*(vars-><PIN>))`.
 * `memcpy` gives the bit-exact REAL packing (`<cstring>` is part of
 * the c_blocks baseline). LOW word first — RoboCNC convention.
 */
function buildGlueCppSidecar(pairVars: PairVar[]): CppPouSidecar {
  const { inputs, outputs } = gluePins(pairVars)

  const packBlocks = pairVars.map((p) => {
    const lines: string[] = [`  { // ${p.variable.name} : ${p.typeName}`]
    if (p.typeName === 'REAL') {
      lines.push(`    float value = IN_${p.index};`)
      lines.push('    uint32_t bits;')
      lines.push('    memcpy(&bits, &value, sizeof(bits));')
    } else if (p.typeName === 'DINT') {
      lines.push(`    int32_t value = IN_${p.index};`)
      lines.push('    uint32_t bits = (uint32_t)value;')
    } else {
      lines.push(`    uint32_t bits = IN_${p.index};`)
    }
    lines.push(`    LO_${p.index} = (uint16_t)(bits & 0xFFFFu);`)
    lines.push(`    HI_${p.index} = (uint16_t)(bits >> 16);`)
    lines.push('  }')
    return lines.join('\n')
  })

  const code = `// Auto-generated by the auto-publish compile step. Not saved into the project.
void setup()
{
}

void loop()
{
${packBlocks.join('\n')}
}
`

  const variables = [
    ...inputs.map((pin) => ({
      name: pin.name,
      class: 'input',
      type: { definition: 'base-type', value: pin.typeName },
      location: '',
      documentation: '',
    })),
    ...outputs.map((pin) => ({
      name: pin.name,
      class: 'output',
      type: { definition: 'base-type', value: 'WORD' },
      location: '',
      documentation: '',
    })),
  ]

  return { name: HMI_PUBLISH_GLUE_FB, code, variables }
}
