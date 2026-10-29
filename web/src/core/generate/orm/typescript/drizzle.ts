import { toCamelCase } from '../../../model/naming.ts'
import type { Literal } from '../../../model/schema.ts'
import type { Column, ColumnType, Dialect, PhysicalEnum, Table } from '../../../physical/types.ts'
import { todoText } from '../../todos.ts'
import { fileBase, type GeneratedFile, type RelationalWriter, type WriteContext } from '../../types.ts'
import { buildEntities, type EntityClass, type EntityView } from '../entities.ts'
import { tsKey, tsString } from './typescript.ts'

/** A Drizzle ORM schema with its relations. drizzle-kit writes the migrations from it
 * (`drizzle-kit generate`), so none is written here. */

type Flavor = 'pg' | 'mysql' | 'sqlite'

const FLAVORS: Partial<Record<Dialect, Flavor>> = { postgresql: 'pg', mysql: 'mysql', mariadb: 'mysql', sqlite: 'sqlite' }

/** What changes between the three flavors of Drizzle: the module, the table function and the builders. */
interface FlavorRules {
  module: string
  table: string
  enumFunction?: string
  /** The builder call of a column, and the names it needs from the module */
  column(type: ColumnType, name: string, enums: PhysicalEnum[]): { call: string; imports: string[] }
  identity(call: string): string
  now: string
  /** The type of any column of this flavor, for references to tables declared later */
  anyColumn: string
}

function enumWidth(item: PhysicalEnum): number {
  const longest = Math.max(1, ...item.values.map((value) => String(value).length))
  return longest <= 20 ? 20 : longest <= 50 ? 50 : 255
}

const builder = (fn: string, name: string, options?: string) => ({
  call: `${fn}(${tsString(name)}${options ? `, ${options}` : ''})`,
  imports: [fn],
})

function enumVariable(item: PhysicalEnum): string {
  return `${toCamelCase(item.name)}Enum`
}

