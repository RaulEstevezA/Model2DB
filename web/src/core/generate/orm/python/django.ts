import type { Literal } from '../../../model/schema.ts'
import type { Column, ColumnType, PhysicalEnum, RelationalSchema, Table } from '../../../physical/types.ts'
import { todoText } from '../../todos.ts'
import type { GeneratedFile, RelationalWriter, WriteContext } from '../../types.ts'
import { buildEntities, enumMembers, type EntityClass, type EntityView } from '../entities.ts'
import { orderTables, pyIdentifier, pyString } from './python.ts'

/** Django models (5.2 or later, for composite primary keys) and the initial migration. The migration is
 * written for an app labelled `app`: rename it to yours in both files. */

const APP = 'app'

interface Field {
  name: string
  /** Many-to-many: in the migration it is added once the join model exists */
  manyToMany?: boolean
  /** `models.CharField(max_length=255)`, with the target class as it must be written in each file */
  expression: (target: (name: string) => string) => string
}

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
  return typeof stored === 'number' ? String(stored) : pyString(String(stored ?? value))
}

/** The Django field class and its type arguments for a column. */
function fieldType(
  type: ColumnType,
  enums: PhysicalEnum[],
  migration: boolean,
  labels: Map<string, string> = new Map(),
): { name: string; args: string[] } {
  switch (type.kind) {
    case 'raw':
    case 'json':
      return { name: 'models.JSONField', args: [] }
    case 'array': {
      const inner = fieldType(type.items, enums, migration, labels)
      return { name: 'ArrayField', args: [`${inner.name}(${inner.args.join(', ')})`] }
    }
    case 'enum': {
      const item = enums.find((candidate) => candidate.name === type.name)
      if (!item) return { name: 'models.CharField', args: ['max_length=255'] }
      const numeric = item.values.every((value) => typeof value === 'number')
      const choices = migration
        ? `choices=[${item.values.map((value) => `(${typeof value === 'number' ? value : pyString(String(value))}, ${pyString(labels.get(`${item.name}.${value}`) ?? String(value))})`).join(', ')}]`
        : `choices=${pyIdentifier(item.name)}.choices`
      return numeric
        ? { name: 'models.IntegerField', args: [choices] }
        : { name: 'models.CharField', args: [`max_length=${enumLength(item)}`, choices] }
    }
    case 'primitive':
      switch (type.name) {
        case 'string':
          return type.length ? { name: 'models.CharField', args: [`max_length=${type.length}`] } : { name: 'models.TextField', args: [] }
        case 'integer':
          if (type.bits === 64) return { name: 'models.BigIntegerField', args: [] }
          if (type.bits === 8 || type.bits === 16) return { name: 'models.SmallIntegerField', args: [] }
          return { name: 'models.IntegerField', args: [] }
        case 'float':
          return { name: 'models.FloatField', args: [] }
        case 'decimal':
          return { name: 'models.DecimalField', args: [`max_digits=${type.precision ?? 18}`, `decimal_places=${type.scale ?? 2}`] }
        case 'boolean':
          return { name: 'models.BooleanField', args: [] }
        case 'date':
          return { name: 'models.DateField', args: [] }
        case 'datetime':
          return { name: 'models.DateTimeField', args: [] }
        case 'time':
          return { name: 'models.TimeField', args: [] }
        case 'duration':
          return { name: 'models.DurationField', args: [] }
        case 'uuid':
          return { name: 'models.UUIDField', args: [] }
        case 'binary':
          return { name: 'models.BinaryField', args: [] }
        case 'any':
          return { name: 'models.JSONField', args: [] }
      }
  }
}

const ON_DELETE = { cascade: 'models.CASCADE', 'set null': 'models.SET_NULL' } as const

