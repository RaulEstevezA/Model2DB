import type { Literal } from '../../../model/schema.ts'
import type { Column, ColumnType, Dialect, PhysicalEnum, RelationalSchema } from '../../../physical/types.ts'
import { schemaStatements } from '../../sql/statements.ts'
import { todoText } from '../../todos.ts'
import { fileBase, type GeneratedFile, type RelationalWriter, type WriteContext } from '../../types.ts'
import { buildEntities, enumMembers, type Attribute, type EntityClass, type EntityView } from '../entities.ts'
import { tsEnum, tsString, tsType } from './typescript.ts'

/** TypeORM entities, and a migration that runs the schema written for the chosen engine. */

function enumWidth(item: PhysicalEnum): number {
  const longest = Math.max(1, ...item.values.map((value) => String(value).length))
  return longest <= 20 ? 20 : longest <= 50 ? 50 : 255
}

/** The column options that say its type for the driver of the engine (`{ type: 'varchar', length: 20 }`). */
function columnType(type: ColumnType, engine: Dialect, enums: PhysicalEnum[]): string[] {
  const pg = engine === 'postgresql'
  const my = engine === 'mysql' || engine === 'mariadb'
  const ms = engine === 'sqlserver'
  const ora = engine === 'oracle'
  const sqlite = engine === 'sqlite'
  const t = (name: string, ...more: string[]) => [`type: ${tsString(name)}`, ...more]
  const text = () => (ms ? t('nvarchar', "length: 'MAX'") : ora ? t('clob') : t('text'))
  switch (type.kind) {
    case 'raw':
    case 'json':
      return pg ? t('jsonb') : my ? t('json') : sqlite ? t('simple-json') : text()
    case 'array':
      return [...columnType(type.items, engine, enums), 'array: true']
    case 'enum': {
      const item = enums.find((candidate) => candidate.name === type.name)
      if (item?.storage === 'native' && (pg || my)) return t('enum', `enum: ${item.name}`, `enumName: ${tsString(item.sqlName)}`)
      if (item?.values.every((value) => typeof value === 'number'))
        return ora ? t('number', 'precision: 10') : t(ms || my ? 'int' : 'integer')
      return t(ora ? 'varchar2' : ms ? 'nvarchar' : 'varchar', `length: ${item ? enumWidth(item) : 255}`)
    }
    case 'primitive':
      switch (type.name) {
        case 'string':
          if (!type.length) return text()
          return t(ora ? 'varchar2' : ms ? 'nvarchar' : 'varchar', `length: ${type.length}`)
        case 'integer':
          if (ora) return t('number', `precision: ${type.bits === 64 ? 19 : type.bits === 16 ? 5 : 10}`)
          if (type.bits === 64) return t('bigint')
          if (type.bits === 8 || type.bits === 16) return t('smallint')
          return t(ms || my ? 'int' : 'integer')
        case 'float':
          return pg ? t('double precision') : my ? t('double') : sqlite ? t('real') : t('float')
        case 'decimal':
          return t(ora ? 'number' : 'decimal', `precision: ${type.precision ?? 18}`, `scale: ${type.scale ?? 2}`)
        case 'boolean':
          return ms ? t('bit') : ora ? t('number', 'precision: 1') : t('boolean')
        case 'date':
          return t('date')
        case 'datetime':
          return pg
            ? t('timestamptz')
            : my
              ? t('datetime', 'precision: 6')
              : sqlite
                ? t('datetime')
                : ms
                  ? t('datetimeoffset')
                  : t('timestamp with time zone')
        case 'time':
          return ora ? t('varchar2', 'length: 15') : t('time')
        case 'duration':
          return pg ? t('interval') : t(ora ? 'varchar2' : ms ? 'nvarchar' : 'varchar', 'length: 50')
        case 'uuid':
          return pg
            ? t('uuid')
            : engine === 'mariadb'
              ? t('uuid')
              : ms
                ? t('uniqueidentifier')
                : ora
                  ? t('raw', 'length: 16')
                  : t(my ? 'char' : 'varchar', 'length: 36')
        case 'binary':
          return pg ? t('bytea') : ms ? t('varbinary', "length: 'MAX'") : t('blob')
        case 'any':
          return pg ? t('jsonb') : my ? t('json') : sqlite ? t('simple-json') : text()
      }
  }
}

