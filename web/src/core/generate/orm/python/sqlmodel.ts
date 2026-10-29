import type { Table } from '../../../physical/types.ts'
import { todoText } from '../../todos.ts'
import type { GeneratedFile, RelationalWriter, WriteContext } from '../../types.ts'
import { buildEntities, enumMembers, type Attribute, type EntityClass, type EntityView } from '../entities.ts'
import { migrationFile } from './alembic.ts'
import { pyIdentifier, pyString, pythonEnum } from './python.ts'
import { columnSettings, foreignKeyCall, relationshipParts, typeParts } from './sqlalchemyTypes.ts'

/** SQLModel table models. Every column is written with `sa_column`, so it states exactly the type,
 * keys and constraints of the design; the migration is the same Alembic revision as for SQLAlchemy. */

interface Imports {
  sqlalchemy: Set<string>
  modules: Set<string>
}

/** `name: type = Field(..., sa_column=Column(...))` for one column. */
function fieldLine(attribute: Attribute, view: EntityView, imports: Imports): string {
  const { column } = attribute
  const type = typeParts(column.type, view.enums, false, column.generated === 'identity')
  type.imports.forEach((name) => imports.sqlalchemy.add(name))
  type.modules.forEach((name) => imports.modules.add(name))
  if (column.generated === 'now') imports.sqlalchemy.add('func')
  const args = [
    ...(attribute.name !== column.name ? [pyString(column.name)] : []),
    type.sql,
    foreignKeyCall(attribute, ''),
    // The database default stays in the column; the instance gets it from the Field below
    ...columnSettings(attribute, view, '').filter((setting) => !setting.startsWith('default=uuid')),
    ...(attribute.primaryKey || attribute.compositeKey ? [] : [`nullable=${column.nullable ? 'True' : 'False'}`]),
  ].filter(Boolean)
  // Table models are not validated when built: a value the database fills can start as None
  const filledByDatabase = column.generated === 'identity' || column.generated === 'now'
  let defaultArg = ''
  if (column.generated === 'uuid') {
    imports.modules.add('uuid')
    defaultArg = 'default_factory=uuid.uuid4, '
  } else if (column.nullable || filledByDatabase) defaultArg = 'default=None, '
  else if (column.defaultValue !== undefined && column.defaultValue !== null) {
    const literal = columnSettings(attribute, view, '').find((setting) => setting.startsWith('default='))
    if (literal) defaultArg = `${literal}, `
  }
  const pythonType = column.nullable || filledByDatabase ? `${type.python} | None` : type.python
  return `${pyIdentifier(attribute.name)}: ${pythonType} = Field(${defaultArg}sa_column=Column(${args.join(', ')}))`
}

function relationshipLine(navigation: EntityClass['navigations'][number], owner: EntityClass, links: Map<Table, string>): string {
  const parts = relationshipParts(navigation, owner)
  const kwargs = [
    parts.foreignKeys ? `"foreign_keys": ${pyString(parts.foreignKeys)}` : '',
    parts.remoteSide ? `"remote_side": ${pyString(parts.remoteSide)}` : '',
    parts.cascade ? `"cascade": ${pyString(parts.cascade)}` : '',
  ].filter(Boolean)
  const settings = [
    parts.backPopulates ? `back_populates=${pyString(parts.backPopulates)}` : '',
    navigation.kind === 'manyToMany' ? `link_model=${links.get(navigation.join!.table)}` : '',
    kwargs.length > 0 ? `sa_relationship_kwargs={${kwargs.join(', ')}}` : '',
  ].filter(Boolean)
  const target = pyString(navigation.target)
  const type = navigation.kind === 'manyToOne' ? `Optional[${target}]` : `list[${target}]`
  return `${pyIdentifier(navigation.name)}: ${type} = Relationship(${settings.join(', ')})`
}

