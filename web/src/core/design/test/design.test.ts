import { describe, expect, it } from 'vitest'
import { findExample } from '../../../examples/index.ts'
import { schemaOf } from '../../test/helpers.ts'
import { decide, reconcile, setFieldInclude, setFieldOverride } from '../edit.ts'
import { proposeDesign } from '../propose.ts'
import { findFieldDesign, findModelDesign, type Design } from '../types.ts'

const store = () => schemaOf(findExample('store')!.text, 'typescript')
const jpa = () => schemaOf(findExample('jpa')!.text, 'java')

const relation = (design: Design, model: string, field: string) => findFieldDesign(design, model, field)?.relation
const key = (design: Design, model: string) => findModelDesign(design, model)?.key

describe('keys', () => {
  it('takes a declared key as exact and a field named id as high', () => {
    expect(key(proposeDesign(jpa(), 'relational'), 'Book')).toMatchObject({ value: { kind: 'field', field: 'id' }, confidence: 'exact' })
    expect(key(proposeDesign(store(), 'relational'), 'Order')).toMatchObject({ value: { kind: 'field', field: 'id' }, confidence: 'high' })
  })

  it('asks before choosing between a natural key and a new one', () => {
    const schema = schemaOf('interface Country { code: string; name: string }', 'typescript')
    expect(key(proposeDesign(schema, 'relational'), 'Country')).toMatchObject({
      value: { kind: 'surrogate', type: 'integer' },
      status: 'pending',
      confidence: 'review',
      reasons: [{ code: 'keyCandidates', params: { fields: 'code' } }],
    })
  })

  it('does not take a postal code for a key', () => {
    const schema = schemaOf('interface Place { zipCode: string; city: string }', 'typescript')
    expect(key(proposeDesign(schema, 'relational'), 'Place')).toMatchObject({ confidence: 'probable', reasons: [{ code: 'keyMissing' }] })
  })

  it('uses MongoDB _id when the model has no key', () => {
    const schema = schemaOf('interface Note { text: string }', 'typescript')
    expect(key(proposeDesign(schema, 'document'), 'Note')).toMatchObject({
      value: { kind: 'surrogate', type: 'objectId' },
      confidence: 'exact',
    })
  })
})

describe('relations in a relational database', () => {
  const design = proposeDesign(store(), 'relational')

  it('refers to models with their own key', () => {
    expect(relation(design, 'Order', 'customer')).toMatchObject({ value: 'reference', confidence: 'high', status: 'active' })
  })

  it('flattens value objects into columns', () => {
    expect(relation(design, 'Customer', 'shippingAddress')).toMatchObject({ value: 'flatten', confidence: 'probable' })
  })

  it('stores a list of models without a key in a child table', () => {
    expect(relation(design, 'Order', 'lines')).toMatchObject({ value: 'child', confidence: 'high', reasons: [{ code: 'ownedList' }] })
  })

  it('joins lists that point at each other', () => {
    expect(relation(design, 'Product', 'categories')).toMatchObject({ value: 'join', reasons: [{ code: 'bothSidesLists' }] })
  })

  it('keeps maps in JSON and offers a table for lists of values', () => {
    expect(relation(design, 'Product', 'attributes')).toMatchObject({ value: 'json', options: ['json', 'child'] })
    expect(relation(design, 'Order', 'tags')).toMatchObject({ value: 'child', options: ['child', 'array', 'json'] })
  })

  it('takes declared relations as exact', () => {
    const declared = proposeDesign(jpa(), 'relational')
    expect(relation(declared, 'Book', 'author')).toMatchObject({ value: 'reference', confidence: 'exact' })
    expect(relation(declared, 'Book', 'shelf')).toMatchObject({ value: 'flatten', confidence: 'exact' })
    expect(relation(declared, 'Book', 'tags')).toMatchObject({ value: 'join', confidence: 'exact' })
  })

  it('asks when a list of shared models could be one-to-many or many-to-many', () => {
    const schema = schemaOf(
      `interface Product { id: number; name: string }
       interface Cart { id: number; products: Product[] }
       interface Wishlist { id: number; products: Product[] }`,
      'typescript',
    )
    expect(relation(proposeDesign(schema, 'relational'), 'Cart', 'products')).toMatchObject({
      value: 'join',
      status: 'pending',
      confidence: 'review',
    })
  })

  it('suggests unique columns by name without applying them', () => {
    expect(findFieldDesign(design, 'Customer', 'email')?.unique).toMatchObject({ value: true, status: 'pending' })
    expect(findFieldDesign(proposeDesign(jpa(), 'relational'), 'Author', 'email')?.unique).toMatchObject({ value: true, status: 'active' })
  })

  it('links a field named after another model to its key', () => {
    const schema = schemaOf('interface Customer { id: number }\ninterface Order { id: number; customerId: number }', 'typescript')
    expect(findFieldDesign(proposeDesign(schema, 'relational'), 'Order', 'customerId')?.foreignKey).toMatchObject({
      value: 'Customer',
      confidence: 'high',
    })
  })
})

