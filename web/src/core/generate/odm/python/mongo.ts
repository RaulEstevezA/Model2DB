import { pyIdentifier, pyString } from '../../orm/python/python.ts'
import { todoText } from '../../todos.ts'
import type { DocumentWriter, GeneratedFile, WriteContext } from '../../types.ts'
import { buildDocumentView, type DocumentClass, type DocumentField, type DocumentView } from '../documents.ts'
import { pythonLiteral, pythonStrEnum, pythonValueType } from './pythonTypes.ts'
import type { DocumentSchema } from '../../../physical/types.ts'

/** The three Python writers for MongoDB: PyMongo (validators and indexes, no classes), MongoEngine and
 * Beanie (classes for stored and embedded documents). */

function header(title: string, library: string, then: string): string[] {
  return [`"""${library} written by Model2DB from ${title}. ${then}"""`, '']
}

function moduleImports(modules: Set<string>): string[] {
  const lines = [...modules]
    .filter((name) => name !== 'typing')
    .sort()
    .map((name) => `import ${name}`)
  return lines
}

// ---------- PyMongo ----------

function pymongoFile(physical: DocumentSchema, context: WriteContext): string {
  const out = [
    ...header(context.title, 'PyMongo collections', 'Run create_collections(db) once on an empty database.'),
    'from pymongo import ASCENDING',
    'from pymongo.database import Database',
    '',
  ]
  out.push('# The $jsonSchema validator of each collection', 'VALIDATORS = {')
  for (const collection of physical.collections)
    out.push(`    ${pyString(collection.name)}: ${pythonLiteral(collection.validator, '    ')},`)
  out.push('}', '', '# (fields, name, unique) of each collection', 'INDEXES = {')
  for (const collection of physical.collections)
    out.push(
      `    ${pyString(collection.name)}: [${collection.indexes.map((index) => `([${index.columns.map((column) => `(${pyString(column)}, ASCENDING)`).join(', ')}], ${pyString(index.name)}, ${index.unique ? 'True' : 'False'})`).join(', ')}],`,
    )
  out.push('}', '', '')
  for (const collection of physical.collections)
    for (const todo of collection.todos) out.push(`# ${todoText(todo, collection.model, 'collection')}`)
  out.push(
    'def create_collections(db: Database) -> None:',
    '    """Creates each collection with its validator, then its indexes."""',
    '    for name, validator in VALIDATORS.items():',
    '        db.create_collection(name, validator={"$jsonSchema": validator})',
    '        for keys, index_name, unique in INDEXES[name]:',
    '            db[name].create_index(keys, name=index_name, unique=unique)',
    '',
  )
  return out.join('\n')
}

export const pymongoOutput: DocumentWriter = {
  id: 'pymongo',
  label: 'PyMongo',
  group: 'python',
  write: (physical, context): GeneratedFile[] => [
    { name: 'collections.py', content: pymongoFile(physical, context), editorLanguage: 'python' },
  ],
}

// ---------- MongoEngine ----------

function mongoengineValue(field: DocumentField, modules: Set<string>): string {
  const type = field.type
  if (type.kind === 'enum') return `me.EnumField(${pyIdentifier(type.name)})`
  if (type.kind !== 'primitive') return 'me.DynamicField()'
  switch (type.name) {
    case 'string':
    case 'time':
    case 'duration':
      return 'me.StringField()'
    case 'integer':
      return type.bits === 64 ? 'me.LongField()' : 'me.IntField()'
    case 'float':
      return 'me.FloatField()'
    case 'decimal':
      return 'me.Decimal128Field()'
    case 'boolean':
      return 'me.BooleanField()'
    case 'date':
    case 'datetime':
      return 'me.DateTimeField()'
    case 'uuid':
      modules.add('uuid')
      return 'me.UUIDField(binary=False)'
    case 'binary':
      return 'me.BinaryField()'
    case 'any':
      return 'me.DynamicField()'
  }
}

/** The MongoEngine field of a document field, with its settings (`required`, `db_field`, `unique`). */
function mongoengineField(field: DocumentField, owner: DocumentClass, modules: Set<string>): string {
  let call: string
  switch (field.kind) {
    case 'embedded':
      call = `me.EmbeddedDocumentField(${pyString(field.target!)})`
      break
    case 'reference':
      call = `me.ReferenceField(${pyString(field.target!)})`
      break
    case 'map':
      call = `me.DictField(${mongoengineValue(field, modules)})`
      break
    case 'free':
      call = 'me.DynamicField()'
      break
    default:
      call = mongoengineValue(field, modules)
  }
  if (field.many) call = `me.ListField(${call})`
  const settings: string[] = []
  if (field.id) settings.push('primary_key=True')
  else {
    if (field.required && !field.many) settings.push('required=True')
    if (field.stored !== field.field.name) settings.push(`db_field=${pyString(field.stored)}`)
    if (field.unique && owner.collection) settings.push('unique=True')
  }
  if (settings.length === 0) return call
  return call.endsWith('()') ? `${call.slice(0, -1)}${settings.join(', ')})` : `${call.slice(0, -1)}, ${settings.join(', ')})`
}

/** MongoEngine names fields by attribute in its indexes: `author_id` → `authorId`, `a.b` by its first part. */
function attributeOf(item: DocumentClass, stored: string): string {
  const [first, ...rest] = stored.split('.')
  const field = item.fields.find((candidate) => candidate.stored === first)
  return [field ? field.field.name : first, ...rest].join('.')
}