const RULES: Record<Flavor, FlavorRules> = {
  pg: {
    module: 'drizzle-orm/pg-core',
    table: 'pgTable',
    enumFunction: 'pgEnum',
    column(type, name, enums) {
      switch (type.kind) {
        case 'raw':
        case 'json':
          return builder('jsonb', name)
        case 'array': {
          const inner = this.column(type.items, name, enums)
          return { call: `${inner.call}.array()`, imports: inner.imports }
        }
        case 'enum': {
          const item = enums.find((candidate) => candidate.name === type.name)
          if (item?.storage === 'native') return { call: `${enumVariable(item)}(${tsString(name)})`, imports: [] }
          if (item?.values.every((value) => typeof value === 'number')) return builder('integer', name)
          return builder('varchar', name, `{ length: ${item ? enumWidth(item) : 255} }`)
        }
        case 'primitive':
          switch (type.name) {
            case 'string':
              return type.length ? builder('varchar', name, `{ length: ${type.length} }`) : builder('text', name)
            case 'integer':
              if (type.bits === 64) return builder('bigint', name, "{ mode: 'number' }")
              if (type.bits === 8 || type.bits === 16) return builder('smallint', name)
              return builder('integer', name)
            case 'float':
              return type.bits === 32 ? builder('real', name) : builder('doublePrecision', name)
            case 'decimal':
              return builder('numeric', name, `{ precision: ${type.precision ?? 18}, scale: ${type.scale ?? 2} }`)
            case 'boolean':
              return builder('boolean', name)
            case 'date':
              return builder('date', name)
            case 'datetime':
              return builder('timestamp', name, '{ withTimezone: true }')
            case 'time':
              return builder('time', name)
            case 'duration':
              return builder('interval', name)
            case 'uuid':
              return builder('uuid', name)
            case 'binary':
              return { call: `bytea(${tsString(name)})`, imports: ['customType'] }
            case 'any':
              return builder('jsonb', name)
          }
      }
    },
    identity: (call) => `${call}.generatedByDefaultAsIdentity()`,
    now: '.defaultNow()',
    anyColumn: 'AnyPgColumn',
  },
  mysql: {
    module: 'drizzle-orm/mysql-core',
    table: 'mysqlTable',
    enumFunction: 'mysqlEnum',
    column(type, name, enums) {
      switch (type.kind) {
        case 'raw':
        case 'json':
        case 'array':
          return builder('json', name)
        case 'enum': {
          const item = enums.find((candidate) => candidate.name === type.name)
          if (item?.storage === 'native')
            return builder('mysqlEnum', name, `[${item.values.map((value) => tsString(String(value))).join(', ')}]`)
          if (item?.values.every((value) => typeof value === 'number')) return builder('int', name)
          return builder('varchar', name, `{ length: ${item ? enumWidth(item) : 255} }`)
        }
        case 'primitive':
          switch (type.name) {
            case 'string':
              return type.length ? builder('varchar', name, `{ length: ${type.length} }`) : builder('text', name)
            case 'integer':
              if (type.bits === 64) return builder('bigint', name, "{ mode: 'number' }")
              if (type.bits === 8 || type.bits === 16) return builder('smallint', name)
              return builder('int', name)
            case 'float':
              return type.bits === 32 ? builder('float', name) : builder('double', name)
            case 'decimal':
              return builder('decimal', name, `{ precision: ${type.precision ?? 18}, scale: ${type.scale ?? 2} }`)
            case 'boolean':
              return builder('boolean', name)
            case 'date':
              return builder('date', name)
            case 'datetime':
              return builder('datetime', name, '{ fsp: 6 }')
            case 'time':
              return builder('time', name)
            case 'duration':
              return builder('varchar', name, '{ length: 50 }')
            case 'uuid':
              return builder('char', name, '{ length: 36 }')
            case 'binary':
              return { call: `blob(${tsString(name)})`, imports: ['customType'] }
            case 'any':
              return builder('json', name)
          }
      }
    },
    identity: (call) => `${call}.autoincrement()`,
    // datetime(6) has no defaultNow() in Drizzle
    now: '.default(sql`CURRENT_TIMESTAMP(6)`)',
    anyColumn: 'AnyMySqlColumn',
  },
  sqlite: {
    module: 'drizzle-orm/sqlite-core',
    table: 'sqliteTable',
    column(type, name, enums) {
      switch (type.kind) {
        case 'raw':
        case 'json':
        case 'array':
          return builder('text', name, "{ mode: 'json' }")
        case 'enum': {
          const item = enums.find((candidate) => candidate.name === type.name)
          return item?.values.every((value) => typeof value === 'number') ? builder('integer', name) : builder('text', name)
        }
        case 'primitive':
          switch (type.name) {
            case 'integer':
              return builder('integer', name)
            case 'boolean':
              return builder('integer', name, "{ mode: 'boolean' }")
            case 'float':
              return builder('real', name)
            case 'decimal':
              return builder('numeric', name)
            case 'binary':
              return builder('blob', name)
            case 'any':
              return builder('text', name, "{ mode: 'json' }")
            default:
              return builder('text', name)
          }
      }
    },
    identity: (call) => call,
    now: '.default(sql`CURRENT_TIMESTAMP`)',
    anyColumn: 'AnySQLiteColumn',
  },
}

function literal(value: Literal, column: Column, enums: PhysicalEnum[]): string | null {
  if (value === null) return null
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  const item =
    column.type.kind === 'enum' ? enums.find((candidate) => candidate.name === (column.type as { name: string }).name) : undefined
  const stored = item?.values.find((candidate) => String(candidate).toLowerCase() === value.toLowerCase()) ?? value
  return typeof stored === 'number' ? String(stored) : tsString(String(stored))
}

/** Variable of a table in the schema file: `order_lines` → `orderLines`. */
function tableVariable(table: Table): string {
  return toCamelCase(table.name)
}

interface Imports {
  core: Set<string>
  orm: Set<string>
}

