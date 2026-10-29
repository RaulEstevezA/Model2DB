import { nameWords, singularize } from '../model/naming.ts'
import { allFields, findModel, modelOf, type FieldDef, type ModelDef, type ModelSchema, type TypeRef } from '../model/schema.ts'
import { declaredRelation, declaresEmbeddable, declaresKey, declaresUnique } from './hints.ts'
import type {
  Confidence,
  Decision,
  Design,
  EnumDesign,
  FieldDesign,
  KeyChoice,
  ModelDesign,
  Reason,
  ReasonCode,
  RelationChoice,
  StorageTarget,
} from './types.ts'

/** Proposes a persistence design for a model schema. Facts declared in the input (keys, relations,
 * unique columns) are exact; inferences carry the confidence they deserve, and anything that could
 * reasonably go two ways is left pending with a suggestion, never applied (UX_GUIDE.md, ambiguity). */
export function proposeDesign(schema: ModelSchema, target: StorageTarget): Design {
  const context = analyze(schema)
  return {
    target,
    models: schema.models.map((model) => proposeModel(context, model, target)),
    enums: target === 'relational' ? schema.enums.map((item) => proposeEnum(item.name)) : [],
  }
}

// ---------- Analysis shared by every proposal ----------

interface Usage {
  from: string
  field: string
  /** Through a list or a map */
  many: boolean
}

export interface SchemaContext {
  schema: ModelSchema
  /** Fields of other models (or the same one) whose type leads to each model */
  usages: Map<string, Usage[]>
  /** Models named in some `extends` */
  parents: Set<string>
}

export function analyze(schema: ModelSchema): SchemaContext {
  const usages = new Map<string, Usage[]>()
  const parents = new Set<string>()
  for (const model of schema.models) {
    for (const parent of model.extends ?? []) parents.add(parent)
    for (const field of model.fields) {
      const target = modelOf(field.type)
      if (!target || !findModel(schema, target)) continue
      const list = usages.get(target) ?? []
      list.push({ from: model.name, field: field.name, many: field.type.kind !== 'model' })
      usages.set(target, list)
    }
  }
  return { schema, usages, parents }
}

/** Not used as the type of any field: a model stored on its own unless the user leaves it out. */
export function isTopLevel(context: SchemaContext, model: string): boolean {
  return (context.usages.get(model) ?? []).every((usage) => usage.from === model)
}

/** Only used as a parent of other models (a base class): its fields go into its children's tables. */
export function isParentOnly(context: SchemaContext, model: string): boolean {
  return context.parents.has(model) && isTopLevel(context, model)
}

const decision = <T>(value: T, confidence: Confidence, reasons: Reason[], options: T[]): Decision<T> => ({
  value,
  status: confidence === 'review' || confidence === 'conflict' ? 'pending' : 'active',
  confidence,
  reasons,
  options,
})

const reason = (code: ReasonCode, params?: Record<string, string | number>): Reason => (params ? { code, params } : { code })

const KEY_TYPES = new Set(['integer', 'uuid', 'string'])

/** A field that could be a primary key: a non-null integer, UUID or text. A number without a size
 * (TypeScript's `number`) counts as an integer: the key column is written as one. */
function keyable(field: FieldDef): boolean {
  const type = field.type
  if (type.kind !== 'primitive' || field.nullable) return false
  return KEY_TYPES.has(type.name) || (type.name === 'float' && type.bits === undefined)
}

/** Fields named like the model's identifier: `id`, `orderId`, `order_id`. */
function namedKey(model: ModelDef, field: FieldDef): boolean {
  const words = nameWords(field.name)
  if (words.length === 1 && (words[0] === 'id' || words[0] === 'uuid')) return true
  const modelWords = nameWords(model.name)
  return words.length === modelWords.length + 1 && words[words.length - 1] === 'id' && modelWords.every((word, i) => words[i] === word)
}

// Values that usually identify a row when there is no id: worth asking about, never assumed
const NATURAL_KEYS = new Set(['code', 'sku', 'slug', 'key', 'isbn', 'username', 'email', 'number', 'reference', 'handle'])

/** `sku`, `code`, or the model's own code (`productCode`, `invoiceNumber`); not `zipCode`. */
function naturalKey(model: ModelDef, field: FieldDef): boolean {
  const words = nameWords(field.name)
  if (!NATURAL_KEYS.has(words[words.length - 1])) return false
  if (words.length === 1) return true
  const modelWords = nameWords(model.name)
  return words.length === modelWords.length + 1 && modelWords.every((word, i) => words[i] === word)
}