function mongoengineFile(view: DocumentView, context: WriteContext): string {
  const modules = new Set<string>()
  const body: string[] = []
  for (const item of view.enums) body.push('', '', ...pythonStrEnum(item))
  if (view.enums.length > 0) modules.add('enum')
  // Embedded documents first: they are referred to by class name, but reading order helps
  const ordered = [...view.classes.filter((item) => !item.collection), ...view.classes.filter((item) => item.collection)]
  for (const item of ordered) {
    body.push('', '')
    for (const todo of item.todos) body.push(`# ${todoText(todo, item.name, 'collection')}`)
    body.push(`class ${pyIdentifier(item.name)}(me.${item.collection ? 'Document' : 'EmbeddedDocument'}):`)
    for (const field of item.fields) body.push(`    ${pyIdentifier(field.field.name)} = ${mongoengineField(field, item, modules)}`)
    if (item.collection) {
      const indexes = item.collection.indexes
        .filter((index) => !index.unique)
        .map(
          (index) =>
            `{"fields": [${index.columns.map((column) => pyString(attributeOf(item, column))).join(', ')}], "name": ${pyString(index.name)}}`,
        )
      body.push(
        '',
        `    meta = {"collection": ${pyString(item.collection.name)}${indexes.length > 0 ? `, "indexes": [${indexes.join(', ')}]` : ''}}`,
      )
    } else if (item.fields.length === 0) body.push('    pass')
  }
  return [
    ...header(context.title, 'MongoEngine documents', 'Review them before using them.'),
    ...moduleImports(modules),
    ...(modules.size > 0 ? [''] : []),
    'import mongoengine as me',
    ...body,
    '',
  ].join('\n')
}

export const mongoengineOutput: DocumentWriter = {
  id: 'mongoengine',
  label: 'MongoEngine',
  group: 'python',
  write: (physical, context): GeneratedFile[] => {
    const view = buildDocumentView(context.schema, context.design, physical, context.settings.naming)
    return [{ name: 'documents.py', content: mongoengineFile(view, context), editorLanguage: 'python' }]
  },
}

// ---------- Beanie ----------

function beanieType(field: DocumentField, modules: Set<string>): string {
  let type: string
  if (field.kind === 'embedded') type = pyIdentifier(field.target!)
  else if (field.kind === 'reference') type = `Link[${pyIdentifier(field.target!)}]`
  else if (field.kind === 'free') {
    modules.add('typing')
    type = 'Any'
  } else {
    const value = pythonValueType(field.type)
    value.modules.forEach((name) => modules.add(name))
    type = field.kind === 'map' ? `dict[str, ${value.type}]` : value.type
  }
  if (field.many) type = `list[${type}]`
  return type
}

function beanieFile(view: DocumentView, context: WriteContext): string {
  const modules = new Set<string>()
  const body: string[] = []
  let usesLink = false
  let usesField = false
  for (const item of view.enums) body.push('', '', ...pythonStrEnum(item))
  if (view.enums.length > 0) modules.add('enum')
  const ordered = [...view.classes.filter((item) => !item.collection), ...view.classes.filter((item) => item.collection)]
  for (const item of ordered) {
    body.push('', '')
    for (const todo of item.todos) body.push(`# ${todoText(todo, item.name, 'collection')}`)
    body.push(`class ${pyIdentifier(item.name)}(${item.collection ? 'Document' : 'BaseModel'}):`)
    for (const field of item.fields) {
      if (field.kind === 'reference') usesLink = true
      let type = beanieType(field, modules)
      const settings: string[] = []
      if (field.id) {
        body.push(`    id: ${type} = Field(alias="_id")`)
        usesField = true
        continue
      }
      if (field.many) settings.push('default_factory=list')
      else if (!field.required || field.nullable) {
        type = `${type} | None`
        settings.push('default=None')
      }
      if (field.stored !== field.field.name) settings.push(`alias=${pyString(field.stored)}`)
      if (settings.length > 0) usesField = true
      // A class may be declared further down: the whole annotation goes in quotes
      if (field.kind === 'embedded' || field.kind === 'reference') type = pyString(type)
      body.push(`    ${pyIdentifier(field.field.name)}: ${type}${settings.length > 0 ? ` = Field(${settings.join(', ')})` : ''}`)
    }
    if (item.collection) {
      const indexes = item.collection.indexes.map(
        (index) =>
          `IndexModel([${index.columns.map((column) => `(${pyString(column)}, ASCENDING)`).join(', ')}], name=${pyString(index.name)}${index.unique ? ', unique=True' : ''})`,
      )
      body.push('', '    class Settings:', `        name = ${pyString(item.collection.name)}`)
      if (indexes.length > 0) body.push(`        indexes = [${indexes.join(', ')}]`)
    } else if (item.fields.length === 0) body.push('    pass')
  }
  const beanie = ['Document', ...(usesLink ? ['Link'] : [])]
  const pydantic = ['BaseModel', ...(usesField ? ['Field'] : [])]
  const usesIndexes = view.classes.some((item) => (item.collection?.indexes.length ?? 0) > 0)
  return [
    ...header(context.title, 'Beanie documents', 'Pass the Document classes to init_beanie(). Review them before using them.'),
    ...moduleImports(modules),
    ...(modules.has('typing') ? ['from typing import Any'] : []),
    ...(modules.size > 0 ? [''] : []),
    `from beanie import ${beanie.join(', ')}`,
    `from pydantic import ${pydantic.join(', ')}`,
    ...(usesIndexes ? ['from pymongo import ASCENDING, IndexModel'] : []),
    ...body,
    '',
  ].join('\n')
}

export const beanieOutput: DocumentWriter = {
  id: 'beanie',
  label: 'Beanie',
  group: 'python',
  write: (physical, context): GeneratedFile[] => {
    const view = buildDocumentView(context.schema, context.design, physical, context.settings.naming)
    return [{ name: 'documents.py', content: beanieFile(view, context), editorLanguage: 'python' }]
  },
}