function literal(value: Literal, column: Column, enums: PhysicalEnum[]): string | null {
  if (value === null) return null
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  const item =
    column.type.kind === 'enum' ? enums.find((candidate) => candidate.name === (column.type as { name: string }).name) : undefined
  const stored = item?.values.find((candidate) => String(candidate).toLowerCase() === value.toLowerCase()) ?? value
  return typeof stored === 'number' ? String(stored) : tsString(String(stored))
}

interface Writer {
  view: EntityView
  engine: Dialect
  decorators: Set<string>
}

function columnLines(attribute: Attribute, writer: Writer): string[] {
  const { column } = attribute
  const options = [`name: ${tsString(column.name)}`, ...columnType(column.type, writer.engine, writer.view.enums)]
  if (column.nullable) options.push('nullable: true')
  if (column.generated === 'now') options.push("default: () => 'CURRENT_TIMESTAMP'")
  if (column.defaultValue !== undefined && column.defaultValue !== null) {
    const value = literal(column.defaultValue, column, writer.view.enums)
    if (value !== null) options.push(`default: ${value}`)
  }
  let decorator = 'Column'
  if (attribute.primaryKey && column.generated === 'identity') {
    decorator = 'PrimaryGeneratedColumn'
    // A generated key takes only its type: TypeORM does not accept a precision there
    options.splice(1, options.length - 1, columnType(column.type, writer.engine, writer.view.enums)[0])
  } else if (attribute.primaryKey && column.generated === 'uuid') {
    writer.decorators.add('PrimaryGeneratedColumn')
    return [`@PrimaryGeneratedColumn('uuid', { name: ${tsString(column.name)} })`, `${attribute.name}!: string`]
  } else if (attribute.primaryKey || attribute.compositeKey) decorator = 'PrimaryColumn'
  writer.decorators.add(decorator)
  const type = tsType(column.type, writer.view.enums)
  return [`@${decorator}({ ${options.join(', ')} })`, `${attribute.name}!: ${type}${column.nullable ? ' | null' : ''}`]
}

function relationLines(navigation: EntityClass['navigations'][number], item: EntityClass, writer: Writer): string[] {
  const target = navigation.target
  switch (navigation.kind) {
    case 'manyToOne': {
      writer.decorators.add('ManyToOne').add('JoinColumn')
      const attribute = item.attributes.find((candidate) => candidate.name === navigation.attribute)!
      const fk = attribute.foreignKey!
      const options = [
        `nullable: ${navigation.nullable ? 'true' : 'false'}`,
        ...(fk.onDelete ? [`onDelete: ${tsString(fk.onDelete.toUpperCase())}`] : []),
      ]
      const inverse = navigation.inverse ? `, (other) => other.${navigation.inverse}` : ''
      return [
        `@ManyToOne(() => ${target}${inverse}, { ${options.join(', ')} })`,
        `@JoinColumn({ name: ${tsString(attribute.column.name)}, referencedColumnName: ${tsString(referenced(writer.view, target, fk.references[0]))} })`,
        `${navigation.name}!: ${target}${navigation.nullable ? ' | null' : ''}`,
      ]
    }
    case 'oneToMany':
      writer.decorators.add('OneToMany')
      return [`@OneToMany(() => ${target}, (other) => other.${navigation.inverse})`, `${navigation.name}!: ${target}[]`]
    case 'manyToMany': {
      writer.decorators.add('ManyToMany')
      const join = navigation.join!
      const owner = join.ownerColumn === join.table.foreignKeys[0].columns[0]
      const inverse = navigation.inverse ? `, (other) => other.${navigation.inverse}` : ''
      const lines = [`@ManyToMany(() => ${target}${inverse})`]
      if (owner) {
        writer.decorators.add('JoinTable')
        const [first, second] = join.table.foreignKeys
        lines.push(
          `@JoinTable({ name: ${tsString(join.table.name)}, joinColumn: { name: ${tsString(first.columns[0])}, referencedColumnName: ${tsString(referenced(writer.view, item.name, first.references[0]))} }, inverseJoinColumn: { name: ${tsString(second.columns[0])}, referencedColumnName: ${tsString(referenced(writer.view, target, second.references[0]))} } })`,
        )
      }
      return [...lines, `${navigation.name}!: ${target}[]`]
    }
  }
}