describe('relations in a document database', () => {
  const prisma = proposeDesign(schemaOf(findExample('prisma')!.text, 'prisma'), 'document')

  it('embeds value objects and refers to documents that lead back', () => {
    expect(relation(prisma, 'User', 'profile')).toMatchObject({ value: 'embed', confidence: 'high' })
    expect(relation(prisma, 'User', 'posts')).toMatchObject({ value: 'reference', reasons: [{ code: 'recursiveEmbed' }] })
  })

  it('asks before embedding a document other models also use', () => {
    const schema = schemaOf(
      `interface Customer { id: number; name: string }
       interface Order { id: number; customer: Customer }
       interface Invoice { id: number; customer: Customer }`,
      'typescript',
    )
    expect(relation(proposeDesign(schema, 'document'), 'Order', 'customer')).toMatchObject({
      value: 'reference',
      status: 'pending',
      options: ['embed', 'reference'],
    })
  })
})

describe('edits', () => {
  it('confirms a suggestion or chooses another option', () => {
    const design = proposeDesign(store(), 'relational')
    const confirmed = decide(design, { kind: 'unique', model: 'Customer', field: 'email' })
    expect(findFieldDesign(confirmed, 'Customer', 'email')?.unique).toMatchObject({ value: true, status: 'active', manual: true })
    const json = decide(design, { kind: 'relation', model: 'Order', field: 'lines' }, 'json')
    expect(relation(json, 'Order', 'lines')).toMatchObject({ value: 'json', manual: true })
    // The previous design is untouched, so it can be undone
    expect(relation(design, 'Order', 'lines')?.value).toBe('child')
  })

  it('refuses values the decision does not offer', () => {
    const design = proposeDesign(store(), 'relational')
    expect(decide(design, { kind: 'relation', model: 'Order', field: 'customer' }, 'join')).toBe(design)
  })

  it('keeps manual decisions and overrides when the input changes', () => {
    let design = proposeDesign(store(), 'relational')
    design = decide(design, { kind: 'relation', model: 'Order', field: 'customer' }, 'json')
    design = setFieldInclude(design, 'Customer', 'phone', false)
    design = setFieldOverride(design, 'Customer', 'fullName', 'type', 'VARCHAR(80)')
    const changed = store().models.map((model) =>
      model.name === 'Customer' ? { ...model, fields: [...model.fields, { ...model.fields[1], name: 'nickname' }] } : model,
    )
    const next = reconcile(design, { ...store(), models: changed }, 'relational')
    expect(relation(next, 'Order', 'customer')).toMatchObject({ value: 'json', manual: true })
    expect(findFieldDesign(next, 'Customer', 'phone')?.include).toBe(false)
    expect(findFieldDesign(next, 'Customer', 'fullName')?.type).toBe('VARCHAR(80)')
    expect(findFieldDesign(next, 'Customer', 'nickname')).toBeDefined()
  })

  it('starts over when the database kind changes', () => {
    const design = decide(proposeDesign(store(), 'relational'), { kind: 'relation', model: 'Order', field: 'customer' }, 'json')
    expect(relation(reconcile(design, store(), 'document'), 'Order', 'customer')?.manual).toBeUndefined()
  })
})
