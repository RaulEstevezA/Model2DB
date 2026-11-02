import type { CqlTable, WideColumnSchema } from '../../physical/types.ts'
import { todoText } from '../todos.ts'
import { fileBase, type WideColumnWriter } from '../types.ts'

/** CQL for Cassandra and ScyllaDB: a keyspace, the user-defined types (each after the types it uses), the
 * tables and their secondary indexes. Both read the same CQL; Cassandra 5 indexes with SAI. */

const KEYSPACE = 'app'

// Words CQL reserves: a name that is one of them, or has capitals, is quoted
const RESERVED = new Set(
  (
    'add allow alter and apply asc authorize batch begin by columnfamily create delete desc describe drop entries ' +
    'execute from full grant if in index infinity insert into is keyspace limit materialized modify nan norecursive ' +
    'not null of on or order primary rename replace revoke schema select set table to token truncate unlogged update ' +
    'use using view where with'
  ).split(' '),
)

export function cqlName(name: string): string {
  return /^[a-z_][a-z0-9_]*$/.test(name) && !RESERVED.has(name) ? name : `"${name.replace(/"/g, '""')}"`
}

/** Quotes the names inside a CQL type: `frozen<order>` → `frozen<"order">`. */
function cqlType(type: string): string {
  return type.replace(/(?<=<|, )([a-z_][a-z0-9_]*)(?=>|,)/g, (name) => (BUILT_IN.has(name) ? name : cqlName(name)))
}

const BUILT_IN = new Set([
  'text',
  'int',
  'bigint',
  'smallint',
  'tinyint',
  'float',
  'double',
  'decimal',
  'boolean',
  'date',
  'timestamp',
  'time',
  'duration',
  'uuid',
  'blob',
])

function primaryKey(table: CqlTable): string {
  const partition = table.partitionKey.map(cqlName).join(', ')
  const clustering = table.clusteringKey.map(cqlName)
  return clustering.length > 0 ? `PRIMARY KEY ((${partition}), ${clustering.join(', ')})` : `PRIMARY KEY (${partition})`
}

export function generateCql(schema: WideColumnSchema, engine: 'cassandra' | 'scylladb', title: string): string {
  const name = engine === 'cassandra' ? 'Cassandra' : 'ScyllaDB'
  const out = [
    `-- ${name} schema written by Model2DB from ${title}. Run it with cqlsh -f.`,
    '-- Review it before running it: nothing here has been run.',
    `-- The keyspace “${KEYSPACE}” keeps one copy of each row: raise its replication factor for a cluster.`,
    '',
    `CREATE KEYSPACE IF NOT EXISTS ${KEYSPACE} WITH replication = {'class': 'NetworkTopologyStrategy', 'replication_factor': 1};`,
    `USE ${KEYSPACE};`,
  ]
  for (const type of schema.types) {
    out.push('', `CREATE TYPE IF NOT EXISTS ${cqlName(type.name)} (`)
    out.push(type.fields.map((field) => `  ${cqlName(field.name)} ${cqlType(field.type)}`).join(',\n'), ');')
  }
  for (const table of schema.tables) {
    out.push('')
    for (const todo of table.todos) out.push(`-- ${todoText(todo, table.model, 'table')}`)
    const lines = [
      `CREATE TABLE IF NOT EXISTS ${cqlName(table.name)} (`,
      ...table.columns.map((column) => `  ${cqlName(column.name)} ${cqlType(column.type)},`),
      `  ${primaryKey(table)}`,
      ');',
    ]
    // A table needs its key: until it is chosen, the table is written as a comment
    if (table.partitionKey.length === 0) out.push(...lines.map((line) => `-- ${line}`))
    else out.push(...lines)
    for (const index of table.indexes) {
      const statement = `CREATE INDEX IF NOT EXISTS ${cqlName(index.name)} ON ${cqlName(table.name)} (${cqlName(index.column)})`
      out.push(`${table.partitionKey.length === 0 ? '-- ' : ''}${statement}${engine === 'cassandra' ? " USING 'sai'" : ''};`)
    }
  }
  return out.join('\n') + '\n'
}

const writer = (engine: 'cassandra' | 'scylladb', label: string): WideColumnWriter => ({
  id: engine,
  label,
  group: 'widecolumn',
  write: (physical, context) => [
    { name: `${fileBase(context.title)}-${engine}.cql`, content: generateCql(physical, engine, context.title), editorLanguage: 'sql' },
  ],
})

export const cassandraOutput = writer('cassandra', 'Cassandra')
export const scyllaOutput = writer('scylladb', 'ScyllaDB')
