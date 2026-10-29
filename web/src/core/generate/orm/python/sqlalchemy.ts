import { todoText } from '../../todos.ts'
import type { GeneratedFile, RelationalWriter, WriteContext } from '../../types.ts'
import { buildEntities, enumMembers, type EntityView } from '../entities.ts'
import { migrationFile } from './alembic.ts'
import { pyIdentifier, pyString, pythonEnum } from './python.ts'
import { columnSettings, foreignKeyCall, relationshipLine, typeParts } from './sqlalchemyTypes.ts'

/** SQLAlchemy 2.0 models in the typed declarative style, and the Alembic migration that creates them. */

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
      const type = typeParts(attribute.column.type, view.enums, false, attribute.column.generated === 'identity')
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