/** The fields of a class: plain columns, foreign keys (named after their navigation) and many-to-many lists. */
function fieldsOf(item: EntityClass, view: EntityView, migration: boolean, labels?: Map<string, string>): Field[] {
  const fields: Field[] = []
  for (const attribute of item.attributes) {
    const { column } = attribute
    const navigation = item.navigations.find((candidate) => candidate.kind === 'manyToOne' && candidate.attribute === attribute.name)
    const fk = attribute.foreignKey
    const target = fk && view.classes.find((candidate) => candidate.table.name === fk.table)
    const common: string[] = []
    if (attribute.primaryKey) common.push('primary_key=True', ...(migration ? ['serialize=False'] : []))
    if (column.nullable) common.push('null=True', 'blank=True')
    if (attribute.unique) common.push('unique=True')
    if (column.defaultValue !== undefined && column.defaultValue !== null)
      common.push(`default=${literal(column.defaultValue, column, view.enums)}`)
    if (fk && target) {
      // Django names the attribute after the related object and adds `_id` for the column
      const name = navigation?.name ?? attribute.name.replace(/_id$/, '') ?? attribute.name
      const related = navigation?.inverse ? `related_name=${pyString(navigation.inverse)}` : `related_name="+"`
      const onDelete = fk.onDelete ? ON_DELETE[fk.onDelete] : 'models.PROTECT'
      const columnName = `${name}_id` === column.name ? [] : [`db_column=${pyString(column.name)}`]
      fields.push({
        name,
        expression: (cls) =>
          `models.ForeignKey(${[cls(target.name), `on_delete=${onDelete}`, related, ...columnName, ...common.filter((setting) => !setting.startsWith('default='))].join(', ')})`,
      })
      continue
    }
    let type = fieldType(column.type, view.enums, migration, labels)
    if (attribute.primaryKey && column.generated === 'identity')
      type = { name: column.type.kind === 'primitive' && column.type.bits === 64 ? 'models.BigAutoField' : 'models.AutoField', args: [] }
    const extra = [...type.args, ...common]
    if (column.generated === 'uuid') extra.push('default=uuid.uuid4')
    if (column.generated === 'now') extra.push('auto_now_add=True')
    if (attribute.indexed && !attribute.unique) extra.push('db_index=True')
    if (attribute.name !== column.name) extra.push(`db_column=${pyString(column.name)}`)
    fields.push({ name: attribute.name, expression: () => `${type.name}(${extra.join(', ')})` })
  }
  for (const navigation of item.navigations) {
    if (
      navigation.kind !== 'manyToMany' ||
      !navigation.join ||
      navigation.join.ownerColumn !== navigation.join.table.foreignKeys[0].columns[0]
    )
      continue
    const through = throughName(navigation.join.table, view)
    const related = navigation.inverse ? `related_name=${pyString(navigation.inverse)}` : 'related_name="+"'
    fields.push({
      name: navigation.name,
      manyToMany: true,
      expression: (cls) => `models.ManyToManyField(${[cls(navigation.target), `through=${cls(through)}`, related].join(', ')})`,
    })
  }
  return fields
}

function throughName(join: Table, view: EntityView): string {
  const [first, second] = join.foreignKeys
  const owner = view.classes.find((item) => item.table.name === first.table)?.name ?? 'Owner'
  const other = view.classes.find((item) => item.table.name === second.table)?.name ?? 'Other'
  return `${owner}${other === owner ? pyIdentifier(join.field ?? 'link').replace(/^./, (c) => c.toUpperCase()) : other}Link`
}

/** The class written for a join table: two foreign keys that are together the primary key. */
function throughFields(join: Table, view: EntityView): Field[] {
  return join.foreignKeys.map((fk) => {
    const target = view.classes.find((item) => item.table.name === fk.table)!
    const name = fk.columns[0].replace(/_id$/, '')
    const columnName = `${name}_id` === fk.columns[0] ? [] : [`db_column=${pyString(fk.columns[0])}`]
    return {
      name,
      expression: (cls: (name: string) => string) =>
        `models.ForeignKey(${[cls(target.name), 'on_delete=models.CASCADE', 'related_name="+"', ...columnName].join(', ')})`,
    }
  })
}

function metaLines(table: Table): string[] {
  const lines = [`db_table = ${pyString(table.name)}`]
  const constraints: string[] = []
  for (const check of table.checks)
    constraints.push(
      `models.CheckConstraint(condition=models.Q(${check.column}__in=[${check.values.map((value) => (typeof value === 'number' ? value : pyString(value))).join(', ')}]), name=${pyString(check.name)})`,
    )
  for (const index of table.indexes.filter((item) => item.columns.length > 1))
    constraints.push(`models.Index(fields=[${index.columns.map(pyString).join(', ')}], name=${pyString(index.name)})`)
  if (constraints.length > 0) lines.push(`constraints = [${constraints.join(', ')}]`)
  return lines
}

function compositeKey(table: Table, fields: Field[], item: EntityClass | null, migration = false): string | null {
  if (table.primaryKey.length < 2) return null
  const names = table.primaryKey.map((column) => {
    const attribute = item?.attributes.find((candidate) => candidate.column.name === column)
    const field = fields.find((candidate) => candidate.name === attribute?.name || `${candidate.name}_id` === column)
    return field?.name ?? column
  })
  // The migration states what Django fills in for a composite key
  const settings = migration ? ', blank=True, editable=False, primary_key=True, serialize=False' : ''
  return `models.CompositePrimaryKey(${names.map(pyString).join(', ')}${settings})`
}

