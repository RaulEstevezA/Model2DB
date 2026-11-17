import { describe, expect, it } from 'vitest'
import { pendingDecisions } from '../../../app/workspace.ts'
import { schemaOf } from '../../test/helpers.ts'
import { modelRoles } from '../../physical/roles.ts'
import { addQuery, decide, reconcile, removeQuery, setQuery } from '../edit.ts'
import { proposeDesign } from '../propose.ts'
import { findModelDesign, type Design } from '../types.ts'

const BLOG = `
interface User { id: number; email: string }
interface Post { id: number; userId: number; title: string; createdAt: Date; updatedAt: Date }
`
const blog = () => schemaOf(BLOG, 'typescript')
const queries = (design: Design, model = 'Post') => findModelDesign(design, model)?.queries

describe('proposed queries', () => {
  it('proposes the rows of an owner, newest first, and waits for the user', () => {
    expect(queries(proposeDesign(blog(), 'relational'))).toEqual([
      {
        filter: ['userId'],
        sort: [{ field: 'createdAt', direction: 'desc' }],
        status: 'pending',
        reasons: [{ code: 'queryByOwner', params: { field: 'userId', sort: 'createdAt' } }],
      },
    ])
    expect(queries(proposeDesign(blog(), 'relational'), 'User')).toEqual([])
  })

  it('also proposes it for a reference to another model', () => {
    const schema = schemaOf('interface User { id: number }\ninterface Post { id: number; author: User; publishedOn: Date }', 'typescript')
    expect(queries(proposeDesign(schema, 'relational'))?.[0]).toMatchObject({
      filter: ['author'],
      sort: [{ field: 'publishedOn', direction: 'desc' }],
    })
  })

  it('does not propose without a date to order by', () => {
    const schema = schemaOf('interface User { id: number }\ninterface Post { id: number; userId: number; updatedAt: Date }', 'typescript')
    expect(queries(proposeDesign(schema, 'relational'))).toEqual([])
  })

  it('is left out where the database has no query indexes yet', () => {
    expect(queries(proposeDesign(blog(), 'widecolumn'))).toBeUndefined()
    expect(queries(proposeDesign(blog(), 'keyvalue'))).toBeUndefined()
  })

  it('appears in the review list and is accepted from there', () => {
    const design = proposeDesign(blog(), 'relational')
    const pending = pendingDecisions(design, modelRoles(blog(), design)).filter((item) => item.ref.kind === 'query')
    expect(pending).toEqual([{ ref: { kind: 'query', model: 'Post', index: 0 }, reasons: queries(design)![0].reasons }])
    expect(queries(decide(design, pending[0].ref))![0].status).toBe('active')
  })
})

describe('editing queries', () => {
  it('writes, changes and removes queries', () => {
    let design = addQuery(proposeDesign(blog(), 'relational'), 'Post', ['title', 'title'], [{ field: 'title', direction: 'asc' }])
    expect(queries(design)![1]).toEqual({ filter: ['title'], sort: [], status: 'active', reasons: [] })
    design = setQuery(design, 'Post', 0, ['userId'], [])
    expect(queries(design)![0]).toEqual({ filter: ['userId'], sort: [], status: 'active', reasons: [] })
    design = removeQuery(design, 'Post', 0)
    expect(queries(design)).toHaveLength(1)
    expect(addQuery(design, 'Post', [], [])).toBe(design)
  })

  it('keeps the reviewed queries when the input changes, and does not propose a removed one again', () => {
    const removed = removeQuery(proposeDesign(blog(), 'relational'), 'Post', 0)
    expect(queries(reconcile(removed, blog(), 'relational'))).toEqual([])
    const written = addQuery(removed, 'Post', ['userId', 'title'], [])
    const changed = schemaOf(BLOG.replace('title: string; ', ''), 'typescript')
    expect(queries(reconcile(written, changed, 'relational'))).toEqual([{ filter: ['userId'], sort: [], status: 'active', reasons: [] }])
  })

  it('proposes queries for designs saved before they existed', () => {
    const old = proposeDesign(blog(), 'relational')
    const withoutQueries = { ...old, models: old.models.map(({ queries: _queries, ...model }) => model) }
    expect(queries(reconcile(withoutQueries, blog(), 'relational'))).toEqual(queries(old))
  })
})
