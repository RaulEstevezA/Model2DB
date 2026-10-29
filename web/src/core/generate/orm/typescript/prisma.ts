import type { Literal } from '../../../model/schema.ts'
import type { Column, ColumnType, Dialect, PhysicalEnum, Table } from '../../../physical/types.ts'
import { pluralize } from '../../../physical/naming.ts'
import { todoText } from '../../todos.ts'
import type { GeneratedFile, RelationalWriter, WriteContext } from '../../types.ts'
import { buildEntities, enumMembers, type Attribute, type EntityClass, type EntityView } from '../entities.ts'

/** A Prisma schema. Prisma writes its own migrations from it (`prisma migrate dev`), so none is written
 * here: a hand-written one would drift from what Prisma expects. */

type Provider = 'postgresql' | 'mysql' | 'sqlite' | 'sqlserver'

const PROVIDERS: Partial<Record<Dialect, Provider>> = {
  postgresql: 'postgresql',
  mysql: 'mysql',
  mariadb: 'mysql',
  sqlite: 'sqlite',
  sqlserver: 'sqlserver',
}

const identifier = /^[A-Za-z][A-Za-z0-9_]*$/

function prismaString(value: string): string {
  return JSON.stringify(value)
}

/** Providers where Prisma can name a primary key (`@id(map: ...)`). */
const namesPrimaryKeys = (provider: Provider) => provider === 'postgresql' || provider === 'sqlserver'

/** Whether the provider has enums of its own in Prisma (SQL Server does not). */
const hasEnums = (provider: Provider) => provider !== 'sqlserver'

/** Prisma type and native-type attribute of a column. */
function fieldType(type: ColumnType, provider: Provider, enums: PhysicalEnum[]): { type: string; native?: string } {
  const sqlite = provider === 'sqlite'
  switch (type.kind) {
    case 'raw':
    case 'json':
      // SQL Server has no Json type in Prisma: the text of the JSON
      return provider === 'sqlserver' ? { type: 'String', native: '@db.NVarChar(Max)' } : { type: 'Json' }
    case 'array': {
      const inner = fieldType(type.items, provider, enums)
      return { type: `${inner.type}[]` }
    }
    case 'enum': {
      const item = enums.find((candidate) => candidate.name === type.name)
      if (item && hasEnums(provider) && (item.storage === 'check' || item.storage === 'native')) return { type: item.name }
      return item && item.values.every((value) => typeof value === 'number') ? { type: 'Int' } : { type: 'String' }
    }
    case 'primitive':
      switch (type.name) {
        case 'string':
          return type.length && !sqlite
            ? { type: 'String', native: `@db.${provider === 'sqlserver' ? 'NVarChar' : 'VarChar'}(${type.length})` }
            : { type: 'String' }
        case 'integer':
          if (type.bits === 64) return { type: 'BigInt' }
          if ((type.bits === 8 || type.bits === 16) && !sqlite) return { type: 'Int', native: '@db.SmallInt' }
          return { type: 'Int' }
        case 'float':
          return { type: 'Float' }
        case 'decimal':
          return sqlite ? { type: 'Decimal' } : { type: 'Decimal', native: `@db.Decimal(${type.precision ?? 18}, ${type.scale ?? 2})` }
        case 'boolean':
          return { type: 'Boolean' }
        case 'date':
          return sqlite ? { type: 'DateTime' } : { type: 'DateTime', native: '@db.Date' }
        case 'datetime':
          return provider === 'postgresql' ? { type: 'DateTime', native: '@db.Timestamptz' } : { type: 'DateTime' }
        case 'time':
          return sqlite ? { type: 'String' } : { type: 'DateTime', native: '@db.Time' }
        case 'duration':
          return { type: 'String' }
        case 'uuid':
          return provider === 'postgresql'
            ? { type: 'String', native: '@db.Uuid' }
            : provider === 'sqlserver'
              ? { type: 'String', native: '@db.UniqueIdentifier' }
              : { type: 'String' }
        case 'binary':
          return { type: 'Bytes' }
        case 'any':
          return provider === 'sqlserver' ? { type: 'String', native: '@db.NVarChar(Max)' } : { type: 'Json' }
      }
  }
}