function tableBlock(
  table: Table,
  item: EntityClass | null,
  view: EntityView,
  flavor: Flavor,
  imports: Imports,
  variables: Map<string, string>,
): string[] {
  const rules = RULES[flavor]
  const variable = variables.get(table.name)!
  const composite = table.primaryKey.length > 1
  const attributeName = (column: string) =>
    item?.attributes.find((attribute) => attribute.column.name === column)?.name ?? toCamelCase(column)
  const lines: string[] = []
  for (const column of table.columns) {
    const built = rules.column(column.type, column.name, view.enums)
    built.imports.forEach((name) => imports.core.add(name))
    let call = built.call
    const primary = !composite && table.primaryKey[0] === column.name
    if (primary) {
      if (column.generated === 'identity') call = rules.identity(call)
      call += flavor === 'sqlite' && column.generated === 'identity' ? '.primaryKey({ autoIncrement: true })' : '.primaryKey()'
    }
    if (!column.nullable && !primary) call += '.notNull()'
    if (column.generated === 'uuid') call += flavor === 'pg' ? '.defaultRandom()' : '.$defaultFn(() => crypto.randomUUID())'
    if (column.generated === 'now') {
      call += rules.now
      if (rules.now.includes('sql`')) imports.orm.add('sql')
    }
    if (column.defaultValue !== undefined && column.defaultValue !== null) {
      const value = literal(column.defaultValue, column, view.enums)
      if (value !== null) call += `.default(${value})`
    }
    const fk = table.foreignKeys.find((candidate) => candidate.columns.length === 1 && candidate.columns[0] === column.name)
    if (fk) {
      const target = variables.get(fk.table)!
      const targetItem = view.classes.find((candidate) => candidate.table.name === fk.table)
      const reference =
        targetItem?.attributes.find((attribute) => attribute.column.name === fk.references[0])?.name ?? toCamelCase(fk.references[0])
      call += `.references((): ${rules.anyColumn} => ${target}.${reference}${fk.onDelete ? `, { onDelete: ${tsString(fk.onDelete)} }` : ''})`
      imports.core.add(`type ${rules.anyColumn}`)
    }
    lines.push(`  ${tsKey(attributeName(column.name))}: ${call},`)
  }
  const extras: string[] = []
  if (composite) {
    imports.core.add('primaryKey')
    extras.push(
      `primaryKey({ name: ${tsString(`pk_${table.name}`)}, columns: [${table.primaryKey.map((column) => `table.${attributeName(column)}`).join(', ')}] })`,
    )
  }
  for (const unique of table.uniques) {
    imports.core.add('unique')
    extras.push(`unique(${tsString(unique.name)}).on(${unique.columns.map((column) => `table.${attributeName(column)}`).join(', ')})`)
  }
  for (const index of table.indexes) {
    imports.core.add(index.unique ? 'uniqueIndex' : 'index')
    extras.push(
      `${index.unique ? 'uniqueIndex' : 'index'}(${tsString(index.name)}).on(${index.columns.map((column) => `table.${attributeName(column)}`).join(', ')})`,
    )
  }
  for (const check of table.checks) {
    imports.core.add('check')
    imports.orm.add('sql')
    const values = check.values.map((value) => (typeof value === 'number' ? value : `'${String(value).replace(/'/g, "''")}'`)).join(', ')
    extras.push(`check(${tsString(check.name)}, sql\`\${table.${attributeName(check.column)}} IN (${values})\`)`)
  }
  imports.core.add(rules.table)
  const head = [
    ...table.todos.map((todo) => `// ${todoText(todo, table.model, 'table')}`),
    `export const ${variable} = ${rules.table}(${tsString(table.name)}, {`,
  ]
  if (extras.length === 0) return [...head, ...lines, '})']
  return [...head, ...lines, '}, (table) => [', ...extras.map((extra) => `  ${extra},`), '])']
}

/** `relations(...)` of a table: one() for its foreign keys, many() for the lists of the design. Both
 * sides share a relation name, so several relations between the same tables stay apart. */
function relationsBlock(
  item: EntityClass,
  view: EntityView,
  variables: Map<string, string>,
  joinRelations: Map<string, string[]>,
): string[] {
  const variable = variables.get(item.table.name)!
  const entries: string[] = []
  for (const navigation of item.navigations) {
    if (navigation.kind === 'manyToOne') {
      const attribute = item.attributes.find((candidate) => candidate.name === navigation.attribute)!
      const target = view.classes.find((candidate) => candidate.name === navigation.target)!
      const reference = target.attributes.find((candidate) => candidate.column.name === attribute.foreignKey!.references[0])!.name
      entries.push(
        `  ${tsKey(navigation.name)}: one(${variables.get(target.table.name)}, { fields: [${variable}.${navigation.attribute}], references: [${variables.get(target.table.name)}.${reference}], relationName: ${tsString(`${item.name}_${navigation.name}`)} }),`,
      )
    } else if (navigation.kind === 'oneToMany') {
      const target = view.classes.find((candidate) => candidate.name === navigation.target)!
      entries.push(
        `  ${tsKey(navigation.name)}: many(${variables.get(target.table.name)}, { relationName: ${tsString(`${target.name}_${navigation.inverse}`)} }),`,
      )
    }
  }
  entries.push(...(joinRelations.get(item.table.name) ?? []))
  if (entries.length === 0) return []
  return [`export const ${variable}Relations = relations(${variable}, ({ one, many }) => ({`, ...entries, '}))']
}

