import type { Literal } from '../../../model/schema.ts'
import type { Column, ColumnType, PhysicalEnum } from '../../../physical/types.ts'
import { todoText } from '../../todos.ts'
import type { GeneratedFile, RelationalWriter, WriteContext } from '../../types.ts'
import { buildEntities, enumMembers, type Attribute, type EntityClass, type EntityView } from '../entities.ts'
import { pyIdentifier, pyString, pythonEnum } from './python.ts'

/** Tortoise ORM models. Tortoise has no composite primary keys and creates no CHECK for enums: both are
 * said in the result's notes. Aerich writes the migrations from the models (`aerich init-db`), so none
 * is written here. */

const APP = 'models'

function enumLength(item: PhysicalEnum): number {
  const longest = Math.max(1, ...item.values.map((value) => String(value).length))
  return longest <= 20 ? 20 : longest <= 50 ? 50 : 255
}

function literal(value: Literal, column: Column, enums: PhysicalEnum[]): string {
  if (value === null) return 'None'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'number') return String(value)
  const item =
    column.type.kind === 'enum' ? enums.find((candidate) => candidate.name === (column.type as { name: string }).name) : undefined
  const stored = item?.values.find((candidate) => String(candidate).toLowerCase() === value.toLowerCase())
  // Enum fields take a member of the Python enum, built from its stored value
  if (item && (item.storage === 'check' || item.storage === 'native') && stored !== undefined)
    return `${pyIdentifier(item.name)}(${typeof stored === 'number' ? stored : pyString(String(stored))})`
  return typeof stored === 'number' ? String(stored) : pyString(String(stored ?? value))
}

/** The Tortoise field class and its type arguments for a column. */
function fieldType(type: ColumnType, enums: PhysicalEnum[]): { name: string; args: string[] } {
  switch (type.kind) {
    case 'raw':
    case 'json':
    case 'array':
      return { name: 'fields.JSONField', args: [] }
    case 'enum': {
      const item = enums.find((candidate) => candidate.name === type.name)
      if (!item) return { name: 'fields.CharField', args: ['max_length=255'] }
      const numeric = item.values.every((value) => typeof value === 'number')
      if (item.storage === 'lookup' || item.storage === 'text')
        return numeric ? { name: 'fields.IntField', args: [] } : { name: 'fields.CharField', args: [`max_length=${enumLength(item)}`] }
      return numeric
        ? { name: 'fields.IntEnumField', args: [pyIdentifier(item.name)] }
        : { name: 'fields.CharEnumField', args: [pyIdentifier(item.name), `max_length=${enumLength(item)}`] }
    }
    case 'primitive':
      switch (type.name) {
        case 'string':
          return type.length ? { name: 'fields.CharField', args: [`max_length=${type.length}`] } : { name: 'fields.TextField', args: [] }
        case 'integer':
          if (type.bits === 64) return { name: 'fields.BigIntField', args: [] }
          if (type.bits === 8 || type.bits === 16) return { name: 'fields.SmallIntField', args: [] }
          return { name: 'fields.IntField', args: [] }
        case 'float':
          return { name: 'fields.FloatField', args: [] }
        case 'decimal':
          return { name: 'fields.DecimalField', args: [`max_digits=${type.precision ?? 18}`, `decimal_places=${type.scale ?? 2}`] }
        case 'boolean':
          return { name: 'fields.BooleanField', args: [] }
        case 'date':
          return { name: 'fields.DateField', args: [] }
        case 'datetime':
          return { name: 'fields.DatetimeField', args: [] }
        case 'time':
          return { name: 'fields.TimeField', args: [] }
        case 'duration':
          return { name: 'fields.TimeDeltaField', args: [] }
        case 'uuid':
          return { name: 'fields.UUIDField', args: [] }
        case 'binary':
          return { name: 'fields.BinaryField', args: [] }
        case 'any':
          return { name: 'fields.JSONField', args: [] }
      }
  }
}

const ON_DELETE = { cascade: 'fields.CASCADE', 'set null': 'fields.SET_NULL' } as const

function fieldLines(item: EntityClass, view: EntityView): string[] {
  const lines: string[] = []
  for (const attribute of item.attributes) {
    // Tortoise adds its own `id` to tables with a composite key; the parts stay ordinary fields
    const line = attribute.foreignKey ? foreignKeyLine(attribute, item, view) : scalarLine(attribute, view)
    if (line) lines.push(`    ${line}`)
  }
  for (const navigation of item.navigations) {
    const join = navigation.join
    // A many-to-many list is declared once, on the side that owns the join table
    if (navigation.kind !== 'manyToMany' || !join || join.ownerColumn !== join.table.foreignKeys[0].columns[0]) continue
    const settings = [
      pyString(`${APP}.${navigation.target}`),
      `through=${pyString(join.table.name)}`,
      `forward_key=${pyString(join.targetColumn)}`,
      `backward_key=${pyString(join.ownerColumn)}`,
      `related_name=${navigation.inverse ? pyString(navigation.inverse) : 'False'}`,
      'on_delete=fields.CASCADE',
    ]
    lines.push(`    ${pyIdentifier(navigation.name)} = fields.ManyToManyField(${settings.join(', ')})`)
  }
  return lines
}

