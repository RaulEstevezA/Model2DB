import type { Literal } from '../../../model/schema.ts'
import type { Column, ColumnType, PhysicalEnum, RelationalSchema, Table } from '../../../physical/types.ts'
import { todoText } from '../../todos.ts'
import type { GeneratedFile, RelationalWriter, WriteContext } from '../../types.ts'
import { buildEntities, enumMembers, type Attribute, type EntityClass, type EntityView } from '../entities.ts'
import { orderTables, pyIdentifier, pyString, pythonEnum } from './python.ts'

/** SQLAlchemy 2.0 models in the typed declarative style, and the Alembic migration that creates them. */

interface TypeParts {
  /** SQLAlchemy type expression (`String(255)`) without the module prefix */
  sql: string
  /** Python type for `Mapped[...]` */
  python: string
  /** Names to import from `sqlalchemy` */
  imports: string[]
  /** Modules of the standard library the Python type needs */
  modules: string[]
}

function enumLength(item: PhysicalEnum): number {
  const longest = Math.max(1, ...item.values.map((value) => String(value).length))
  return longest <= 20 ? 20 : longest <= 50 ? 50 : 255
}

function typeParts(type: ColumnType, enums: PhysicalEnum[], migration: boolean): TypeParts {
  const parts = (sql: string, python: string, imports: string[], modules: string[] = []): TypeParts => ({ sql, python, imports, modules })
  switch (type.kind) {
    case 'raw':
      return parts(`text(${pyString(type.sql)})`, 'Any', ['text'], ['typing'])
    case 'json':
      return parts('JSON', 'Any', ['JSON'], ['typing'])
    case 'array': {
      const inner = typeParts(type.items, enums, migration)
      return parts(`ARRAY(${inner.sql})`, `list[${inner.python}]`, ['ARRAY', ...inner.imports], inner.modules)
    }
    case 'enum': {
      const item = enums.find((candidate) => candidate.name === type.name)
      if (!item) return parts('String(255)', 'str', ['String'])
      const numeric = item.values.every((value) => typeof value === 'number')
      if (item.storage === 'lookup' || item.storage === 'text')
        return numeric ? parts('Integer', 'int', ['Integer']) : parts(`String(${enumLength(item)})`, 'str', ['String'])
      // In the migration the values are written out; in the models the Python enum gives them
      const source = migration ? item.values.map((value) => pyString(String(value))).join(', ') : item.name
      const settings =
        item.storage === 'native'
          ? `name=${pyString(item.sqlName)}`
          : `native_enum=False, create_constraint=True, length=${enumLength(item)}, name=${pyString(`ck_${item.sqlName}`)}`
      return parts(`Enum(${source}, ${settings}${migration ? '' : ', values_callable=enum_values'})`, item.name, ['Enum'])
    }
    case 'primitive':
      switch (type.name) {
        case 'string':
          return type.length ? parts(`String(${type.length})`, 'str', ['String']) : parts('Text', 'str', ['Text'])
        case 'integer':
          if (type.bits === 64) return parts('BigInteger', 'int', ['BigInteger'])
          if (type.bits === 8 || type.bits === 16) return parts('SmallInteger', 'int', ['SmallInteger'])
          return parts('Integer', 'int', ['Integer'])
        case 'float':
          return type.bits === 32 ? parts('Float', 'float', ['Float']) : parts('Double', 'float', ['Double'])
        case 'decimal':
          return parts(`Numeric(${type.precision ?? 18}, ${type.scale ?? 2})`, 'decimal.Decimal', ['Numeric'], ['decimal'])
        case 'boolean':
          return parts('Boolean', 'bool', ['Boolean'])
        case 'date':
          return parts('Date', 'datetime.date', ['Date'], ['datetime'])
        case 'datetime':
          return parts('DateTime(timezone=True)', 'datetime.datetime', ['DateTime'], ['datetime'])
        case 'time':
          return parts('Time', 'datetime.time', ['Time'], ['datetime'])
        case 'duration':
          return parts('Interval', 'datetime.timedelta', ['Interval'], ['datetime'])
        case 'uuid':
          return parts('Uuid', 'uuid.UUID', ['Uuid'], ['uuid'])
        case 'binary':
          return parts('LargeBinary', 'bytes', ['LargeBinary'])
        case 'any':
          return parts('JSON', 'Any', ['JSON'], ['typing'])
      }
  }
}

