/**
 * Tests for the auto-publish compile step.
 *
 * Covers the in-memory project transformation contract: identity for
 * unpublished projects, direct `AT %QWn` rewriting for 16-bit types,
 * synthetic glue FB / mirror program / task / instance injection for
 * 32-bit pairs, reserved-name collision errors, and input purity (the
 * user's project snapshot must never be mutated).
 */

import type { PLCProjectData } from '../../types/PLC/open-plc'
import {
  HMI_PUBLISH_GLUE_FB,
  HMI_PUBLISH_INSTANCE,
  HMI_PUBLISH_PROGRAM,
  HMI_PUBLISH_TASK,
  preparePublishedGlobals,
  type PublishProjectData,
} from '../steps/allocate-published-globals'

type SchemaGlobal = PLCProjectData['configuration']['resource']['globalVariables'][number]

function globalVar(overrides: Partial<SchemaGlobal> & { name: string }): SchemaGlobal {
  return {
    type: { definition: 'base-type', value: 'INT' },
    location: '',
    documentation: '',
    ...overrides,
  } as SchemaGlobal
}

function project(globals: SchemaGlobal[], overrides?: Partial<PublishProjectData>): PublishProjectData {
  return {
    dataTypes: [],
    pous: [
      {
        type: 'program',
        data: {
          language: 'st',
          name: 'main0',
          variables: [],
          body: { language: 'st', value: 'counter := counter + 1;' },
          documentation: '',
        },
      },
    ],
    configuration: {
      resource: {
        tasks: [{ name: 'task0', triggering: 'Cyclic', interval: 'T#50ms', priority: 1 }],
        instances: [{ name: 'instance0', task: 'task0', program: 'main0' }],
        globalVariables: globals,
      },
    },
    libraries: [],
    ...overrides,
  } as PublishProjectData
}

describe('preparePublishedGlobals — identity fast path', () => {
  it('returns the input object untouched when nothing is published', () => {
    const input = project([globalVar({ name: 'A' })])
    const result = preparePublishedGlobals(input)
    expect(result.projectData).toBe(input)
    expect(result.hasPublishes).toBe(false)
    expect(result.errors).toEqual([])
    expect(result.points).toEqual([])
  })
})

describe('preparePublishedGlobals — direct 16-bit locate', () => {
  it('writes the assigned register into the global location in memory only', () => {
    const input = project([globalVar({ name: 'Counter', publish: true }), globalVar({ name: 'Plain' })])
    const result = preparePublishedGlobals(input)

    expect(result.errors).toEqual([])
    expect(result.assignments).toEqual({ Counter: '%QW512' })

    const globals = result.projectData.configuration.resource.globalVariables
    expect(globals.find((v) => v.name === 'Counter')?.location).toBe('%QW512')
    expect(globals.find((v) => v.name === 'Plain')?.location).toBe('')

    // Purity: the caller's snapshot is untouched.
    expect(input.configuration.resource.globalVariables.find((v) => v.name === 'Counter')?.location).toBe('')

    // No synthetic POUs / tasks for word-only publishes.
    expect(result.projectData.pous).toHaveLength(1)
    expect(result.projectData.configuration.resource.tasks).toHaveLength(1)
    expect(result.projectData.originalCppPous ?? []).toHaveLength(0)
  })

  it('keeps a user-pinned literal %QW location verbatim', () => {
    const input = project([globalVar({ name: 'Pinned', publish: true, location: '%QW700' })])
    const result = preparePublishedGlobals(input)
    expect(result.errors).toEqual([])
    expect(result.projectData.configuration.resource.globalVariables[0].location).toBe('%QW700')
    expect(result.points[0].register).toBe(700)
  })

  it('feeds persisted assignments back as pins', () => {
    const input = project([globalVar({ name: 'A', publish: true })], {
      hmiPublish: { assignments: { A: '%QW600' } },
    })
    const result = preparePublishedGlobals(input)
    expect(result.assignments.A).toBe('%QW600')
  })
})