function schemaFile(view: EntityView, flavor: Flavor, context: WriteContext, tables: Table[]): string {
  const imports: Imports = { core: new Set(), orm: new Set() }
  const rules = RULES[flavor]
  const variables = new Map(tables.map((table) => [table.name, tableVariable(table)]))
  const body: string[] = []
  for (const item of view.enums) {
    if (item.storage !== 'native' || flavor !== 'pg') continue
    imports.core.add('pgEnum')
    body.push(
      '',
      `export const ${enumVariable(item)} = pgEnum(${tsString(item.sqlName)}, [${item.values.map((value) => tsString(String(value))).join(', ')}])`,
    )
  }
  const usesBinary = tables.some((table) =>
    table.columns.some((column) => column.type.kind === 'primitive' && column.type.name === 'binary'),
  )
  if (usesBinary && flavor !== 'sqlite') {
    const name = flavor === 'pg' ? 'bytea' : 'blob'
    body.push('', `const ${name} = customType<{ data: Uint8Array }>({ dataType: () => ${tsString(name)} })`)
  }
  for (const table of tables) {
    const item = view.classes.find((candidate) => candidate.table === table) ?? null
    body.push('', ...tableBlock(table, item, view, flavor, imports, variables))
  }
  // Join tables relate to both sides, and each side lists them
  const joinRelations = new Map<string, string[]>()
  const joinBlocks: string[] = []
  for (const join of view.joins) {
    const variable = variables.get(join.name)!
    const entries = join.foreignKeys.map((fk) => {
      const target = view.classes.find((candidate) => candidate.table.name === fk.table)!
      const reference = target.attributes.find((attribute) => attribute.column.name === fk.references[0])!.name
      const name = fk.columns[0].endsWith(`_${fk.references[0]}`)
        ? toCamelCase(fk.columns[0].slice(0, -fk.references[0].length - 1))
        : toCamelCase(fk.columns[0])
      const relation = `${join.name}_${name}`
      const list = target.navigations.find(
        (navigation) =>
          navigation.kind === 'manyToMany' && navigation.join?.table === join && navigation.join.ownerColumn === fk.columns[0],
      )
      joinRelations.set(fk.table, [
        ...(joinRelations.get(fk.table) ?? []),
        `  ${tsKey(list?.name ?? `${variable}Links`)}: many(${variable}, { relationName: ${tsString(relation)} }),`,
      ])
      return `  ${tsKey(name)}: one(${variables.get(fk.table)}, { fields: [${variable}.${toCamelCase(fk.columns[0])}], references: [${variables.get(fk.table)}.${reference}], relationName: ${tsString(relation)} }),`
    })
    joinBlocks.push('', `export const ${variable}Relations = relations(${variable}, ({ one }) => ({`, ...entries, '}))')
  }
  const relationBlocks: string[] = []
  for (const item of view.classes) {
    const block = relationsBlock(item, view, variables, joinRelations)
    if (block.length > 0) relationBlocks.push('', ...block)
  }
  if (relationBlocks.length > 0 || joinBlocks.length > 0) imports.orm.add('relations')
  const ormImports = [...imports.orm].sort((a, b) => a.replace('type ', '').localeCompare(b.replace('type ', '')))
  const header = [
    `// Drizzle schema written by Model2DB from ${context.title}. Review it, then run \`npx drizzle-kit generate\`.`,
    ...(ormImports.length > 0 ? [`import { ${ormImports.join(', ')} } from 'drizzle-orm'`] : []),
    `import { ${[...imports.core].sort((a, b) => a.replace('type ', '').localeCompare(b.replace('type ', ''))).join(', ')} } from ${tsString(rules.module)}`,
  ]
  return [...header, ...body, ...relationBlocks, ...joinBlocks, ''].join('\n')
}

export const drizzleOutput: RelationalWriter = {
  id: 'drizzle',
  label: 'Drizzle ORM',
  group: 'typescript',
  engines: ['postgresql', 'mysql', 'mariadb', 'sqlite'],
  write(physical, context): GeneratedFile[] {
    const flavor = FLAVORS[context.settings.engine] ?? 'pg'
    const view = buildEntities(physical, context.schema, 'camelCase')
    return [
      {
        name: `db/${fileBase(context.title)}.schema.ts`,
        content: schemaFile(view, flavor, context, physical.tables),
        editorLanguage: 'typescript',
      },
    ]
  },
}
