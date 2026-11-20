import type { LibraryState } from '../../middleware/shared/ports/library-types'
import { baseTypeSchema } from '../../middleware/shared/ports/plc-schemas'
import type { PLCDataType, PLCPou, PLCVariable } from '../../middleware/shared/ports/types'

const varBlockToClass: Record<string, PLCVariable['class']> = {
  VAR: 'local',
  VAR_INPUT: 'input',
  VAR_OUTPUT: 'output',
  VAR_IN_OUT: 'inOut',
  VAR_EXTERNAL: 'external',
  VAR_TEMP: 'temp',
  VAR_GLOBAL: 'global',
}

// Primary format: name : type AT location := initialValue ; (* documentation *)
const lineRegex =
  // eslint-disable-next-line no-useless-escape
  /^\s*(?<name>\w+)\s*:\s*(?<type>[\w\s\[\]\.]+?)(?:\s+AT\s+(?<location>[\w\d\._%]+))?\s*(?::=\s*(?<initialValue>[^;]+?))?\s*;\s*(?:\(\*\s*(?<documentation>.*?)\s*\*\))?$/

// Alternate format: name AT location : type := initialValue ; (* documentation *)
// This format is used by some IEC 61131-3 tools and older versions of OpenPLC Editor
const alternateLineRegex =
  // eslint-disable-next-line no-useless-escape
  /^\s*(?<name>\w+)\s+AT\s+(?<location>[\w\d\._%]+)\s*:\s*(?<type>[\w\s\[\]\.]+?)\s*(?::=\s*(?<initialValue>[^;]+?))?\s*;\s*(?:\(\*\s*(?<documentation>.*?)\s*\*\))?$/