describe('preparePublishedGlobals — 32-bit pair glue', () => {
  const input = project([
    globalVar({ name: 'Speed', publish: true, group: 'Axis', type: { definition: 'base-type', value: 'REAL' } }),
    globalVar({ name: 'Count', publish: true, type: { definition: 'base-type', value: 'DINT' } }),
    globalVar({ name: 'Mask', publish: true, type: { definition: 'base-type', value: 'DWORD' } }),
    globalVar({ name: 'Word0', publish: true }),
  ])
  const result = preparePublishedGlobals(input)

  it('allocates pairs and words without overlap', () => {
    expect(result.errors).toEqual([])
    expect(result.assignments).toEqual({
      Speed: '%QW512',
      Count: '%QW514',
      Mask: '%QW516',
      Word0: '%QW518',
    })
    expect(result.windowCount).toBe(7)
  })

  it('strips locations from pair variables and locates words directly', () => {
    const globals = result.projectData.configuration.resource.globalVariables
    expect(globals.find((v) => v.name === 'Speed')?.location).toBe('')
    expect(globals.find((v) => v.name === 'Word0')?.location).toBe('%QW518')
  })

  it('injects the glue FB stub and the mirror program', () => {
    const names = result.projectData.pous.map((p) => p.data.name)
    expect(names).toContain(HMI_PUBLISH_GLUE_FB)
    expect(names).toContain(HMI_PUBLISH_PROGRAM)

    const fb = result.projectData.pous.find((p) => p.data.name === HMI_PUBLISH_GLUE_FB)
    expect(fb?.type).toBe('function-block')
    const fbBody = fb?.data.body.value as string
    expect(fbBody).toContain('__HMI_PUB_GLUE_VARS vars;')
    expect(fbBody).toContain('__hmi_pub_glue_setup(&vars);')
    expect(fbBody).toContain('__hmi_pub_glue_loop(&vars);')
    expect(fbBody).toContain('vars.IN_0 = &IN_0;')
    expect(fbBody).toContain('vars.HI_2 = &HI_2;')

    const program = result.projectData.pous.find((p) => p.data.name === HMI_PUBLISH_PROGRAM)
    expect(program?.type).toBe('program')
    const programBody = program?.data.body.value as string
    expect(programBody).toContain('__hmi_glue(IN_0 := Speed, IN_1 := Count, IN_2 := Mask);')
    expect(programBody).toContain('__hmi_pub_0_lo := __hmi_glue.LO_0;')
    expect(programBody).toContain('__hmi_pub_2_hi := __hmi_glue.HI_2;')

    // External imports + located pair words on the program interface.
    const programVars = program?.data.variables ?? []
    expect(programVars.find((v) => v.name === 'Speed')?.class).toBe('external')
    expect(programVars.find((v) => v.name === '__hmi_pub_0_lo')?.location).toBe('%QW512')
    expect(programVars.find((v) => v.name === '__hmi_pub_0_hi')?.location).toBe('%QW513')
    expect(programVars.find((v) => v.name === '__hmi_pub_1_lo')?.location).toBe('%QW514')
  })

  it('appends the C++ sidecar with bit-exact packing per type', () => {
    const sidecars = result.projectData.originalCppPous ?? []
    expect(sidecars).toHaveLength(1)
    expect(sidecars[0].name).toBe(HMI_PUBLISH_GLUE_FB)
    const code = sidecars[0].code
    expect(code).toContain('void setup()')
    expect(code).toContain('void loop()')
    // REAL packs through memcpy (bit-exact), DINT casts, DWORD copies.
    expect(code).toContain('memcpy(&bits, &value, sizeof(bits));')
    expect(code).toContain('int32_t value = IN_1;')
    expect(code).toContain('uint32_t bits = IN_2;')
    expect(code).toContain('LO_0 = (uint16_t)(bits & 0xFFFFu);')
    expect(code).toContain('HI_0 = (uint16_t)(bits >> 16);')
  })

  it('appends the 100 ms publish task and its instance', () => {
    const tasks = result.projectData.configuration.resource.tasks
    const instances = result.projectData.configuration.resource.instances
    expect(tasks).toContainEqual({ name: HMI_PUBLISH_TASK, triggering: 'Cyclic', interval: 'T#100ms', priority: 10 })
    expect(instances).toContainEqual({
      name: HMI_PUBLISH_INSTANCE,
      task: HMI_PUBLISH_TASK,
      program: HMI_PUBLISH_PROGRAM,
    })
  })

  it('does not mutate the caller input', () => {
    expect(input.pous).toHaveLength(1)
    expect(input.configuration.resource.tasks).toHaveLength(1)
    expect(input.configuration.resource.instances).toHaveLength(1)
    expect(input.originalCppPous).toBeUndefined()
  })

  it('pins a pair via a user-typed %QW literal (register only — location stripped)', () => {
    const pinned = project([
      globalVar({ name: 'Speed', publish: true, location: '%QW600', type: { definition: 'base-type', value: 'REAL' } }),
    ])
    const res = preparePublishedGlobals(pinned)
    expect(res.errors).toEqual([])
    expect(res.assignments.Speed).toBe('%QW600')
    expect(res.projectData.configuration.resource.globalVariables[0].location).toBe('')
    const program = res.projectData.pous.find((p) => p.data.name === HMI_PUBLISH_PROGRAM)
    expect(program?.data.variables.find((v) => v.name === '__hmi_pub_0_lo')?.location).toBe('%QW600')
    expect(program?.data.variables.find((v) => v.name === '__hmi_pub_0_hi')?.location).toBe('%QW601')
  })
})