function pyLiteral(value: Literal, column: Column, enums: PhysicalEnum[]): string {
  if (value === null) return 'None'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'number') return String(value)
  const item =
    column.type.kind === 'enum' ? enums.find((candidate) => candidate.name === (column.type as { name: string }).name) : undefined
  const stored = item?.values.find((candidate) => String(candidate).toLowerCase() === value.toLowerCase())
  return pyString(String(stored ?? value))
}

/** Keyword arguments of `mapped_column` / `sa.Column` that both files share. */
function columnSettings(attribute: Attribute, view: EntityView, prefix: string): string[] {
  const { column } = attribute
  const settings: string[] = []
  if (attribute.primaryKey || attribute.compositeKey) settings.push('primary_key=True')
  if (attribute.primaryKey && column.type.kind === 'primitive' && column.type.name === 'integer' && column.generated !== 'identity')
    settings.push('autoincrement=False')
  if (attribute.unique) settings.push('unique=True')
  if (attribute.indexed) settings.push('index=True')
  if (column.generated === 'uuid') settings.push('default=uuid.uuid4')
  if (column.generated === 'now') settings.push(`server_default=${prefix}func.now()`)
  if (column.defaultValue !== undefined && column.defaultValue !== null)
    settings.push(`default=${pyLiteral(column.defaultValue, column, view.enums)}`)
  return settings
}

function foreignKeyCall(attribute: Attribute, prefix: string): string | null {
  const fk = attribute.foreignKey
  if (!fk) return null
  const action = fk.onDelete ? `, ondelete=${pyString(fk.onDelete.toUpperCase())}` : ''
  return `${prefix}ForeignKey(${pyString(`${fk.table}.${fk.references[0]}`)}${action})`
}

