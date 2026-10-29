import { convertCase, nameWords, toPascalCase, type NamingConvention } from '../../model/naming.ts'
import { singularField } from '../../design/propose.ts'
import { findEnum, type ModelSchema } from '../../model/schema.ts'
import type { Column, ForeignKey, PhysicalEnum, RelationalSchema, Table } from '../../physical/types.ts'

/** The tables of a relational schema seen as ORM classes: one class per table (join tables become
 * many-to-many relations), one attribute per column and the navigations between classes. Every ORM
 * generator writes from this view, so they all name and relate things the same way. */

export interface Attribute {
  /** In the language's convention (`created_at`, `createdAt`, `CreatedAt`) */
  name: string
  column: Column
  primaryKey: boolean
  /** Part of a composite primary key */
  compositeKey: boolean
  /** Foreign key on this column alone */
  foreignKey?: ForeignKey
  unique: boolean
  indexed: boolean
  enum?: PhysicalEnum
}

export type NavigationKind = 'manyToOne' | 'oneToMany' | 'manyToMany'

export interface Navigation {
  name: string
  kind: NavigationKind
  /** Class on the other side */
  target: string
  /** Name of the navigation on the other side, when there is one */
  inverse?: string
  /** manyToOne: the attribute holding the key; oneToMany: the attribute of the target that holds it */
  attribute?: string
  /** manyToOne: may be missing */
  nullable: boolean
  /** manyToMany: the join table and its columns, owner side first */
  join?: { table: Table; ownerColumn: string; targetColumn: string }
  /** oneToMany: the rows go with their owner (ON DELETE CASCADE) */
  cascade: boolean
}

export interface EntityClass {
  name: string
  table: Table
  attributes: Attribute[]
  navigations: Navigation[]
}

export interface EntityView {
  classes: EntityClass[]
  /** Join tables, written as many-to-many relations */
  joins: Table[]
  enums: PhysicalEnum[]
}

/** Class name of a table: the model for entities, model + field for lists (`OrderTag`), the enum for
 * lookup tables (`OrderStatusOption`). */
function className(table: Table): string {
  if (table.kind === 'entity') return toPascalCase(table.model)
  if (table.kind === 'lookup') return `${toPascalCase(table.model)}Option`
  if (table.kind === 'list') return toPascalCase(table.model) + toPascalCase(singularField(table.field ?? 'value'))
  return toPascalCase(table.model) + toPascalCase(table.field ?? 'entry') + 'Entry'
}

/** `customer_id` → `customer`: the navigation next to a key column. */
function withoutId(name: string): string {
  const words = nameWords(name)
  return words.length > 1 && words[words.length - 1] === 'id' ? words.slice(0, -1).join('_') : `${name}_ref`
}

function pluralWord(word: string): string {
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`
  return `${word}s`
}

export function buildEntities(physical: RelationalSchema, schema: ModelSchema, convention: NamingConvention): EntityView {
  const convert = (text: string) => convertCase(text, convention)
  const tables = physical.tables.filter((table) => table.kind !== 'join')
  const names = new Map(tables.map((table) => [table.name, className(table)]))
  const classes: EntityClass[] = tables.map((table) => ({
    name: names.get(table.name)!,
    table,
    attributes: table.columns.map((column) => {
      const foreignKey = table.foreignKeys.find((fk) => fk.columns.length === 1 && fk.columns[0] === column.name)
      const enumItem =
        column.type.kind === 'enum' ? physical.enums.find((item) => item.name === (column.type as { name: string }).name) : undefined
      return {
        name: convert(column.name),
        column,
        primaryKey: table.primaryKey.length === 1 && table.primaryKey[0] === column.name,
        compositeKey: table.primaryKey.length > 1 && table.primaryKey.includes(column.name),
        ...(foreignKey ? { foreignKey } : {}),
        unique: table.uniques.some((unique) => unique.columns.length === 1 && unique.columns[0] === column.name),
        indexed: table.indexes.some((index) => index.columns.length === 1 && index.columns[0] === column.name),
        ...(enumItem ? { enum: enumItem } : {}),
      }
    }),
    navigations: [],
  }))
  const byTable = new Map(classes.map((item) => [item.table.name, item]))
  const used = new Map(classes.map((item) => [item.name, new Set(item.attributes.map((attribute) => attribute.name))]))
  const free = (owner: string, name: string) => {
    const set = used.get(owner)!
    let candidate = name
    for (let i = 2; set.has(candidate); i++) candidate = `${name}${i}`
    set.add(candidate)
    return candidate
  }

  for (const item of classes) {
    for (const fk of item.table.foreignKeys) {
      const target = byTable.get(fk.table)
      if (!target || target.table.kind === 'lookup') continue
      const attribute = item.attributes.find((candidate) => candidate.column.name === fk.columns[0])!
      const many = free(item.name, convert(fk.field ?? withoutId(fk.columns[0])))
      const back = fk.inverse ? free(target.name, convert(fk.inverse)) : undefined
      item.navigations.push({
        name: many,
        kind: 'manyToOne',
        target: target.name,
        ...(back ? { inverse: back } : {}),
        attribute: attribute.name,
        nullable: attribute.column.nullable,
        cascade: false,
      })
      if (back)
        target.navigations.push({
          name: back,
          kind: 'oneToMany',
          target: item.name,
          inverse: many,
          attribute: attribute.name,
          nullable: false,
          cascade: fk.onDelete === 'cascade',
        })
    }
  }

  const joins = physical.tables.filter((table) => table.kind === 'join')
  for (const join of joins) {
    const [first, second] = join.foreignKeys
    const owner = first && byTable.get(first.table)
    const other = second && byTable.get(second.table)
    if (!owner || !other) continue
    const name = free(owner.name, convert(join.field ?? pluralWord(other.name.toLowerCase())))
    const mirror = join.mirror ? free(other.name, convert(join.mirror)) : undefined
    const spec = { table: join, ownerColumn: first.columns[0], targetColumn: second.columns[0] }
    owner.navigations.push({
      name,
      kind: 'manyToMany',
      target: other.name,
      ...(mirror ? { inverse: mirror } : {}),
      nullable: false,
      join: spec,
      cascade: false,
    })
    if (mirror)
      other.navigations.push({
        name: mirror,
        kind: 'manyToMany',
        target: owner.name,
        inverse: name,
        nullable: false,
        join: { table: join, ownerColumn: spec.targetColumn, targetColumn: spec.ownerColumn },
        cascade: false,
      })
  }

  return { classes, joins, enums: physical.enums.filter((item) => findEnum(schema, item.name)) }
}

/** Members of an enum in a language: name and stored value (`PAID = 'paid'`). */
export function enumMembers(item: PhysicalEnum, schema: ModelSchema): { name: string; value: string | number }[] {
  const definition = findEnum(schema, item.name)
  return (definition?.values ?? []).map((value) => ({ name: value.name, value: value.value ?? value.name }))
}

/** The comments of the decisions still pending on a table, in the language's comment syntax. */
export function todoLines(table: Table, prefix: string, text: (todo: Table['todos'][number], table: Table) => string): string[] {
  return table.todos.map((todo) => `${prefix} ${text(todo, table)}`)
}