function defaultValue(value: Literal, column: Column, enums: PhysicalEnum[], prismaType: string): string | null {
  if (value === null) return null
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  const item =
    column.type.kind === 'enum' ? enums.find((candidate) => candidate.name === (column.type as { name: string }).name) : undefined
  const stored = item?.values.find((candidate) => String(candidate).toLowerCase() === value.toLowerCase()) ?? value
  // An enum default names the member, not the stored value
  if (item && prismaType === item.name) return enumMemberName(String(stored))
  return typeof stored === 'number' ? String(stored) : prismaString(String(stored))
}

function enumMemberName(value: string): string {
  return identifier.test(value) ? value : `value_${value.replace(/\W/g, '_')}`
}

interface ModelBlock {
  name: string
  lines: string[]
  attributes: string[]
}

/** The block of one table: its columns, relation fields and attributes (`@@id`, `@@index`, `@@map`). */
function modelBlock(
  item: EntityClass,
  view: EntityView,
  provider: Provider,
  context: WriteContext,
  backFields: Map<string, string[]>,
): ModelBlock {
  const lines: string[] = []
  const attributes: string[] = []
  const composite = item.table.primaryKey.length > 1
  for (const attribute of item.attributes) lines.push(scalarLine(attribute, view, provider, context))
  for (const navigation of item.navigations) {
    if (navigation.kind !== 'manyToOne') continue
    const fk = item.attributes.find((attribute) => attribute.name === navigation.attribute)!.foreignKey!
    const relation = relationName(item.name, navigation.name)
    const actions = fk.onDelete === 'cascade' ? ', onDelete: Cascade' : fk.onDelete === 'set null' ? ', onDelete: SetNull' : ''
    lines.push(
      `${navigation.name} ${navigation.target}${navigation.nullable ? '?' : ''} @relation(${prismaString(relation)}, fields: [${navigation.attribute}], references: [${referenceAttribute(view, navigation.target, fk.references[0])}]${actions})`,
    )
  }
  // Every relation needs its other side in Prisma; it is named after the design's list when there is one
  for (const back of backFields.get(item.name) ?? []) lines.push(back)
  if (composite)
    attributes.push(
      `@@id([${item.table.primaryKey.map((column) => attributeName(item, column)).join(', ')}]${namesPrimaryKeys(provider) ? `, map: ${prismaString(`pk_${item.table.name}`)}` : ''})`,
    )
  for (const index of item.table.indexes) {
    if (index.columns.length === 1 && item.attributes.find((attribute) => attribute.column.name === index.columns[0])?.unique) continue
    attributes.push(`@@index([${index.columns.map((column) => attributeName(item, column)).join(', ')}], map: ${prismaString(index.name)})`)
  }
  attributes.push(`@@map(${prismaString(item.table.name)})`)
  return { name: item.name, lines, attributes }
}

function scalarLine(attribute: Attribute, view: EntityView, provider: Provider, context: WriteContext): string {
  const { column } = attribute
  const { type, native } = fieldType(column.type, provider, view.enums)
  if (column.type.kind === 'enum' && type !== 'String' && type !== 'Int') {
    const item = view.enums.find((candidate) => candidate.name === (column.type as { name: string }).name)
    if (item?.storage === 'check') context.note({ code: 'ormEnumType', params: { orm: 'Prisma', enum: item.name } })
  }
  const parts = [`${attribute.name} ${type}${column.nullable ? '?' : ''}`]
  if (attribute.primaryKey) parts.push(namesPrimaryKeys(provider) ? `@id(map: ${prismaString(`pk_${tableOf(view, attribute)}`)})` : '@id')
  if (column.generated === 'identity') parts.push('@default(autoincrement())')
  if (column.generated === 'uuid') parts.push('@default(uuid())')
  if (column.generated === 'now') parts.push('@default(now())')
  if (column.defaultValue !== undefined && column.defaultValue !== null) {
    const value = defaultValue(column.defaultValue, column, view.enums, type)
    if (value !== null) parts.push(`@default(${value})`)
  }
  if (attribute.unique) {
    const unique = uniqueName(view, attribute)
    parts.push(unique ? `@unique(map: ${prismaString(unique)})` : '@unique')
  }
  if (attribute.name !== column.name) parts.push(`@map(${prismaString(column.name)})`)
  if (native) parts.push(native)
  return parts.join(' ')
}