function modelsFile(view: EntityView, context: WriteContext): string {
  const imports = new Set(['ForeignKey'])
  const ormImports = new Set(['DeclarativeBase', 'Mapped', 'mapped_column'])
  const modules = new Set<string>()
  const body: string[] = []

  if (view.enums.some((item) => item.storage === 'check' || item.storage === 'native')) {
    modules.add('enum')
    body.push(
      '',
      '',
      'def enum_values(enum_class: type[enum.Enum]) -> list[str]:',
      '    """Store the values of an enum (`paid`), not the names of its members (`PAID`)."""',
      '    return [str(member.value) for member in enum_class]',
    )
    for (const item of view.enums) {
      if (item.storage !== 'check' && item.storage !== 'native') continue
      body.push('', '', ...pythonEnum(item.name, enumMembers(item, context.schema)))
    }
  }

  body.push('', '', 'class Base(DeclarativeBase):', '    pass')

  for (const join of view.joins) {
    imports.add('Table')
    imports.add('Column')
    const columns = join.columns.map((column) => {
      const type = typeParts(column.type, view.enums, false)
      type.imports.forEach((name) => imports.add(name))
      const fk = join.foreignKeys.find((candidate) => candidate.columns[0] === column.name)
      const reference = fk
        ? `, ForeignKey(${pyString(`${fk.table}.${fk.references[0]}`)}${fk.onDelete ? `, ondelete=${pyString(fk.onDelete.toUpperCase())}` : ''})`
        : ''
      return `    Column(${pyString(column.name)}, ${type.sql}${reference}, primary_key=True),`
    })
    body.push('', '', `${pyIdentifier(join.name)} = Table(`, `    ${pyString(join.name)},`, '    Base.metadata,', ...columns, ')')
  }

  for (const item of view.classes) {
    body.push('', '')
    for (const todo of item.table.todos) body.push(`# ${todoText(todo, item.table.model, 'table')}`)
    body.push(`class ${item.name}(Base):`, `    __tablename__ = ${pyString(item.table.name)}`, '')
    for (const attribute of item.attributes) {
      const type = typeParts(attribute.column.type, view.enums, false)
      type.imports.forEach((name) => imports.add(name))
      type.modules.forEach((name) => modules.add(name))
      if (attribute.column.generated === 'uuid') modules.add('uuid')
      if (attribute.column.generated === 'now') imports.add('func')
      const pythonType = attribute.column.nullable ? `${type.python} | None` : type.python
      const args = [type.sql, foreignKeyCall(attribute, ''), ...columnSettings(attribute, view, '')].filter(Boolean)
      // mapped_column takes the name of the column when the attribute is named differently
      if (attribute.name !== attribute.column.name) args.unshift(pyString(attribute.column.name))
      body.push(`    ${pyIdentifier(attribute.name)}: Mapped[${pythonType}] = mapped_column(${args.join(', ')})`)
    }
    if (item.navigations.length > 0) {
      ormImports.add('relationship')
      body.push('')
      for (const navigation of item.navigations) body.push(`    ${relationshipLine(navigation, item)}`)
    }
  }

  const header = [
    `"""SQLAlchemy models written by Model2DB from ${context.title}. Review them before using them."""`,
    '',
    'from __future__ import annotations',
    '',
    ...[...modules].sort().map((name) => (name === 'typing' ? 'from typing import Any' : `import ${name}`)),
    ...(modules.size > 0 ? [''] : []),
    `from sqlalchemy import ${[...imports].sort().join(', ')}`,
    `from sqlalchemy.orm import ${[...ormImports].sort().join(', ')}`,
  ]
  return [...header, ...body, ''].join('\n')
}

function relationshipLine(navigation: EntityClass['navigations'][number], owner: EntityClass): string {
  const name = pyIdentifier(navigation.name)
  const back = navigation.inverse ? `back_populates=${pyString(navigation.inverse)}` : ''
  switch (navigation.kind) {
    case 'manyToOne': {
      const type = navigation.nullable ? `${navigation.target} | None` : navigation.target
      // A model that refers to itself needs to say which side holds the key
      const remote = navigation.target === owner.name ? `remote_side=${pyString(`${owner.name}.${primaryAttribute(owner)}`)}` : ''
      const settings = [back, remote, `foreign_keys=${pyString(`${owner.name}.${navigation.attribute}`)}`].filter(Boolean)
      return `${name}: Mapped[${type}] = relationship(${settings.join(', ')})`
    }
    case 'oneToMany': {
      const settings = [
        back,
        `foreign_keys=${pyString(`${navigation.target}.${navigation.attribute}`)}`,
        navigation.cascade ? 'cascade="all, delete-orphan"' : '',
      ].filter(Boolean)
      return `${name}: Mapped[list[${navigation.target}]] = relationship(${settings.join(', ')})`
    }
    case 'manyToMany':
      return `${name}: Mapped[list[${navigation.target}]] = relationship(${[`secondary=${pyIdentifier(navigation.join!.table.name)}`, back].filter(Boolean).join(', ')})`
  }
}

function primaryAttribute(item: EntityClass): string {
  return item.attributes.find((attribute) => attribute.primaryKey)?.name ?? 'id'
}