function modelsFile(view: EntityView, context: WriteContext): string {
  const modules = new Set<string>()
  const body: string[] = []
  for (const item of view.enums) {
    const members = enumMembers(item, context.schema)
    const numeric = members.every((member) => typeof member.value === 'number')
    body.push('', '', `class ${pyIdentifier(item.name)}(models.${numeric ? 'IntegerChoices' : 'TextChoices'}):`)
    for (const member of members)
      body.push(
        `    ${pyIdentifier(member.name.toUpperCase())} = ${typeof member.value === 'number' ? member.value : pyString(member.value)}, ${pyString(member.name)}`,
      )
    if (members.length === 0) body.push('    pass')
  }
  const cls = (name: string) => pyString(name)
  const write = (name: string, table: Table, fields: Field[], item: EntityClass | null) => {
    body.push('', '')
    for (const todo of table.todos) body.push(`# ${todoText(todo, table.model, 'table')}`)
    body.push(`class ${name}(models.Model):`)
    const composite = compositeKey(table, fields, item)
    if (composite) body.push(`    pk = ${composite}`)
    for (const field of fields) {
      const expression = field.expression(cls)
      if (expression.includes('uuid.uuid4')) modules.add('uuid')
      if (expression.startsWith('ArrayField')) modules.add('array')
      body.push(`    ${pyIdentifier(field.name)} = ${expression}`)
    }
    body.push('', '    class Meta:', ...metaLines(table).map((line) => `        ${line}`))
  }
  for (const item of view.classes) write(item.name, item.table, fieldsOf(item, view, false), item)
  for (const join of view.joins) write(throughName(join, view), join, throughFields(join, view), null)
  const header = [
    `"""Django models written by Model2DB from ${context.title}. Review them before using them."""`,
    '',
    ...(modules.has('uuid') ? ['import uuid', ''] : []),
    ...(modules.has('array') ? ['from django.contrib.postgres.fields import ArrayField'] : []),
    'from django.db import models',
  ]
  return [...header, ...body, ''].join('\n')
}

function migrationFile(physical: RelationalSchema, view: EntityView, context: WriteContext): string {
  const cls = (name: string) => pyString(`${APP}.${name}`)
  const operations: string[] = []
  const later: string[] = []
  // The label of each choice is the member's name, as in the models' Choices classes
  const labels = new Map(
    view.enums.flatMap((item) => enumMembers(item, context.schema).map((member) => [`${item.name}.${member.value}`, member.name] as const)),
  )
  let usesUuid = false
  let usesArray = false
  for (const table of orderTables(physical.tables)) {
    const item = view.classes.find((candidate) => candidate.table === table) ?? null
    const name = item?.name ?? throughName(table, view)
    const fields = item ? fieldsOf(item, view, true, labels) : throughFields(table, view)
    const lines: string[] = []
    for (const field of fields) {
      const expression = field.expression(cls)
      if (expression.includes('uuid.uuid4')) usesUuid = true
      if (expression.startsWith('ArrayField')) usesArray = true
      if (field.manyToMany)
        later.push(
          '        migrations.AddField(',
          `            model_name=${pyString(name.toLowerCase())},`,
          `            name=${pyString(field.name)},`,
          `            field=${expression},`,
          '        ),',
        )
      else lines.push(`                (${pyString(field.name)}, ${expression}),`)
    }
    const composite = compositeKey(table, fields, item, true)
    if (composite) lines.unshift(`                ("pk", ${composite}),`)
    for (const todo of table.todos) operations.push(`        # ${todoText(todo, table.model, 'table')}`)
    operations.push(
      '        migrations.CreateModel(',
      `            name=${pyString(name)},`,
      '            fields=[',
      ...lines,
      '            ],',
      `            options={${metaLines(table)
        .map((line) => {
          const [key, ...value] = line.split(' = ')
          return `${pyString(key)}: ${value.join(' = ')}`
        })
        .join(', ')}},`,
      '        ),',
    )
  }
  return [
    `"""Initial migration written by Model2DB from ${context.title}, for the app labelled "${APP}".`,
    '',
    'Rename the app label to yours, then run `python manage.py migrate`.',
    '"""',
    '',
    ...(usesUuid ? ['import uuid', ''] : []),
    ...(usesArray ? ['from django.contrib.postgres.fields import ArrayField'] : []),
    'from django.db import migrations, models',
    '',
    '',
    'class Migration(migrations.Migration):',
    '    initial = True',
    '',
    '    dependencies = []',
    '',
    '    operations = [',
    ...operations,
    ...later,
    '    ]',
    '',
  ].join('\n')
}

export const djangoOutput: RelationalWriter = {
  id: 'django',
  label: 'Django ORM',
  group: 'python',
  engines: ['postgresql', 'mysql', 'mariadb', 'sqlite', 'oracle'],
  migrations: true,
  write(physical, context): GeneratedFile[] {
    const view = buildEntities(physical, context.schema, 'snake_case')
    const files: GeneratedFile[] = [{ name: 'models.py', content: modelsFile(view, context), editorLanguage: 'python' }]
    if (context.settings.migrations)
      files.push({ name: 'migrations/0001_initial.py', content: migrationFile(physical, view, context), editorLanguage: 'python' })
    return files
  },
}