function tableOf(view: EntityView, attribute: Attribute): string {
  return view.classes.find((item) => item.attributes.includes(attribute))?.table.name ?? ''
}

function uniqueName(view: EntityView, attribute: Attribute): string | undefined {
  const table = view.classes.find((item) => item.attributes.includes(attribute))?.table
  return table?.uniques.find((unique) => unique.columns.length === 1 && unique.columns[0] === attribute.column.name)?.name
}

function attributeName(item: EntityClass, column: string): string {
  return item.attributes.find((attribute) => attribute.column.name === column)?.name ?? column
}

function referenceAttribute(view: EntityView, target: string, column: string): string {
  const item = view.classes.find((candidate) => candidate.name === target)
  return item ? attributeName(item, column) : column
}

function relationName(owner: string, field: string): string {
  return `${owner}_${field}`
}

/** The class of a join table, so the many-to-many relation keeps the design's table and columns. */
function joinBlock(
  join: Table,
  view: EntityView,
  provider: Provider,
  linkName: string,
  owner: EntityClass,
  other: EntityClass,
): ModelBlock {
  const [first, second] = join.foreignKeys
  const lines: string[] = []
  const names: string[] = []
  for (const [fk, target, side] of [
    [first, owner, 'owner'],
    [second, other, 'other'],
  ] as const) {
    const column = join.columns.find((candidate) => candidate.name === fk.columns[0])!
    const attribute = column.name.replace(/_(\w)/g, (_, char: string) => char.toUpperCase())
    // `tag_code` referring to `code` → `tag`: the column without the key it holds
    const stem = column.name.endsWith(`_${fk.references[0]}`) ? column.name.slice(0, -fk.references[0].length - 1) : `${side}_ref`
    const navigation = stem.replace(/_(\w)/g, (_, char: string) => char.toUpperCase())
    const reference = target.attributes.find((candidate) => candidate.column.name === fk.references[0])!
    const { type, native } = fieldType(column.type, provider, view.enums)
    names.push(attribute)
    lines.push(`${attribute} ${type}${attribute !== column.name ? ` @map(${prismaString(column.name)})` : ''}${native ? ` ${native}` : ''}`)
    lines.push(
      `${navigation} ${target.name} @relation(${prismaString(`${linkName}_${navigation}`)}, fields: [${attribute}], references: [${reference.name}], onDelete: Cascade)`,
    )
  }
  return {
    name: linkName,
    lines,
    attributes: [
      `@@id([${names.join(', ')}]${namesPrimaryKeys(provider) ? `, map: ${prismaString(`pk_${join.name}`)}` : ''})`,
      `@@map(${prismaString(join.name)})`,
    ],
  }
}

function render(block: ModelBlock): string[] {
  const width = Math.max(...block.lines.map((line) => line.split(' ')[0].length))
  const aligned = block.lines.map((line) => {
    const [name, ...rest] = line.split(' ')
    return `  ${name.padEnd(width)} ${rest.join(' ')}`
  })
  return [
    `model ${block.name} {`,
    ...aligned,
    ...(block.attributes.length > 0 ? ['', ...block.attributes.map((line) => `  ${line}`)] : []),
    '}',
  ]
}