/** The Alembic revision that creates every table, and drops them on downgrade. */
function migrationFile(physical: RelationalSchema, view: EntityView, context: WriteContext): string {
  const tables = orderTables(physical.tables)
  const lines: string[] = []
  for (const table of tables) {
    const columns = table.columns.map((column) => {
      const attribute = attributeOf(view, table, column)
      const type = typeParts(column.type, view.enums, true)
      const settings = [
        type.sql.replace(/\b([A-Z]\w*)\(/g, 'sa.$1(').replace(/^([A-Z]\w*)$/, 'sa.$1'),
        // Positional, so before the keyword arguments
        ...(column.generated === 'identity' ? ['sa.Identity()'] : []),
        `nullable=${column.nullable ? 'True' : 'False'}`,
        ...(attribute
          ? columnSettings(attribute, view, 'sa.').filter(
              (item) =>
                !item.startsWith('primary_key') && !item.startsWith('unique') && !item.startsWith('index') && !item.startsWith('default='),
            )
          : []),
      ]
      return `        sa.Column(${pyString(column.name)}, ${settings.join(', ')}),`
    })
    const constraints: string[] = []
    if (table.primaryKey.length > 0)
      constraints.push(
        `        sa.PrimaryKeyConstraint(${table.primaryKey.map(pyString).join(', ')}, name=${pyString(`pk_${table.name}`)}),`,
      )
    for (const unique of table.uniques)
      constraints.push(`        sa.UniqueConstraint(${unique.columns.map(pyString).join(', ')}, name=${pyString(unique.name)}),`)
    for (const fk of table.foreignKeys)
      constraints.push(
        `        sa.ForeignKeyConstraint([${fk.columns.map(pyString).join(', ')}], [${fk.references.map((column) => pyString(`${fk.table}.${column}`)).join(', ')}], name=${pyString(fk.name)}${fk.onDelete ? `, ondelete=${pyString(fk.onDelete.toUpperCase())}` : ''}),`,
      )
    for (const todo of table.todos) lines.push(`    # ${todoText(todo, table.model, 'table')}`)
    lines.push('    op.create_table(', `        ${pyString(table.name)},`, ...columns, ...constraints, '    )')
    for (const index of table.indexes)
      lines.push(
        `    op.create_index(${pyString(index.name)}, ${pyString(table.name)}, [${index.columns.map(pyString).join(', ')}], unique=${index.unique ? 'True' : 'False'})`,
      )
  }
  const drops = [...tables].reverse().map((table) => `    op.drop_table(${pyString(table.name)})`)
  const nativeEnums = view.enums.filter((item) => item.storage === 'native')
  for (const item of nativeEnums) drops.push(`    sa.Enum(name=${pyString(item.sqlName)}).drop(op.get_bind(), checkfirst=True)`)
  return [
    `"""Create the ${context.title} schema.`,
    '',
    'Written by Model2DB. Review it before running `alembic upgrade head`.',
    '',
    'Revision ID: 0001',
    'Revises:',
    '"""',
    '',
    'import sqlalchemy as sa',
    'from alembic import op',
    '',
    'revision = "0001"',
    'down_revision = None',
    'branch_labels = None',
    'depends_on = None',
    '',
    '',
    'def upgrade() -> None:',
    ...(lines.length > 0 ? lines : ['    pass']),
    '',
    '',
    'def downgrade() -> None:',
    ...(drops.length > 0 ? drops : ['    pass']),
    '',
  ].join('\n')
}

function attributeOf(view: EntityView, table: Table, column: Column): Attribute | undefined {
  return view.classes.find((item) => item.table === table)?.attributes.find((attribute) => attribute.column === column)
}

export const sqlalchemyOutput: RelationalWriter = {
  id: 'sqlalchemy',
  label: 'SQLAlchemy',
  group: 'python',
  engines: ['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle'],
  migrations: true,
  write(physical, context): GeneratedFile[] {
    const view = buildEntities(physical, context.schema, 'snake_case')
    const files: GeneratedFile[] = [{ name: 'models.py', content: modelsFile(view, context), editorLanguage: 'python' }]
    if (context.settings.migrations)
      files.push({
        name: 'migrations/versions/0001_create_schema.py',
        content: migrationFile(physical, view, context),
        editorLanguage: 'python',
      })
    return files
  },
}