/** The key field the model declares or is obviously named for, if any. */
export function keyField(model: ModelDef, fields: FieldDef[]): { field: FieldDef; declared: boolean } | null {
  const declared = fields.find(declaresKey)
  if (declared) return { field: declared, declared: true }
  const named = fields.find((field) => namedKey(model, field) && keyable(field))
  return named ? { field: named, declared: false } : null
}

export function hasKey(context: SchemaContext, name: string): boolean {
  const model = findModel(context.schema, name)
  return model !== undefined && keyField(model, allFields(context.schema, model)) !== null
}

// ---------- Models ----------

function proposeModel(context: SchemaContext, model: ModelDef, target: StorageTarget): ModelDesign {
  const fields = allFields(context.schema, model)
  return {
    model: model.name,
    include: !isParentOnly(context, model.name),
    key: proposeKey(model, fields, target),
    fields: fields.map((field) => proposeField(context, model, fields, field, target)),
  }
}

function proposeKey(model: ModelDef, fields: FieldDef[], target: StorageTarget): Decision<KeyChoice> {
  const surrogates: KeyChoice[] =
    target === 'document'
      ? [{ kind: 'surrogate', type: 'objectId' }]
      : [
          { kind: 'surrogate', type: 'integer' },
          { kind: 'surrogate', type: 'uuid' },
        ]
  const declared = fields.filter(declaresKey)
  const options: KeyChoice[] = [
    ...fields
      .filter((field) => keyable(field) || declared.includes(field))
      .map((field): KeyChoice => ({ kind: 'field', field: field.name })),
    ...surrogates,
  ]
  if (declared.length > 1)
    return decision<KeyChoice>(
      { kind: 'field', field: declared[0].name },
      'conflict',
      [reason('keyCandidates', { fields: declared.map((f) => f.name).join(', ') })],
      options,
    )
  const found = keyField(model, fields)
  if (found)
    return decision<KeyChoice>(
      { kind: 'field', field: found.field.name },
      found.declared ? 'exact' : 'high',
      [reason(found.declared ? 'keyDeclared' : 'keyNamed', { field: found.field.name })],
      options,
    )
  if (target === 'document') return decision(surrogates[0], 'exact', [reason('keyMongo')], options)
  const candidates = fields.filter((field) => keyable(field) && naturalKey(model, field))
  if (candidates.length > 0)
    return decision(
      surrogates[0],
      'review',
      [reason('keyCandidates', { fields: candidates.map((field) => field.name).join(', ') })],
      options,
    )
  return decision(surrogates[0], 'probable', [reason('keyMissing')], options)
}

// ---------- Fields ----------

function proposeField(context: SchemaContext, model: ModelDef, fields: FieldDef[], field: FieldDef, target: StorageTarget): FieldDesign {
  const design: FieldDesign = { field: field.name, include: true }
  const relation = proposeRelation(context, model, field, target)
  if (relation) design.relation = relation
  else {
    const foreignKey = target === 'relational' ? proposeForeignKey(context, model, fields, field) : null
    if (foreignKey) design.foreignKey = foreignKey
    const unique = proposeUnique(model, fields, field)
    if (unique) design.unique = unique
  }
  return design
}

/** Unique columns: declared ones are exact; names that are usually unique are only suggested. */
function proposeUnique(model: ModelDef, fields: FieldDef[], field: FieldDef): Decision<boolean> | null {
  if (field.type.kind !== 'primitive') return null
  const key = keyField(model, fields)
  if (key?.field.name === field.name) return null
  if (declaresUnique(field)) return decision(true, 'exact', [reason('uniqueDeclared')], [true, false])
  const words = nameWords(field.name)
  const last = words[words.length - 1]
  if (['email', 'username', 'slug', 'sku', 'isbn', 'login', 'handle'].includes(last) && words.length <= 2)
    return decision(true, 'review', [reason('uniqueNamed', { field: field.name })], [true, false])
  return null
}

/** `customerId` next to a `Customer` model: the column most likely holds its key. */
function proposeForeignKey(context: SchemaContext, model: ModelDef, fields: FieldDef[], field: FieldDef): Decision<string | null> | null {
  if (!keyable({ ...field, nullable: false })) return null
  const words = nameWords(field.name)
  if (words.length < 2 || words[words.length - 1] !== 'id') return null
  if (keyField(model, fields)?.field.name === field.name) return null
  const stem = words.slice(0, -1).join('')
  const target = context.schema.models.find((item) => nameWords(item.name).join('') === stem)
  if (!target || !hasKey(context, target.name)) return null
  // `customer: Customer` next to it already says it: the reference reuses this column (physical/build.ts)
  if (fields.some((other) => other.type.kind === 'model' && other.type.name === target.name)) return null
  return decision<string | null>(target.name, 'high', [reason('foreignKeyNamed', { model: target.name })], [target.name, null])
}

