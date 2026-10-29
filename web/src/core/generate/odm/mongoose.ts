import type { TypeRef } from '../../model/schema.ts'
import { tsString } from '../orm/typescript/typescript.ts'
import { todoText } from '../todos.ts'
import { fileBase, type DocumentWriter, type GeneratedFile, type WriteContext } from '../types.ts'
import { buildDocumentView, type DocumentClass, type DocumentField, type DocumentView } from './documents.ts'

/** Mongoose schemas and models in TypeScript: a schema per embedded model (`_id: false`), a model per
 * collection, references by the referenced document's `_id`. */

function schemaType(type: TypeRef): string {
  if (type.kind === 'enum') return 'String'
  if (type.kind !== 'primitive') return 'Schema.Types.Mixed'
  switch (type.name) {
    case 'integer':
    case 'float':
      return 'Number'
    case 'decimal':
      return 'Schema.Types.Decimal128'
    case 'boolean':
      return 'Boolean'
    case 'date':
    case 'datetime':
      return 'Date'
    case 'uuid':
      return 'Schema.Types.UUID'
    case 'binary':
      return 'Buffer'
    case 'any':
      return 'Schema.Types.Mixed'
    default:
      return 'String'
  }
}

function schemaVariable(name: string): string {
  return `${name.charAt(0).toLowerCase()}${name.slice(1)}Schema`
}

/** The type of the `_id` other documents store to refer to a class. */
function idType(view: DocumentView, target: string): string {
  const item = view.classes.find((candidate) => candidate.name === target)
  const id = item?.fields.find((field) => field.id)
  return id ? schemaType(id.type) : 'Schema.Types.ObjectId'
}

function fieldDefinition(field: DocumentField, view: DocumentView): string {
  let definition: string
  const settings: string[] = []
  switch (field.kind) {
    case 'embedded':
      definition = schemaVariable(field.target!)
      break
    case 'reference':
      definition = `{ type: ${idType(view, field.target!)}, ref: ${tsString(field.target!)} }`
      break
    case 'map':
      definition = `{ type: Map, of: ${schemaType(field.type)} }`
      break
    case 'free':
      definition = 'Schema.Types.Mixed'
      break
    default:
      definition = schemaType(field.type)
  }
  if (field.many) definition = `[${definition}]`
  const plain = !field.many && (field.kind === 'value' || field.kind === 'embedded')
  if (!plain) return definition
  if (field.required && !field.id) settings.push('required: true')
  if (field.enum)
    settings.push(
      `enum: [${field.enum.values.map((value) => (typeof (value.value ?? value.name) === 'number' ? value.value : tsString(String(value.value ?? value.name)))).join(', ')}]`,
    )
  if (field.nullable) settings.push('default: null')
  return settings.length > 0 ? `{ type: ${definition}, ${settings.join(', ')} }` : definition
}

function schemaBlock(item: DocumentClass, view: DocumentView): string[] {
  const lines = [`const ${schemaVariable(item.name)} = new Schema(`, '  {']
  for (const field of item.fields) {
    const key = field.id ? '_id' : field.stored
    lines.push(`    ${/^[A-Za-z_$][\w$]*$/.test(key) ? key : tsString(key)}: ${fieldDefinition(field, view)},`)
  }
  const options = item.collection ? [`collection: ${tsString(item.collection.name)}`, 'versionKey: false'] : ['_id: false']
  lines.push('  },', `  { ${options.join(', ')} },`, ')')
  for (const index of item.collection?.indexes ?? [])
    lines.push(
      `${schemaVariable(item.name)}.index({ ${index.columns.map((column) => `${tsString(column)}: 1`).join(', ')} }, { name: ${tsString(index.name)}${index.unique ? ', unique: true' : ''} })`,
    )
  return lines
}

/** Schemas in an order where each comes after the embedded schemas it uses as values. */
function declarationOrder(view: DocumentView): DocumentClass[] {
  const done = new Set<string>()
  const result: DocumentClass[] = []
  const visit = (item: DocumentClass, path: Set<string>) => {
    if (done.has(item.name) || path.has(item.name)) return
    path.add(item.name)
    for (const field of item.fields) {
      const target = field.kind === 'embedded' ? view.classes.find((candidate) => candidate.name === field.target) : undefined
      if (target) visit(target, path)
    }
    done.add(item.name)
    result.push(item)
  }
  for (const item of view.classes) visit(item, new Set())
  return result
}

function modelsFile(view: DocumentView, context: WriteContext): string {
  const body: string[] = []
  const stored = view.classes.filter((item) => item.collection)
  for (const item of declarationOrder(view)) {
    body.push('')
    for (const todo of item.todos) body.push(`// ${todoText(todo, item.name, 'collection')}`)
    body.push(...schemaBlock(item, view))
  }
  body.push('')
  for (const item of stored) body.push(`export const ${item.name} = model(${tsString(item.name)}, ${schemaVariable(item.name)})`)
  return [
    `// Mongoose schemas written by Model2DB from ${context.title}. Review them before using them.`,
    "import { Schema, model } from 'mongoose'",
    ...body,
    '',
  ].join('\n')
}

export const mongooseOutput: DocumentWriter = {
  id: 'mongoose',
  label: 'Mongoose',
  group: 'typescript',
  write: (physical, context): GeneratedFile[] => {
    const view = buildDocumentView(context.schema, context.design, physical, context.settings.naming)
    return [{ name: `models/${fileBase(context.title)}.models.ts`, content: modelsFile(view, context), editorLanguage: 'typescript' }]
  },
}