function scalarLine(attribute: Attribute, view: EntityView): string {
  const { column } = attribute
  let type = fieldType(column.type, view.enums)
  // TextField cannot be a key, unique or indexed in Tortoise: a bounded text can
  if (type.name === 'fields.TextField' && (attribute.primaryKey || attribute.unique || attribute.indexed))
    type = { name: 'fields.CharField', args: ['max_length=255'] }
  const settings = [...type.args]
  if (attribute.primaryKey) {
    settings.push('primary_key=True')
    // Tortoise numbers integer keys itself unless told not to
    if (column.type.kind === 'primitive' && column.type.name === 'integer' && column.generated !== 'identity')
      settings.push('generated=False')
  }
  if (column.nullable) settings.push('null=True')
  if (attribute.unique) settings.push('unique=True')
  if (attribute.indexed && !attribute.unique) settings.push('db_index=True')
  if (column.generated === 'now') settings.push('auto_now_add=True')
  if (column.defaultValue !== undefined && column.defaultValue !== null)
    settings.push(`default=${literal(column.defaultValue, column, view.enums)}`)
  if (attribute.name !== column.name) settings.push(`source_field=${pyString(column.name)}`)
  return `${pyIdentifier(attribute.name)} = ${type.name}(${settings.join(', ')})`
}

function foreignKeyLine(attribute: Attribute, item: EntityClass, view: EntityView): string | null {
  const fk = attribute.foreignKey!
  const target = view.classes.find((candidate) => candidate.table.name === fk.table)
  if (!target) return null
  const navigation = item.navigations.find((candidate) => candidate.kind === 'manyToOne' && candidate.attribute === attribute.name)
  // Tortoise names the attribute after the related object and adds `_id` for the column
  const name = navigation?.name ?? attribute.name.replace(/_id$/, '')
  const settings = [
    pyString(`${APP}.${target.name}`),
    `related_name=${navigation?.inverse ? pyString(navigation.inverse) : 'False'}`,
    `on_delete=${fk.onDelete ? ON_DELETE[fk.onDelete] : 'fields.RESTRICT'}`,
  ]
  if (attribute.column.nullable) settings.push('null=True')
  if (attribute.primaryKey) settings.push('primary_key=True')
  if (attribute.unique) settings.push('unique=True')
  if (attribute.indexed && !attribute.unique) settings.push('db_index=True')
  if (`${name}_id` !== attribute.column.name) settings.push(`source_field=${pyString(attribute.column.name)}`)
  return `${pyIdentifier(name)} = fields.ForeignKeyField(${settings.join(', ')})`
}

function modelsFile(view: EntityView, context: WriteContext): string {
  const body: string[] = []
  const enums = view.enums.filter((item) => item.storage === 'check' || item.storage === 'native')
  for (const item of enums) {
    const members = enumMembers(item, context.schema)
    const numeric = members.every((member) => typeof member.value === 'number')
    body.push(
      '',
      '',
      ...pythonEnum(item.name, members).map((line, i) =>
        i === 0 ? line.replace('(enum.Enum)', numeric ? '(enum.IntEnum)' : '(str, enum.Enum)') : line,
      ),
    )
    context.note({ code: 'enumCheckedInCode', params: { enum: item.name, orm: 'Tortoise ORM' } })
  }
  for (const item of view.classes) {
    const composite = item.table.primaryKey.length > 1
    body.push('', '')
    for (const todo of item.table.todos) body.push(`# ${todoText(todo, item.table.model, 'table')}`)
    body.push(
      `class ${item.name}(Model):`,
      ...fieldLines(item, view),
      '',
      '    class Meta:',
      `        table = ${pyString(item.table.name)}`,
    )
    if (composite) {
      const names = item.table.primaryKey.map((column) => {
        const attribute = item.attributes.find((candidate) => candidate.column.name === column)!
        const navigation = item.navigations.find((candidate) => candidate.kind === 'manyToOne' && candidate.attribute === attribute.name)
        return navigation?.name ?? (attribute.foreignKey ? attribute.name.replace(/_id$/, '') : attribute.name)
      })
      body.push(`        unique_together = ((${names.map(pyString).join(', ')}),)`)
      context.note({
        code: 'compositeKeyAsId',
        params: { orm: 'Tortoise ORM', table: item.table.name, columns: item.table.primaryKey.join(', ') },
      })
    }
  }
  const header = [
    `"""Tortoise ORM models written by Model2DB from ${context.title}. Register them as the "${APP}" app.`,
    '',
    'Create the tables with Aerich (`aerich init-db`) or `Tortoise.generate_schemas()`. Review them before using them.',
    '"""',
    '',
    ...(enums.length > 0 ? ['import enum', ''] : []),
    'from tortoise import fields',
    'from tortoise.models import Model',
  ]
  return [...header, ...body, ''].join('\n')
}

export const tortoiseOutput: RelationalWriter = {
  id: 'tortoise',
  label: 'Tortoise ORM',
  group: 'python',
  engines: ['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle'],
  write(physical, context): GeneratedFile[] {
    const view = buildEntities(physical, context.schema, 'snake_case')
    return [{ name: 'models.py', content: modelsFile(view, context), editorLanguage: 'python' }]
  },
}