const guessErrorReason = (line: string): string => {
  if (!line.includes(';')) return 'missing semicolon (;) at the end of the declaration'
  if (!line.includes(':')) return 'missing colon (:) between name and type'
  // eslint-disable-next-line no-useless-escape
  if (/[^A-Za-z0-9_\s:;=%()/*\-.\[\]]/.test(line)) return 'invalid or unsupported characters'
  return 'unrecognized declaration format'
}

/**
 * Type guard to check if a library object has a 'pous' property
 */
const hasLibraryPous = (lib: unknown): lib is { pous: Array<{ name: string; type: string }> } => {
  return typeof lib === 'object' && lib !== null && 'pous' in lib && Array.isArray((lib as { pous: unknown }).pous)
}

/**
 * Parse an array type string like "ARRAY[1..10] OF INT" or "ARRAY[1..10, 1..5] OF MyStruct"
 * Returns null if not an array type, otherwise returns the parsed array type definition.
 */
const parseArrayType = (typeStr: string): PLCVariable['type'] | null => {
  // Match ARRAY[dimensions] OF baseType, where baseType is an identifier (optionally namespaced)
  const arrayMatch = typeStr.match(/^ARRAY\s*\[([^\]]+)\]\s+OF\s+([A-Za-z_][\w.]*)\s*$/i)
  if (!arrayMatch) return null

  const dimensionsStr = arrayMatch[1]
  const baseTypeStr = arrayMatch[2].trim()

  // Parse dimensions (can be comma-separated for multi-dimensional arrays)
  const dimensionParts = dimensionsStr.split(',').map((d) => d.trim())
  const dimensions = dimensionParts.map((dimensionRange) => ({ dimension: dimensionRange }))

  // Determine the base type definition
  const baseCheck = baseTypeSchema.safeParse(baseTypeStr.toUpperCase())

  // Build the array type definition
  if (baseCheck.success) {
    // Base type is a valid IEC base type
    return {
      definition: 'array' as const,
      value: typeStr, // Keep the full type string as the value
      data: {
        baseType: { definition: 'base-type' as const, value: baseCheck.data },
        dimensions,
      },
    }
  } else {
    // Base type is a user-defined type (structure, FB, etc.)
    return {
      definition: 'array' as const,
      value: typeStr, // Keep the full type string as the value
      data: {
        baseType: { definition: 'user-data-type' as const, value: baseTypeStr },
        dimensions,
      },
    }
  }
}

export const parseIecStringToVariables = (
  iecString: string,
  pous?: PLCPou[],
  _dataTypes?: PLCDataType[], // Reserved for future use: will enable user-defined data type validation
  libraries?: LibraryState['libraries'],
): PLCVariable[] => {
  const variables: PLCVariable[] = []
  const lines = iecString.split(/\r?\n/)
  let currentClass: PLCVariable['class'] | null = null
  // True while inside a `VAR RETAIN` section (CoDeSys POU-level retain).
  let currentRetain = false
  // True while inside a `VAR RETAIN PERSISTENT` / `VAR PERSISTENT` section: kept through a clean
  // upload too (a reset cold).
  let currentPersistent = false
  // Tracks an open (* ... *) comment block spanning multiple lines.
  let inBlockComment = false
  // A GVL'S OWN LINES (2026-11-20): the comment and blank lines that stand between its
  // declarations are kept with the declaration they precede (`codeBefore`), those before END_VAR
  // with the last one (`codeAfter`). The code view writes them back where they were; the table
  // does not show them. A comment on a declaration's own line is its documentation, as before.
  let pending: string[] = []
  let lastInBlock: PLCVariable | null = null
  const pushVar = (v: PLCVariable) => {
    if (currentClass === 'global' && pending.length > 0) v.codeBefore = pending.join('\n')
    pending = []
    variables.push(v)
    lastInBlock = v
  }

  lines.forEach((rawLine, idx) => {
    const lineNumber = idx + 1
    const line = rawLine.trim()
    if (line === '') {
      if (currentClass === 'global' && !inBlockComment) pending.push('')
      return
    }

    // Skip standalone IEC comments inside VAR blocks. These are ordinary
    // documentation lines (e.g. `(* DIO outputs *)`) that carry no
    // declaration; without this the comment fails the variable regex and
    // the whole block is discarded, blanking the variable table.
    if (inBlockComment) {
      if (currentClass === 'global') pending.push(line)
      if (line.includes('*)')) inBlockComment = false
      return
    }
    if (line.startsWith('(*')) {
      if (currentClass === 'global') pending.push(line)
      if (!line.includes('*)')) inBlockComment = true
      return
    }

    const blockStart = line.match(/^(VAR_INPUT|VAR_OUTPUT|VAR_IN_OUT|VAR_EXTERNAL|VAR_TEMP|VAR_GLOBAL|VAR)\b/i)
    if (blockStart) {
      currentClass = varBlockToClass[blockStart[1].toUpperCase()]
      // `VAR RETAIN` (CoDeSys POU-level retain): same class as VAR, but
      // every declaration in the section carries `retain: true` so the
      // compile pipeline can expand the members into `retain-names.json`
      // instance paths.  The same for a GVL's `VAR_GLOBAL RETAIN`.  PERSISTENT
      // alone means RETAIN PERSISTENT (the runtime has no persistent-only kind).
      // Other qualifiers (CONSTANT) are ignored here as before.
      const kind = blockStart[1].toUpperCase()
      const retainable = kind === 'VAR' || kind === 'VAR_GLOBAL'
      currentPersistent = retainable && /^VAR(_GLOBAL)?\s+(RETAIN\s+PERSISTENT|PERSISTENT(\s+RETAIN)?)\b/i.test(line)
      currentRetain = retainable && (currentPersistent || /^VAR(_GLOBAL)?\s+RETAIN\b/i.test(line))
      pending = []
      lastInBlock = null
      return
    }

    if (/^END_VAR\b/i.test(line)) {
      // the lines after the last declaration stay after it (trailing blank lines are not kept)
      while (pending.length > 0 && pending[pending.length - 1] === '') pending.pop()
      if (currentClass === 'global' && lastInBlock && pending.length > 0) lastInBlock.codeAfter = pending.join('\n')
      pending = []
      lastInBlock = null
      currentClass = null
      currentRetain = false
      currentPersistent = false
      return
    }

    if (!currentClass) return

    // Try primary format first, then fall back to alternate format
    let match = line.match(lineRegex)
    if (!match?.groups) {
      match = line.match(alternateLineRegex)
    }
    if (!match?.groups) {
      throw new Error(`Syntax error on line ${lineNumber}: "${line}". Possible cause: ${guessErrorReason(line)}.`)
    }

    const { name, location, type, initialValue, documentation } = match.groups

    const disallowedLocationClasses: Array<PLCVariable['class']> = ['input', 'output', 'inOut', 'external', 'temp']

    if (location && disallowedLocationClasses.includes(currentClass)) {
      throw new Error(
        `Syntax error on line ${lineNumber}: Location ("AT") is not allowed for variables of class "${currentClass.toUpperCase()}".`,
      )
    }

    if (initialValue && currentClass === 'external') {
      throw new Error(
        `Syntax error on line ${lineNumber}: Initial Value (":=") is not allowed for variables of class "EXTERNAL".`,
      )
    }

    const parsedType = type.trim()

    // Check if it's an array type first
    const arrayType = parseArrayType(parsedType)
    if (arrayType) {
      pushVar({
        name: name.trim(),
        class: currentClass,
        type: arrayType,
        location: location ? location.trim() : '',
        initialValue: initialValue ? initialValue.trim() : null,
        documentation: documentation ? documentation.trim() : '',
        debug: false,
        ...(currentRetain ? { retain: true } : {}),
        ...(currentPersistent ? { persistent: true } : {}),
      })
      return
    }

    const baseCheck = baseTypeSchema.safeParse(parsedType.toUpperCase())

    const isUserFunctionBlock = pous?.some(
      (pou) => pou.pouType === 'function-block' && pou.name.toLowerCase() === parsedType.toLowerCase(),
    )

    const isSystemFunctionBlock = libraries?.system.some((lib) => {
      if (!hasLibraryPous(lib)) return false
      return lib.pous.some(
        (pou) => pou.type === 'function-block' && pou.name.toLowerCase() === parsedType.toLowerCase(),
      )
    })

    const isUserLibraryFunctionBlock = libraries?.user.some(
      (lib) => lib.type === 'function-block' && lib.name.toLowerCase() === parsedType.toLowerCase(),
    )

    const isFunctionBlock = isUserFunctionBlock || isSystemFunctionBlock || isUserLibraryFunctionBlock

    const typeDefinition: PLCVariable['type'] = baseCheck.success
      ? { definition: 'base-type' as const, value: baseCheck.data }
      : isFunctionBlock
        ? { definition: 'derived' as const, value: parsedType }
        : { definition: 'user-data-type' as const, value: parsedType }

    pushVar({
      name: name.trim(),
      class: currentClass,
      type: typeDefinition,
      location: location ? location.trim() : '',
      initialValue: initialValue ? initialValue.trim() : null,
      documentation: documentation ? documentation.trim() : '',
      debug: false,
      ...(currentRetain ? { retain: true } : {}),
      ...(currentPersistent ? { persistent: true } : {}),
    })
  })

  return variables
}
