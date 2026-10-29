import { orderTables } from '../../physical/order.ts'
import type { Dialect, RelationalSchema } from '../../physical/types.ts'
import { generateSql } from './sql.ts'

/** The schema of an engine as separate statements, for migrations that run them one by one, and the
 * statements that undo it (tables dropped after the ones that refer to them). */
export function schemaStatements(physical: RelationalSchema, dialect: Dialect, title: string): { up: string[]; down: string[] } {
  const up = generateSql(physical, dialect, { title })
    .split('\n')
    .filter((line) => !line.startsWith('--'))
    .join('\n')
    .split(/;\s*\n/)
    .map((statement) => statement.trim().replace(/;$/, ''))
    .filter(Boolean)
  const down = [...orderTables(physical.tables).tables].reverse().map((table) => `DROP TABLE ${table.name}`)
  return { up, down }
}