describe('preparePublishedGlobals — errors', () => {
  it('propagates allocator errors (unsupported type) without transforming', () => {
    const input = project([globalVar({ name: 'S', publish: true, type: { definition: 'base-type', value: 'STRING' } })])
    const result = preparePublishedGlobals(input)
    expect(result.hasPublishes).toBe(true)
    expect(result.errors).toHaveLength(1)
    expect(result.projectData).toBe(input)
    expect(result.points).toEqual([])
  })

  it.each([
    ['POU', HMI_PUBLISH_GLUE_FB],
    ['POU', HMI_PUBLISH_PROGRAM],
  ])('rejects a user %s named like the reserved synthetic names', (_kind, reserved) => {
    const input = project([globalVar({ name: 'R', publish: true, type: { definition: 'base-type', value: 'REAL' } })])
    input.pous.push({
      type: 'program',
      data: {
        language: 'st',
        name: reserved,
        variables: [],
        body: { language: 'st', value: 'x := 1;' },
        documentation: '',
      },
    })
    const result = preparePublishedGlobals(input)
    expect(result.errors.some((e) => e.includes(reserved))).toBe(true)
  })

  it('rejects a user task or instance named like the reserved names', () => {
    const input = project([globalVar({ name: 'R', publish: true, type: { definition: 'base-type', value: 'REAL' } })])
    input.configuration.resource.tasks.push({
      name: HMI_PUBLISH_TASK,
      triggering: 'Cyclic',
      interval: 'T#100ms',
      priority: 1,
    })
    input.configuration.resource.instances.push({
      name: HMI_PUBLISH_INSTANCE,
      task: 'task0',
      program: 'main0',
    })
    const result = preparePublishedGlobals(input)
    expect(result.errors.some((e) => e.includes(HMI_PUBLISH_TASK))).toBe(true)
    expect(result.errors.some((e) => e.includes(HMI_PUBLISH_INSTANCE))).toBe(true)
  })

  it('word-only publishes skip the reserved-name guard (no synthetics needed)', () => {
    const input = project([globalVar({ name: 'W', publish: true })])
    input.configuration.resource.tasks.push({
      name: HMI_PUBLISH_TASK,
      triggering: 'Cyclic',
      interval: 'T#100ms',
      priority: 1,
    })
    const result = preparePublishedGlobals(input)
    expect(result.errors).toEqual([])
  })
})