/** The property of a class that maps a column, for `referencedColumnName`. */
function referenced(view: EntityView, className: string, column: string): string {
  return (
    view.classes.find((item) => item.name === className)?.attributes.find((attribute) => attribute.column.name === column)?.name ?? column
  )
}

function entitiesFile(view: EntityView, engine: Dialect, context: WriteContext): string {
  const writer: Writer = { view, engine, decorators: new Set(['Entity']) }
  const body: string[] = []
  for (const item of view.enums) {
    if (item.storage !== 'check' && item.storage !== 'native') continue
    body.push('', ...tsEnum(item.name, enumMembers(item, context.schema)))
  }
  for (const item of view.classes) {
    body.push('')
    for (const todo of item.table.todos) body.push(`// ${todoText(todo, item.table.model, 'table')}`)
    for (const check of item.table.checks) {
      writer.decorators.add('Check')
      const values = check.values.map((value) => (typeof value === 'number' ? value : `'${String(value).replace(/'/g, "''")}'`)).join(', ')
      body.push(`@Check(${tsString(check.name)}, ${tsString(`${check.column} IN (${values})`)})`)
    }
    for (const unique of item.table.uniques) {
      writer.decorators.add('Unique')
      body.push(
        `@Unique(${tsString(unique.name)}, [${unique.columns.map((column) => tsString(referenced(view, item.name, column))).join(', ')}])`,
      )
    }
    for (const index of item.table.indexes) {
      writer.decorators.add('Index')
      body.push(
        `@Index(${tsString(index.name)}, [${index.columns.map((column) => tsString(referenced(view, item.name, column))).join(', ')}])`,
      )
    }
    body.push(`@Entity({ name: ${tsString(item.table.name)} })`, `export class ${item.name} {`)
    const members = [
      ...item.attributes.map((attribute) => columnLines(attribute, writer)),
      ...item.navigations.map((navigation) => relationLines(navigation, item, writer)),
    ]
    body.push(members.map((lines) => lines.map((line) => `  ${line}`).join('\n')).join('\n\n'), '}')
  }
  const header = [
    `// TypeORM entities written by Model2DB from ${context.title}. Review them before using them.`,
    `import { ${[...writer.decorators].sort().join(', ')} } from 'typeorm'`,
  ]
  return [...header, ...body, ''].join('\n')
}

/** A migration that creates the tables with the engine's own DDL and drops them on the way back. */
function migrationFile(physical: RelationalSchema, engine: Dialect, context: WriteContext): { name: string; content: string } {
  const className = `Create${context.title.replace(/\W/g, '')}Schema1735689600000`
  const { up, down } = schemaStatements(physical, engine, context.title)
  const quote = (sql: string) => '`' + sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`'
  return {
    name: `migrations/1735689600000-Create${context.title.replace(/\W/g, '')}Schema.ts`,
    content: [
      `// Migration written by Model2DB from ${context.title}: the schema as Model2DB writes it for this engine.`,
      "import type { MigrationInterface, QueryRunner } from 'typeorm'",
      '',
      `export class ${className} implements MigrationInterface {`,
      '  async up(queryRunner: QueryRunner): Promise<void> {',
      ...up.map((sql) => `    await queryRunner.query(${quote(sql)})`),
      '  }',
      '',
      '  async down(queryRunner: QueryRunner): Promise<void> {',
      ...down.map((sql) => `    await queryRunner.query(${quote(sql)})`),
      '  }',
      '}',
      '',
    ].join('\n'),
  }
}

export const typeormOutput: RelationalWriter = {
  id: 'typeorm',
  label: 'TypeORM',
  group: 'typescript',
  engines: ['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle'],
  migrations: true,
  write(physical, context): GeneratedFile[] {
    const engine = context.settings.engine
    const view = buildEntities(physical, context.schema, 'camelCase')
    const files: GeneratedFile[] = [
      {
        name: `entities/${fileBase(context.title)}.entities.ts`,
        content: entitiesFile(view, engine, context),
        editorLanguage: 'typescript',
      },
    ]
    if (context.settings.migrations) files.push({ ...migrationFile(physical, engine, context), editorLanguage: 'typescript' })
    return files
  },
}
