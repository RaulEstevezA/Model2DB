import type { ColumnType, PhysicalEnum } from '../../../physical/types.ts'

/** Pieces of TypeScript shared by the TypeScript generators. */

export function tsString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

const identifier = /^[A-Za-z_$][\w$]*$/

/** A property key as written in an object literal: bare when it can be. */
export function tsKey(name: string): string {
  return identifier.test(name) ? name : tsString(name)
}

/** The TypeScript type of a column's values as the drivers return them: BIGINT and DECIMAL come as
 * text, so they do not lose precision. */
export function tsType(type: ColumnType, enums: PhysicalEnum[]): string {
  switch (type.kind) {
    case 'raw':
    case 'json':
      return 'unknown'
    case 'array':
      return `${tsType(type.items, enums)}[]`
    case 'enum': {
      const item = enums.find((candidate) => candidate.name === type.name)
      if (item && (item.storage === 'check' || item.storage === 'native')) return item.name
      return item?.values.every((value) => typeof value === 'number') ? 'number' : 'string'
    }
    case 'primitive':
      switch (type.name) {
        case 'integer':
          return type.bits === 64 ? 'string' : 'number'
        case 'float':
          return 'number'
        case 'decimal':
          return 'string'
        case 'boolean':
          return 'boolean'
        case 'date':
        case 'datetime':
          return 'Date'
        case 'binary':
          return 'Buffer'
        case 'any':
          return 'unknown'
        default:
          return 'string'
      }
  }
}

/** `export enum OrderStatus { Paid = 'paid' }` for the enums stored as their own type or with a CHECK. */
export function tsEnum(name: string, members: { name: string; value: string | number }[]): string[] {
  return [
    `export enum ${name} {`,
    ...members.map((member) => `  ${tsKey(member.name)} = ${typeof member.value === 'number' ? member.value : tsString(member.value)},`),
    '}',
  ]
}
