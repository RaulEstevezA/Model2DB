import type { Literal } from '../../../model/schema.ts'
import type { Column, ColumnType, Dialect, PhysicalEnum, RelationalSchema } from '../../../physical/types.ts'
import { schemaStatements } from '../../sql/statements.ts'
import { todoText } from '../../todos.ts'
import { fileBase, type GeneratedFile, type RelationalWriter, type WriteContext } from '../../types.ts'
import { buildEntities, enumMembers, type Attribute, type EntityClass, type EntityView } from '../entities.ts'
import { tsEnum, tsKey, tsString, tsType } from './typescript.ts'

/** Sequelize 6 models in TypeScript (`Model.init`), and a migration for sequelize-cli that runs the
 * schema written for the chosen engine. */

function enumWidth(item: PhysicalEnum): number {
  const longest = Math.max(1, ...item.values.map((value) => String(value).length))
  return longest <= 20 ? 20 : longest <= 50 ? 50 : 255
}

function dataType(type: ColumnType, engine: Dialect, enums: PhysicalEnum[]): string {
  switch (type.kind) {
    case 'raw':
    case 'json':
      return engine === 'postgresql' ? 'DataTypes.JSONB' : 'DataTypes.JSON'
    case 'array':
      return `DataTypes.ARRAY(${dataType(type.items, engine, enums)})`
    case 'enum': {
      const item = enums.find((candidate) => candidate.name === type.name)
      if (!item) return 'DataTypes.STRING'
      if (item.values.every((value) => typeof value === 'number')) return 'DataTypes.INTEGER'
      if (item.storage === 'native' && (engine === 'postgresql' || engine === 'mysql' || engine === 'mariadb'))
        return `DataTypes.ENUM(${item.values.map((value) => tsString(String(value))).join(', ')})`
      return `DataTypes.STRING(${enumWidth(item)})`
    }
    case 'primitive':
      switch (type.name) {
        case 'string':
          return type.length ? `DataTypes.STRING(${type.length})` : 'DataTypes.TEXT'
        case 'integer':
          if (type.bits === 64) return 'DataTypes.BIGINT'
          if (type.bits === 8 || type.bits === 16) return 'DataTypes.SMALLINT'
          return 'DataTypes.INTEGER'
        case 'float':
          return type.bits === 32 ? 'DataTypes.FLOAT' : 'DataTypes.DOUBLE'
        case 'decimal':
          return `DataTypes.DECIMAL(${type.precision ?? 18}, ${type.scale ?? 2})`
        case 'boolean':
          return 'DataTypes.BOOLEAN'
        case 'date':
          return 'DataTypes.DATEONLY'
        case 'datetime':
          return 'DataTypes.DATE'
        case 'time':
          return 'DataTypes.TIME'
        case 'duration':
          return 'DataTypes.STRING(50)'
        case 'uuid':
          return 'DataTypes.UUID'
        case 'binary':
          return 'DataTypes.BLOB'
        case 'any':
          return engine === 'postgresql' ? 'DataTypes.JSONB' : 'DataTypes.JSON'
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

/** `declare` lines of the class: the attributes and the associations, with what can be left out when creating. */
function declarations(item: EntityClass, view: EntityView): string[] {
  const lines = item.attributes.map((attribute) => {
    const { column } = attribute
    let type = tsType(column.type, view.enums)
    if (column.nullable) type = `${type} | null`
    const optional = column.generated || column.nullable || (column.defaultValue !== undefined && column.defaultValue !== null)
    return `  declare ${tsKey(attribute.name)}: ${optional ? `CreationOptional<${type}>` : type}`
  })
  for (const navigation of item.navigations) {
    const type = navigation.kind === 'manyToOne' ? `${navigation.target}${navigation.nullable ? ' | null' : ''}` : `${navigation.target}[]`
    lines.push(`  declare ${tsKey(navigation.name)}?: NonAttribute<${type}>`)
  }
  return lines
}

function attributeLine(attribute: Attribute, view: EntityView, engine: Dialect): string {
  const { column } = attribute
  const settings = [`type: ${dataType(column.type, engine, view.enums)}`, `field: ${tsString(column.name)}`]
  if (attribute.primaryKey || attribute.compositeKey) settings.push('primaryKey: true')
  if (column.generated === 'identity') settings.push('autoIncrement: true')
  settings.push(`allowNull: ${column.nullable ? 'true' : 'false'}`)
  if (column.generated === 'uuid') settings.push('defaultValue: DataTypes.UUIDV4')
  if (column.generated === 'now') settings.push('defaultValue: DataTypes.NOW')
  if (column.defaultValue !== undefined && column.defaultValue !== null) {
    const value = literal(column.defaultValue, column, view.enums)
    if (value !== null) settings.push(`defaultValue: ${value}`)
  }
  const enumItem = attribute.enum
  if (enumItem && enumItem.storage === 'check')
    settings.push(
      `validate: { isIn: [[${enumItem.values.map((value) => (typeof value === 'number' ? value : tsString(String(value)))).join(', ')}]] }`,
    )
  return `      ${tsKey(attribute.name)}: { ${settings.join(', ')} },`
}

function associationLines(item: EntityClass, view: EntityView): string[] {
  const lines: string[] = []
  for (const navigation of item.navigations) {
    if (navigation.kind === 'manyToOne') {
      const attribute = item.attributes.find((candidate) => candidate.name === navigation.attribute)!
      const fk = attribute.foreignKey!
      const target = view.classes.find((candidate) => candidate.name === navigation.target)!
      const targetKey = target.attributes.find((candidate) => candidate.column.name === fk.references[0])?.name ?? fk.references[0]
      const onDelete = fk.onDelete ? `, onDelete: ${tsString(fk.onDelete.toUpperCase())}` : ''
      lines.push(
        `  ${item.name}.belongsTo(${navigation.target}, { as: ${tsString(navigation.name)}, foreignKey: ${tsString(attribute.name)}, targetKey: ${tsString(targetKey)}${onDelete} })`,
      )
    } else if (navigation.kind === 'oneToMany') {
      const target = view.classes.find((candidate) => candidate.name === navigation.target)!
      const attribute = target.attributes.find((candidate) => candidate.name === navigation.attribute)!
      lines.push(
        `  ${item.name}.hasMany(${navigation.target}, { as: ${tsString(navigation.name)}, foreignKey: ${tsString(attribute.name)} })`,
      )
    } else {
      const join = navigation.join!
      const key = (name: string, column: string) =>
        view.classes.find((candidate) => candidate.name === name)!.attributes.find((candidate) => candidate.column.name === column)?.name ??
        column
      const [first, second] = join.table.foreignKeys
      const ownerFk = join.ownerColumn === first.columns[0] ? first : second
      const targetFk = ownerFk === first ? second : first
      lines.push(
        `  ${item.name}.belongsToMany(${navigation.target}, { as: ${tsString(navigation.name)}, through: ${tsString(join.table.name)}, foreignKey: ${tsString(join.ownerColumn)}, otherKey: ${tsString(join.targetColumn)}, sourceKey: ${tsString(key(item.name, ownerFk.references[0]))}, targetKey: ${tsString(key(navigation.target, targetFk.references[0]))}, timestamps: false })`,
      )
    }
  }
  return lines
}

function modelsFile(view: EntityView, engine: Dialect, context: WriteContext): string {
  const body: string[] = []
  for (const item of view.enums) {
    if (item.storage !== 'check' && item.storage !== 'native') continue
    body.push('', ...tsEnum(item.name, enumMembers(item, context.schema)))
  }
  for (const item of view.classes) {
    body.push('')
    for (const todo of item.table.todos) body.push(`// ${todoText(todo, item.table.model, 'table')}`)
    body.push(
      `export class ${item.name} extends Model<InferAttributes<${item.name}>, InferCreationAttributes<${item.name}>> {`,
      ...declarations(item, view),
      '}',
    )
  }
  body.push(
    '',
    '/** Defines every model and its associations on a Sequelize instance. */',
    'export function initModels(sequelize: Sequelize): void {',
  )
  for (const item of view.classes) {
    const indexes = item.table.indexes.map(
      (index) => `{ name: ${tsString(index.name)}, unique: ${index.unique}, fields: [${index.columns.map(tsString).join(', ')}] }`,
    )
    const uniques = item.table.uniques.map(
      (unique) => `{ name: ${tsString(unique.name)}, unique: true, fields: [${unique.columns.map(tsString).join(', ')}] }`,
    )
    const all = [...uniques, ...indexes]
    body.push(
      `  ${item.name}.init(`,
      '    {',
      ...item.attributes.map((attribute) => attributeLine(attribute, view, engine)),
      '    },',
      `    { sequelize, tableName: ${tsString(item.table.name)}, timestamps: false${all.length > 0 ? `, indexes: [${all.join(', ')}]` : ''} },`,
      '  )',
    )
  }
  for (const item of view.classes) body.push(...associationLines(item, view))
  body.push('}')
  const usesNonAttribute = view.classes.some((item) => item.navigations.length > 0)
  const header = [
    `// Sequelize models written by Model2DB from ${context.title}. Review them before using them.`,
    `import { DataTypes, Model, Sequelize, type CreationOptional, type InferAttributes, type InferCreationAttributes${usesNonAttribute ? ', type NonAttribute' : ''} } from 'sequelize'`,
  ]
  return [...header, ...body, ''].join('\n')
}

/** A sequelize-cli migration that creates the tables with the engine's own DDL and drops them on the way back. */
function migrationFile(physical: RelationalSchema, engine: Dialect, context: WriteContext): string {
  const { up, down } = schemaStatements(physical, engine, context.title)
  const quote = (sql: string) => '`' + sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`'
  return [
    `// Migration written by Model2DB from ${context.title}: the schema as Model2DB writes it for this engine.`,
    "'use strict'",
    '',
    'const UP = [',
    ...up.map((sql) => `  ${quote(sql)},`),
    ']',
    '',
    'const DOWN = [',
    ...down.map((sql) => `  ${quote(sql)},`),
    ']',
    '',
    "/** @type {import('sequelize-cli').Migration} */",
    'module.exports = {',
    '  async up(queryInterface) {',
    '    for (const sql of UP) await queryInterface.sequelize.query(sql)',
    '  },',
    '  async down(queryInterface) {',
    '    for (const sql of DOWN) await queryInterface.sequelize.query(sql)',
    '  },',
    '}',
    '',
  ].join('\n')
}

export const sequelizeOutput: RelationalWriter = {
  id: 'sequelize',
  label: 'Sequelize',
  group: 'typescript',
  engines: ['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle'],
  migrations: true,
  write(physical, context): GeneratedFile[] {
    const engine = context.settings.engine
    const view = buildEntities(physical, context.schema, 'camelCase')
    const files: GeneratedFile[] = [
      { name: `models/${fileBase(context.title)}.models.ts`, content: modelsFile(view, engine, context), editorLanguage: 'typescript' },
    ]
    if (context.settings.migrations)
      files.push({
        name: `migrations/20250101000000-create-${fileBase(context.title).replace(/_/g, '-')}-schema.js`,
        content: migrationFile(physical, engine, context),
        editorLanguage: 'javascript',
      })
    return files
  },
}