function schemaFile(view: EntityView, provider: Provider, context: WriteContext): string {
  const out: string[] = [
    `// Prisma schema written by Model2DB from ${context.title}. Review it, then run \`npx prisma migrate dev --name init\`.`,
    '',
    'datasource db {',
    `  provider = ${prismaString(provider)}`,
    '  url      = env("DATABASE_URL")',
    '}',
    '',
    'generator client {',
    '  provider = "prisma-client-js"',
    '}',
  ]
  for (const item of view.enums) {
    if (!hasEnums(provider) || (item.storage !== 'check' && item.storage !== 'native')) continue
    if (item.values.some((value) => typeof value === 'number')) continue
    const members = enumMembers(item, context.schema)
    out.push('', `enum ${item.name} {`)
    for (const member of members) {
      const name = enumMemberName(String(member.value))
      out.push(`  ${name}${name !== String(member.value) ? ` @map(${prismaString(String(member.value))})` : ''}`)
    }
    out.push(`  @@map(${prismaString(item.sqlName)})`, '}')
  }

  // The other side of every relation, and the link models of the join tables
  const backFields = new Map<string, string[]>()
  const addBack = (model: string, line: string) => backFields.set(model, [...(backFields.get(model) ?? []), line])
  const used = new Map(
    view.classes.map((item) => [item.name, new Set([...item.attributes.map((a) => a.name), ...item.navigations.map((n) => n.name)])]),
  )
  const free = (model: string, name: string) => {
    const set = used.get(model)!
    let candidate = name
    for (let i = 2; set.has(candidate); i++) candidate = `${name}${i}`
    set.add(candidate)
    return candidate
  }
  for (const item of view.classes) {
    for (const navigation of item.navigations) {
      if (navigation.kind !== 'manyToOne') continue
      // The design's list when there is one; otherwise the plural of the model, told apart if it repeats
      const plural = pluralize(`${item.name.charAt(0).toLowerCase()}${item.name.slice(1)}`)
      const suffix = `As${navigation.name.charAt(0).toUpperCase()}${navigation.name.slice(1)}`
      const name = navigation.inverse ?? free(navigation.target, used.get(navigation.target)!.has(plural) ? `${plural}${suffix}` : plural)
      addBack(navigation.target, `${name} ${item.name}[] @relation(${prismaString(relationName(item.name, navigation.name))})`)
    }
  }
  const links: ModelBlock[] = []
  for (const join of view.joins) {
    const [first, second] = join.foreignKeys
    const owner = view.classes.find((item) => item.table.name === first.table)
    const other = view.classes.find((item) => item.table.name === second.table)
    if (!owner || !other) continue
    const linkName = `${owner.name}${other.name === owner.name ? 'Link' : other.name}Link`
    const block = joinBlock(join, view, provider, linkName, owner, other)
    links.push(block)
    // Each side lists the link rows; the navigation is named after the design's list
    const ownerList = owner.navigations.find((navigation) => navigation.kind === 'manyToMany' && navigation.join?.table === join)
    const otherList = other.navigations.find(
      (navigation) => navigation.kind === 'manyToMany' && navigation.join?.table === join && navigation !== ownerList,
    )
    const ownerSide = block.lines[1].split(' ')[0]
    const otherSide = block.lines[3].split(' ')[0]
    addBack(
      owner.name,
      `${ownerList?.name ?? free(owner.name, `${linkName.charAt(0).toLowerCase()}${linkName.slice(1)}s`)} ${linkName}[] @relation(${prismaString(`${linkName}_${ownerSide}`)})`,
    )
    addBack(
      other.name,
      `${otherList?.name ?? free(other.name, `${linkName.charAt(0).toLowerCase()}${linkName.slice(1)}s`)} ${linkName}[] @relation(${prismaString(`${linkName}_${otherSide}`)})`,
    )
  }

  for (const item of view.classes) {
    out.push('')
    for (const todo of item.table.todos) out.push(`// ${todoText(todo, item.table.model, 'table')}`)
    out.push(...render(modelBlock(item, view, provider, context, backFields)))
  }
  for (const block of links) out.push('', ...render(block))
  return out.join('\n') + '\n'
}

export const prismaOutput: RelationalWriter = {
  id: 'prisma',
  label: 'Prisma',
  group: 'typescript',
  engines: ['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver'],
  write(physical, context): GeneratedFile[] {
    const provider = PROVIDERS[context.settings.engine] ?? 'postgresql'
    const view = buildEntities(physical, context.schema, 'camelCase')
    return [{ name: 'prisma/schema.prisma', content: schemaFile(view, provider, context), editorLanguage: 'prisma' }]
  },
}
