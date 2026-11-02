import type { HashField, KeyEntry, KeyStructure, KeyValueSchema } from '../../physical/types.ts'
import { todoText } from '../todos.ts'
import { fileBase, type KeyValueWriter } from '../types.ts'

/** Redis: a description of the keys (Markdown), and the search indexes as commands for redis-cli, which
 * takes no comments. Redis has no schema to create: the description is what the application follows. */
export const redisOutput: KeyValueWriter = {
  id: 'redis',
  label: 'Redis',
  group: 'keyvalue',
  write(physical, context) {
    const base = fileBase(context.title)
    const search = searchCommands(physical)
    const searchFile = `${base}-redis-search.redis`
    return [
      { name: `${base}-redis.md`, content: describeKeys(physical, context.title, search ? searchFile : null), editorLanguage: 'markdown' },
      ...(search ? [{ name: searchFile, content: search, editorLanguage: 'text' }] : []),
    ]
  },
}

const key = (entry: KeyEntry) => `${entry.prefix}:<key>`

function holds(item: { holds: HashField['holds']; refers?: string; values?: HashField['values'] }): string {
  if (item.values) return `text: ${item.values.map((value) => `\`${String(value)}\``).join(', ')}`
  switch (item.holds) {
    case 'key':
      return `key of a \`${item.refers}\` (\`${item.refers}:<key>\`)`
    case 'number':
      return 'number'
    case 'boolean':
      return '`true` or `false`'
    case 'date':
      return 'date (ISO 8601 text)'
    case 'json':
      return 'JSON text'
    case 'text':
      return 'text'
  }
}

function structureText(entry: KeyEntry, structure: KeyStructure): string {
  const what =
    structure.type === 'set'
      ? `set of the keys of each \`${structure.refers}\``
      : structure.type === 'list'
        ? `list, each item ${holds(structure)}`
        : `hash, each value ${holds(structure)}`
  return `- \`${key(entry)}:${structure.suffix}\`: ${what} (from \`${structure.source}\`)`
}

export function describeKeys(schema: KeyValueSchema, title: string, searchFile: string | null): string {
  const out = [
    `# Redis keys for ${title}`,
    '',
    'Written by Model2DB. Review it before using it: nothing here has been run.',
    'Redis keeps every value as text; the application writes and reads them as described here.',
  ]
  for (const entry of schema.entries) {
    out.push('', `## \`${key(entry)}\`: a hash for each ${entry.model}`, '')
    for (const todo of entry.todos) out.push(`> ${todoText(todo, entry.model, 'hash')}`, '')
    if (entry.keyField) out.push(`The key is the value of \`${entry.keyField}\`.`)
    else if (entry.newKey === 'counter') out.push(`New keys: \`INCR ${entry.prefix}:next_key\` gives the next number.`)
    else if (entry.newKey === 'uuid') out.push('New keys: a UUID made by the application.')
    if (entry.fields.length > 0) {
      out.push('', '| Field | Holds |', '| --- | --- |')
      for (const field of entry.fields) out.push(`| \`${field.name}\` | ${holds(field)}${field.nullable ? '; may be missing' : ''} |`)
    }
    if (entry.structures.length > 0) {
      out.push('', 'Under the same key:', '')
      for (const structure of entry.structures) out.push(structureText(entry, structure))
    }
  }
  if (searchFile)
    out.push(
      '',
      '## Search',
      '',
      `\`${searchFile}\` creates a search index for each hash, on the fields other keys point to and the ones chosen to be indexed. Run it with \`redis-cli < ${searchFile}\` on Redis 8, or Redis Stack.`,
    )
  return out.join('\n') + '\n'
}

/** `FT.CREATE` for every hash with fields to search, or null when there are none. */
export function searchCommands(schema: KeyValueSchema): string | null {
  const lines = schema.entries
    .filter((entry) => entry.search.length > 0)
    .map(
      (entry) =>
        `FT.CREATE idx:${entry.prefix} ON HASH PREFIX 1 ${entry.prefix}: SCHEMA ${entry.search.map((field) => `${field.field} ${field.type}`).join(' ')}`,
    )
  return lines.length > 0 ? lines.join('\n') + '\n' : null
}
