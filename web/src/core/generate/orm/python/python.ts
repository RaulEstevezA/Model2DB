import { orderTables as orderWithCycles } from '../../../physical/order.ts'
import type { Table } from '../../../physical/types.ts'

/** Pieces of Python shared by the Python generators. */

const KEYWORDS = new Set(
  (
    'False None True and as assert async await break class continue def del elif else except finally for from global if import ' +
    'in is lambda nonlocal not or pass raise return try while with yield type match case'
  ).split(' '),
)

/** A valid Python name: keywords get a trailing underscore (`class_`). */
export function pyIdentifier(name: string): string {
  const clean = name.replace(/[^\w]/g, '_').replace(/^(\d)/, '_$1')
  return KEYWORDS.has(clean) ? `${clean}_` : clean
}

export function pyString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** `class OrderStatus(enum.Enum)` with the stored values. */
export function pythonEnum(name: string, members: { name: string; value: string | number }[]): string[] {
  return [
    `class ${pyIdentifier(name)}(enum.Enum):`,
    ...(members.length > 0
      ? members.map(
          (member) =>
            `    ${pyIdentifier(member.name.toUpperCase())} = ${typeof member.value === 'number' ? member.value : pyString(member.value)}`,
        )
      : ['    pass']),
  ]
}

/** Tables in creation order: each after the ones it refers to. */
export function orderTables(tables: Table[]): Table[] {
  return orderWithCycles(tables).tables
}