// ---------- Relations ----------

type Shape =
  | { kind: 'model'; target: string }
  | { kind: 'models'; target: string }
  | { kind: 'values' }
  | { kind: 'map'; plain: boolean }
  | { kind: 'free'; unknown: boolean }

function shapeOf(context: SchemaContext, type: TypeRef): Shape | null {
  if (type.kind === 'model')
    return findModel(context.schema, type.name) ? { kind: 'model', target: type.name } : { kind: 'free', unknown: true }
  if (type.kind === 'unknown') return { kind: 'free', unknown: true }
  if (type.kind === 'primitive') return type.name === 'any' ? { kind: 'free', unknown: false } : null
  if (type.kind === 'enum') return null
  if (type.kind === 'map') return { kind: 'map', plain: type.value.kind === 'primitive' || type.value.kind === 'enum' }
  const items = type.items
  if (items.kind === 'model' && findModel(context.schema, items.name)) return { kind: 'models', target: items.name }
  if (items.kind === 'primitive' || items.kind === 'enum')
    return items.kind === 'primitive' && items.name === 'any' ? { kind: 'free', unknown: false } : { kind: 'values' }
  return { kind: 'free', unknown: items.kind === 'unknown' }
}

/** Fields of a model can all become columns of another table: scalars, enums and value objects. */
function flattenable(context: SchemaContext, name: string, seen: Set<string> = new Set()): boolean {
  if (seen.has(name)) return false
  seen.add(name)
  const model = findModel(context.schema, name)
  if (!model) return false
  return allFields(context.schema, model).every((field) => {
    const type = field.type
    if (type.kind === 'primitive') return type.name !== 'any'
    if (type.kind === 'enum') return true
    if (type.kind === 'model') return flattenable(context, type.name, seen)
    return false
  })
}

/** Whether `from` can lead back to `to` through the fields of the models, which makes embedding endless. */
export function reaches(context: SchemaContext, from: string, to: string, seen: Set<string> = new Set()): boolean {
  if (from === to) return true
  if (seen.has(from)) return false
  seen.add(from)
  const model = findModel(context.schema, from)
  if (!model) return false
  return allFields(context.schema, model).some((field) => {
    const next = modelOf(field.type)
    return next !== null && reaches(context, next, to, seen)
  })
}

function backReference(context: SchemaContext, owner: string, child: string): string | null {
  const model = findModel(context.schema, child)
  if (!model) return null
  const ownerWords = nameWords(owner).join('')
  for (const field of allFields(context.schema, model)) {
    if (field.type.kind === 'model' && field.type.name === owner) return field.name
    const words = nameWords(field.name)
    if (words.length >= 2 && words[words.length - 1] === 'id' && words.slice(0, -1).join('') === ownerWords) return field.name
  }
  return null
}

function listsBack(context: SchemaContext, owner: string, child: string): string | null {
  const model = findModel(context.schema, child)
  if (!model) return null
  const field = allFields(context.schema, model).find((item) => item.type.kind === 'array' && modelOf(item.type) === owner)
  return field?.name ?? null
}

function otherUsages(context: SchemaContext, target: string, from: string, field: string): Usage[] {
  return (context.usages.get(target) ?? []).filter((usage) => !(usage.from === from && usage.field === field))
}

function proposeRelation(
  context: SchemaContext,
  model: ModelDef,
  field: FieldDef,
  target: StorageTarget,
): Decision<RelationChoice> | undefined {
  const shape = shapeOf(context, field.type)
  if (!shape) return undefined
  return target === 'relational' ? relational(context, model, field, shape) : documental(context, model, field, shape)
}

