import type { BsonSchema, Collection, DocumentSchema } from '../../physical/types.ts'
import { todoText } from '../todos.ts'
import type { DocumentWriter } from '../types.ts'

/** Writes SQL++ for Couchbase: one collection per stored model in the bucket's default scope, then their
 * indexes. Couchbase makes collections in the background, so the indexes go in a second file, run once
 * the first one has finished. It checks no document shape, so each collection's shape is written as a
 * comment; it has no unique indexes either, so those become plain ones and a note. */

const BUCKET = 'app'
const SCOPE = '_default'

const q = (name: string) => `\`${name.replace(/`/g, '``')}\``
const keyspace = (collection: string) => `${q(BUCKET)}.${q(SCOPE)}.${q(collection)}`

export const couchbaseOutput: DocumentWriter = {
  id: 'couchbase',
  label: 'Couchbase',
  group: 'document',
  write(physical, context) {
    for (const collection of physical.collections)
      for (const index of collection.indexes)
        if (index.unique && index.columns[0] !== '_id')
          context.note({ code: 'uniqueInApplication', params: { database: 'Couchbase', field: `${collection.model}.${index.columns[0]}` } })
    const indexes = indexesScript(physical, context.title)
    const files = [
      { name: '1-collections.sql', content: collectionsScript(physical, context.title, indexes !== null), editorLanguage: 'sql' },
    ]
    if (indexes) files.push({ name: '2-indexes.sql', content: indexes, editorLanguage: 'sql' })
    return files
  },
}

function header(title: string, what: string): string[] {
  return [
    `-- Couchbase ${what} written by Model2DB from ${title}. Run it with cbq or the Query Workbench.`,
    '-- Review it before running it: nothing here has been run.',
    `-- The bucket “${BUCKET}” must exist: rename it here if yours is called otherwise.`,
  ]
}

export function collectionsScript(schema: DocumentSchema, title: string, indexes: boolean): string {
  const out = [...header(title, 'collections'), ...(indexes ? ['-- Then run 2-indexes.sql, once these collections exist.'] : [])]
  for (const collection of schema.collections) {
    out.push('')
    for (const todo of collection.todos) out.push(`-- ${todoText(todo, collection.model, 'collection')}`)
    out.push(...shapeComment(collection))
    out.push(`CREATE COLLECTION ${keyspace(collection.name)} IF NOT EXISTS;`)
  }
  return out.join('\n') + '\n'
}

/** The indexes, or null when there are none: every document is found by its key already. */
export function indexesScript(schema: DocumentSchema, title: string): string | null {
  const out = [...header(title, 'indexes'), '-- Run it after 1-collections.sql.']
  let count = 0
  for (const collection of schema.collections) {
    const indexes = collection.indexes.filter((index) => index.columns[0] !== '_id')
    if (indexes.length > 0) out.push('', `-- “${collection.name}”`)
    for (const index of indexes) {
      if (index.unique) out.push(`-- Couchbase has no unique indexes: check that “${index.columns[0]}” is unique before saving.`)
      const keys = index.columns.map((column) => indexKey(column, collection.validator)).join(', ')
      out.push(`CREATE INDEX ${q(index.name)} IF NOT EXISTS ON ${keyspace(collection.name)}(${keys});`)
      count++
    }
  }
  return count > 0 ? out.join('\n') + '\n' : null
}

/** A path for an index; one that goes through a list indexes every item (`DISTINCT ARRAY ... END`). */
function indexKey(column: string, validator: BsonSchema): string {
  const parts = column.split('.')
  let schema: BsonSchema | undefined = validator
  for (let i = 0; i < parts.length; i++) {
    schema = schema?.properties?.[parts[i]]
    if (schema && isArray(schema)) {
      const list = parts
        .slice(0, i + 1)
        .map(q)
        .join('.')
      const rest = parts.slice(i + 1)
      const item = rest.length > 0 ? `item.${rest.map(q).join('.')}` : 'item'
      return `DISTINCT ARRAY ${item} FOR item IN ${list} END`
    }
  }
  return parts.map(q).join('.')
}

function types(schema: BsonSchema): string[] {
  return schema.bsonType === undefined ? [] : Array.isArray(schema.bsonType) ? schema.bsonType : [schema.bsonType]
}

function isArray(schema: BsonSchema): boolean {
  return types(schema).includes('array')
}

const JSON_TYPES: Record<string, string> = {
  string: 'text',
  int: 'number',
  long: 'number',
  double: 'number',
  decimal: 'number',
  bool: 'true or false',
  date: 'date (ISO 8601 text)',
  objectId: 'key of a document',
  binData: 'base64 text',
}

/** The fields of the collection's documents, as comments. */
function shapeComment(collection: Collection): string[] {
  const properties = collection.validator.properties ?? {}
  const id = properties._id ?? {}
  const key = types(id).includes('objectId') ? 'a UUID made by the application' : "the value of the model's key field, written as text"
  const lines = [`-- Each document of “${collection.name}” is stored under a key: ${key}. Its fields:`]
  const write = (schema: BsonSchema, indent: string) => {
    const required = new Set(schema.required ?? [])
    for (const [name, field] of Object.entries(schema.properties ?? {})) {
      if (name === '_id' && indent === '--   ') continue
      lines.push(`${indent}${name}${required.has(name) ? '' : '?'}: ${describe(field)}`)
      const inner = isArray(field) ? field.items : field
      if (inner?.properties) write(inner, `${indent}  `)
    }
  }
  write(collection.validator, '--   ')
  return lines
}

function describe(schema: BsonSchema): string {
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ')
  const names = types(schema)
  const nullable = names.includes('null')
  const main = names.filter((name) => name !== 'null')
  let text: string
  if (main.length === 0) text = 'any value'
  else if (main[0] === 'array') text = schema.items ? `list of ${plural(describe(schema.items))}` : 'list'
  else if (main[0] === 'object') text = schema.properties ? 'object' : 'object with any fields'
  else text = main.map((name) => JSON_TYPES[name] ?? name).join(' or ')
  return nullable ? `${text} or null` : text
}

const plural = (text: string) => (text === 'object' ? 'objects' : text)
