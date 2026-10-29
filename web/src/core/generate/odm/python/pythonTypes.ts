import type { EnumDef, TypeRef } from '../../../model/schema.ts'
import { pyIdentifier, pyString } from '../../orm/python/python.ts'

/** Python pieces shared by the document writers. */

/** The Python type of a value (`datetime.datetime`, `decimal.Decimal`), and the modules it needs. */
export function pythonValueType(type: TypeRef): { type: string; modules: string[] } {
  if (type.kind === 'enum') return { type: pyIdentifier(type.name), modules: [] }
  if (type.kind !== 'primitive') return { type: 'Any', modules: ['typing'] }
  switch (type.name) {
    case 'string':
      return { type: 'str', modules: [] }
    case 'integer':
      return { type: 'int', modules: [] }
    case 'float':
      return { type: 'float', modules: [] }
    case 'decimal':
      return { type: 'decimal.Decimal', modules: ['decimal'] }
    case 'boolean':
      return { type: 'bool', modules: [] }
    case 'date':
    case 'datetime':
      return { type: 'datetime.datetime', modules: ['datetime'] }
    case 'uuid':
      return { type: 'uuid.UUID', modules: ['uuid'] }
    case 'binary':
      return { type: 'bytes', modules: [] }
    case 'time':
    case 'duration':
      return { type: 'str', modules: [] }
    case 'any':
      return { type: 'Any', modules: ['typing'] }
  }
}

/** A JSON value as a Python literal: `true` → `True`, `null` → `None`. */
export function pythonLiteral(value: unknown, indent = ''): string {
  if (value === null || value === undefined) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return pyString(value)
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item !== 'object' || item === null)) return `[${value.map((item) => pythonLiteral(item)).join(', ')}]`
    return `[\n${value.map((item) => `${indent}    ${pythonLiteral(item, `${indent}    `)},`).join('\n')}\n${indent}]`
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined)
  if (entries.length === 0) return '{}'
  return `{\n${entries.map(([key, item]) => `${indent}    ${pyString(key)}: ${pythonLiteral(item, `${indent}    `)},`).join('\n')}\n${indent}}`
}

/** `class OrderStatus(str, enum.Enum)` with the stored values. */
export function pythonStrEnum(item: EnumDef): string[] {
  const numeric = item.values.every((value) => typeof value.value === 'number')
  return [
    `class ${pyIdentifier(item.name)}(${numeric ? 'enum.IntEnum' : 'str, enum.Enum'}):`,
    ...item.values.map((value) => {
      const stored = value.value ?? value.name
      return `    ${pyIdentifier(String(value.name).toUpperCase())} = ${typeof stored === 'number' ? stored : pyString(stored)}`
    }),
  ]
}
