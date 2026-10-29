import type { DocumentSchema } from '../physical/types.ts'
import { todoText } from './todos.ts'

/** Writes a mongosh script that creates each collection with its `$jsonSchema` validator and indexes. */

const identifier = /^[A-Za-z_$][\w$]*$/

/** JSON with the keys of a JavaScript object literal: unquoted when they are plain names. */
function toJs(value: unknown, indent: string): string {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item !== 'object' || item === null)) return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`
    return `[\n${value.map((item) => `${indent}  ${toJs(item, `${indent}  `)}`).join(',\n')},\n${indent}]`
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined)
    if (entries.length === 0) return '{}'
    const lines = entries.map(
      ([key, item]) => `${indent}  ${identifier.test(key) ? key : JSON.stringify(key)}: ${toJs(item, `${indent}  `)}`,
    )
    return `{\n${lines.join(',\n')},\n${indent}}`
  }
  return JSON.stringify(value)
}

export function generateMongo(schema: DocumentSchema, options: { title?: string } = {}): string {
  const out: string[] = [
    `// MongoDB collections written by Model2DB${options.title ? ` from ${options.title}` : ''}. Run it with mongosh.`,
    '// Review it before running it: nothing here has been run.',
  ]
  for (const collection of schema.collections) {
    out.push('')
    for (const todo of collection.todos) out.push(`// ${todoText(todo, collection.model, 'collection')}`)
    const name = JSON.stringify(collection.name)
    out.push(`db.createCollection(${name}, {`, `  validator: { $jsonSchema: ${toJs(collection.validator, '  ')} },`, '})')
    for (const index of collection.indexes) {
      const keys = `{ ${index.columns.map((column) => `${identifier.test(column) ? column : JSON.stringify(column)}: 1`).join(', ')} }`
      const settings = `{ name: ${JSON.stringify(index.name)}${index.unique ? ', unique: true' : ''} }`
      out.push(`db.getCollection(${name}).createIndex(${keys}, ${settings})`)
    }
  }
  return out.join('\n') + '\n'
}
