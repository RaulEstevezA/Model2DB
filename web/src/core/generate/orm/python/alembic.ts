import type { Column, RelationalSchema, Table } from '../../../physical/types.ts'
import { todoText } from '../../todos.ts'
import type { WriteContext } from '../../types.ts'
import type { Attribute, EntityView } from '../entities.ts'
import { orderTables, pyString } from './python.ts'
import { columnSettings, typeParts } from './sqlalchemyTypes.ts'

/** The Alembic revision that creates every table, and drops them on downgrade. */
export function migrationFile(physical: RelationalSchema, view: EntityView, context: WriteContext): string {
  const tables = orderTables(physical.tables)
  const lines: string[] = []
  for (const table of tables) {
    const columns = table.columns.map((column) => {
      const attribute = attributeOf(view, table, column)
      const type = typeParts(column.type, view.enums, true, column.generated === 'identity')
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
