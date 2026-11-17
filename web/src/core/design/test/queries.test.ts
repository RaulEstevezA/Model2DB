import { describe, expect, it } from 'vitest'
import { pendingDecisions } from '../../../app/workspace.ts'
import { schemaOf } from '../../test/helpers.ts'
import { findOutput, generate, type OutputSettings } from '../../generate/outputs.ts'
import { modelRoles } from '../../physical/roles.ts'
import { acceptQuery, addQuery, decide, reconcile, removeQuery, setFieldInclude, setQuery } from '../edit.ts'
import { proposeDesign } from '../propose.ts'
import { findModelDesign, type Design, type StorageTarget } from '../types.ts'

const BLOG = `
interface User { id: number; email: string }
interface Post { id: number; userId: number; title: string; createdAt: Date; updatedAt: Date }
`
const blog = () => schemaOf(BLOG, 'typescript')
const settings: OutputSettings = {
  naming: { tables: 'plural', columns: 'snake' },
  strings: 'auto',
  engine: 'postgresql',
  migrations: false,
}
const queries = (design: Design, model = 'Post') => findModelDesign(design, model)?.queries
const code = (design: Design, output: string, engine: OutputSettings['engine'] = 'postgresql') =>
  generate(blog(), design, findOutput(output), { ...settings, engine })
    .files.map((file) => file.content)
    .join('\n')
const accepted = (target: StorageTarget) => acceptQuery(proposeDesign(blog(), target), 'Post', 0)

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

describe('query indexes', () => {
  it('leaves a TODO while the query is pending', () => {
    const sql = code(proposeDesign(blog(), 'relational'), 'postgresql')
    expect(sql).toContain('-- TODO: does the application read "Post" by userId, ordered by createdAt desc?')
    expect(sql).toContain('CREATE INDEX ix_posts_user_id ON posts (user_id);')
  })

  it('becomes one index on the filter and the order, which replaces the foreign key index', () => {
    for (const engine of ['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle'] as const) {
      const sql = code(accepted('relational'), engine)
      expect(sql).toMatch(/CREATE INDEX "?ix_posts_user_id_created_at"? ON "?posts"? \("?user_id"?, "?created_at"? DESC\);/)
      expect(sql).toContain('-- Query: Post by userId, ordered by createdAt desc')
      expect(sql).not.toMatch(/ix_posts_user_id"? ON/)
    }
    const generated = generate(blog(), accepted('relational'), findOutput('postgresql'), settings)
    expect(generated.physical.notes).toContainEqual({ code: 'queryIndexes', params: {} })
  })

  it('becomes a compound index in MongoDB', () => {
    const script = code(accepted('document'), 'mongodb')
    expect(script).toContain('// Query: Post by userId, ordered by createdAt desc')
    expect(script).toContain(
      'db.getCollection("posts").createIndex({ user_id: 1, created_at: -1 }, { name: "ix_posts_user_id_created_at" })',
    )
  })

  it('adds nothing when the key or a unique constraint already covers it', () => {
    const unique = decide(proposeDesign(blog(), 'relational'), { kind: 'unique', model: 'User', field: 'email' })
    expect(code(addQuery(unique, 'User', ['email'], []), 'postgresql')).not.toContain('ix_users_email')
    const byKey = addQuery(proposeDesign(blog(), 'relational'), 'Post', ['id'], [])
    expect(code(byKey, 'postgresql')).not.toContain('ix_posts_id')
  })

  it('reads an index both ways: a reversed query adds nothing', () => {
    const design = addQuery(accepted('relational'), 'Post', ['userId'], [{ field: 'createdAt', direction: 'asc' }])
    const sql = code(design, 'postgresql')
    expect(sql.match(/CREATE INDEX/g), sql).toHaveLength(1)
  })

  it('says when a field of the query is not stored', () => {
    const design = setFieldInclude(accepted('relational'), 'Post', 'createdAt', false)
    const generated = generate(blog(), design, findOutput('postgresql'), settings)
    expect(generated.physical.notes).toContainEqual({
      code: 'queryNotIndexed',
      params: { model: 'Post', query: 'by userId, ordered by createdAt desc' },
    })
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