/** The class of a join table: the two keys, which together are its primary key. */
function linkName(join: Table, view: EntityView): string {
  const [first, second] = join.foreignKeys
  const owner = view.classes.find((item) => item.table.name === first.table)?.name ?? 'Owner'
  const other = view.classes.find((item) => item.table.name === second.table)?.name ?? 'Other'
  return `${owner}${other === owner ? pyIdentifier(join.field ?? 'link').replace(/^./, (c) => c.toUpperCase()) : other}Link`
}

function modelsFile(view: EntityView, context: WriteContext): string {
  const imports: Imports = { sqlalchemy: new Set(['Column']), modules: new Set() }
  const body: string[] = []
  const usesEnum = view.enums.some((item) => item.storage === 'check' || item.storage === 'native')
  if (usesEnum) {
    imports.modules.add('enum')
    body.push(
      '',
      '',
      'def enum_values(enum_class: type[enum.Enum]) -> list[str]:',
      '    """Store the values of an enum (`paid`), not the names of its members (`PAID`)."""',
      '    return [str(member.value) for member in enum_class]',
    )
    for (const item of view.enums) {
      if (item.storage === 'check' || item.storage === 'native')
        body.push('', '', ...pythonEnum(item.name, enumMembers(item, context.schema)))
    }
  }

  // Link models first: the relationships refer to them by class
  const links = new Map<Table, string>()
  for (const join of view.joins) {
    const name = linkName(join, view)
    links.set(join, name)
    body.push('', '', `class ${name}(SQLModel, table=True):`, `    __tablename__ = ${pyString(join.name)}`, '')
    for (const column of join.columns) {
      const type = typeParts(column.type, view.enums, false, column.generated === 'identity')
      type.imports.forEach((item) => imports.sqlalchemy.add(item))
      const fk = join.foreignKeys.find((candidate) => candidate.columns[0] === column.name)!
      const reference = `ForeignKey(${pyString(`${fk.table}.${fk.references[0]}`)}${fk.onDelete ? `, ondelete=${pyString(fk.onDelete.toUpperCase())}` : ''})`
      body.push(`    ${pyIdentifier(column.name)}: ${type.python} = Field(sa_column=Column(${type.sql}, ${reference}, primary_key=True))`)
    }
  }

  let usesRelationships = false
  for (const item of view.classes) {
    body.push('', '')
    for (const todo of item.table.todos) body.push(`# ${todoText(todo, item.table.model, 'table')}`)
    body.push(`class ${item.name}(SQLModel, table=True):`, `    __tablename__ = ${pyString(item.table.name)}`, '')
    for (const attribute of item.attributes) {
      if (attribute.foreignKey) imports.sqlalchemy.add('ForeignKey')
      body.push(`    ${fieldLine(attribute, view, imports)}`)
    }
    if (item.navigations.length > 0) {
      usesRelationships = true
      body.push('')
      for (const navigation of item.navigations) body.push(`    ${relationshipLine(navigation, item, links)}`)
    }
  }
  if (links.size > 0) imports.sqlalchemy.add('ForeignKey')

  const typing = [...(usesRelationships ? ['Optional'] : []), ...(imports.modules.has('typing') ? ['Any'] : [])]
  const header = [
    `"""SQLModel models written by Model2DB from ${context.title}. Review them before using them."""`,
    '',
    ...[...imports.modules]
      .filter((name) => name !== 'typing')
      .sort()
      .map((name) => `import ${name}`),
    ...(typing.length > 0 ? [`from typing import ${typing.sort().join(', ')}`] : []),
    '',
    `from sqlalchemy import ${[...imports.sqlalchemy].sort().join(', ')}`,
    `from sqlmodel import Field, ${usesRelationships ? 'Relationship, ' : ''}SQLModel`,
  ]
  return [...header, ...body, ''].join('\n')
}

export const sqlmodelOutput: RelationalWriter = {
  id: 'sqlmodel',
  label: 'SQLModel',
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