function relational(context: SchemaContext, model: ModelDef, field: FieldDef, shape: Shape): Decision<RelationChoice> {
  const declared = declaredRelation(field)
  switch (shape.kind) {
    case 'model': {
      const options: RelationChoice[] = ['reference', ...(flattenable(context, shape.target) ? (['flatten'] as const) : []), 'json']
      const targetModel = findModel(context.schema, shape.target)!
      if (declared === 'embedded' || declaresEmbeddable(targetModel))
        return decision<RelationChoice>(options.includes('flatten') ? 'flatten' : 'json', 'exact', [reason('relationDeclared')], options)
      if (declared === 'manyToOne' || declared === 'oneToOne')
        return decision<RelationChoice>('reference', 'exact', [reason('relationDeclared')], options)
      if (shape.target === model.name) return decision<RelationChoice>('reference', 'exact', [reason('selfReference')], options)
      if (hasKey(context, shape.target))
        return decision<RelationChoice>('reference', 'high', [reason('targetHasKey', { model: shape.target })], options)
      if (options.includes('flatten'))
        return decision<RelationChoice>('flatten', 'probable', [reason('valueObject', { model: shape.target })], options)
      return decision<RelationChoice>('reference', 'review', [reason('notFlattenable', { model: shape.target })], options)
    }
    case 'models': {
      const options: RelationChoice[] = ['child', 'join', 'json']
      if (declared === 'oneToMany' || declared === 'elementCollection')
        return decision<RelationChoice>('child', 'exact', [reason('relationDeclared')], options)
      if (declared === 'manyToMany') return decision<RelationChoice>('join', 'exact', [reason('relationDeclared')], options)
      if (shape.target === model.name) return decision<RelationChoice>('child', 'high', [reason('selfReference')], options)
      const back = backReference(context, model.name, shape.target)
      if (back) return decision<RelationChoice>('child', 'high', [reason('backReference', { model: shape.target, field: back })], options)
      const mirror = listsBack(context, model.name, shape.target)
      if (mirror)
        return decision<RelationChoice>('join', 'high', [reason('bothSidesLists', { model: shape.target, field: mirror })], options)
      const others = otherUsages(context, shape.target, model.name, field.name)
      if (others.length > 0 && hasKey(context, shape.target))
        return decision<RelationChoice>(
          'join',
          'review',
          [reason('sharedTarget', { model: shape.target, users: others.map((u) => u.from).join(', ') })],
          options,
        )
      return decision<RelationChoice>(
        'child',
        hasKey(context, shape.target) ? 'probable' : 'high',
        [reason('ownedList', { model: shape.target })],
        options,
      )
    }
    case 'values': {
      const options: RelationChoice[] = ['child', 'array', 'json']
      if (declared === 'elementCollection') return decision<RelationChoice>('child', 'exact', [reason('relationDeclared')], options)
      return decision<RelationChoice>('child', 'probable', [reason('primitiveList')], options)
    }
    case 'map': {
      const options: RelationChoice[] = shape.plain ? ['json', 'child'] : ['json']
      return decision<RelationChoice>('json', 'high', [reason('mapOfValues')], options)
    }
    case 'free':
      return decision<RelationChoice>(
        'json',
        shape.unknown ? 'review' : 'probable',
        [reason('freeShape', { type: field.originalType ?? '' })],
        ['json'],
      )
  }
}

function documental(context: SchemaContext, model: ModelDef, field: FieldDef, shape: Shape): Decision<RelationChoice> {
  if (shape.kind !== 'model' && shape.kind !== 'models') {
    const reasons =
      shape.kind === 'values'
        ? [reason('primitiveList')]
        : shape.kind === 'map'
          ? [reason('mapOfValues')]
          : [reason('freeShape', { type: field.originalType ?? '' })]
    return decision<RelationChoice>('embed', shape.kind === 'free' && shape.unknown ? 'review' : 'exact', reasons, ['embed'])
  }
  const options: RelationChoice[] = ['embed', 'reference']
  const declared = declaredRelation(field)
  if (reaches(context, shape.target, model.name))
    return decision<RelationChoice>(
      'reference',
      shape.target === model.name ? 'exact' : 'high',
      [reason('recursiveEmbed', { model: shape.target })],
      options,
    )
  if (declared === 'embedded' || declared === 'elementCollection' || declaresEmbeddable(findModel(context.schema, shape.target)!))
    return decision<RelationChoice>('embed', 'exact', [reason('relationDeclared')], options)
  if (!hasKey(context, shape.target))
    return decision<RelationChoice>('embed', 'high', [reason('valueObject', { model: shape.target })], options)
  const others = otherUsages(context, shape.target, model.name, field.name)
  if (others.length > 0 || isTopLevel(context, shape.target))
    return decision<RelationChoice>(
      'reference',
      'review',
      [reason('sharedTarget', { model: shape.target, users: others.map((u) => u.from).join(', ') })],
      options,
    )
  return decision<RelationChoice>(
    'embed',
    'probable',
    [reason(shape.kind === 'models' ? 'unboundedList' : 'ownedList', { model: shape.target })],
    options,
  )
}

// ---------- Enums ----------

function proposeEnum(name: string): EnumDesign {
  return { enum: name, storage: decision('check', 'high', [reason('enumCheck')], ['check', 'native', 'lookup', 'text']) }
}

/** Singular name of a list field, for the tables and columns made from it (`tags` → `tag`). */
export function singularField(field: string): string {
  const words = nameWords(field)
  if (words.length === 0) return field
  words[words.length - 1] = singularize(words[words.length - 1])
  return words.join('_')
}
