import { toPascalCase } from '../../../model/naming.ts'
import type { ColumnType, PhysicalEnum } from '../../../physical/types.ts'

/** Pieces of PHP shared by the PHP generators. */

export function phpString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** The PHP type of a column's values. Decimals are strings, as PDO returns them. */
export function phpType(type: ColumnType, enums: PhysicalEnum[]): string {
  switch (type.kind) {
    case 'raw':
    case 'json':
    case 'array':
      return 'array'
    case 'enum': {
      const item = enums.find((candidate) => candidate.name === type.name)
      if (item && isBackedEnum(item)) return item.name
      return item?.values.every((value) => typeof value === 'number') ? 'int' : 'string'
    }
    case 'primitive':
      switch (type.name) {
        case 'integer':
          return 'int'
        case 'float':
          return 'float'
        case 'boolean':
          return 'bool'
        case 'date':
        case 'datetime':
          return '\\DateTimeImmutable'
        case 'any':
          return 'mixed'
        default:
          return 'string'
      }
  }
}

/** Enums written as PHP backed enums: text values, stored with a CHECK or the database's enum type. */
export function isBackedEnum(item: PhysicalEnum): boolean {
  return (item.storage === 'check' || item.storage === 'native') && item.values.every((value) => typeof value === 'string')
}

export function caseName(value: string): string {
  const name = toPascalCase(value).replace(/\W/g, '')
  return /^\d/.test(name) || name === '' ? `Value${name}` : name
}

/** `enum OrderStatus: string { case Paid = 'paid'; }` */
export function backedEnum(namespace: string, name: string, values: (string | number)[]): string {
  return [
    '<?php',
    '',
    `namespace ${namespace};`,
    '',
    `enum ${name}: string`,
    '{',
    ...values.map((value) => `    case ${caseName(String(value))} = ${phpString(String(value))};`),
    '}',
    '',
  ].join('\n')
}

/** A PHP string literal of an SQL statement, as a nowdoc so nothing inside is interpolated. */
export function sqlLiteral(sql: string, indent: string): string {
  return `<<<'SQL'\n${sql
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n')}\n${indent}SQL`
}
