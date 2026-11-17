import { describe, expect, it } from 'vitest'
import { acceptQuery, addQuery } from '../../design/edit.ts'
import { proposeDesign } from '../../design/propose.ts'
import type { StorageTarget } from '../../design/types.ts'
import { schemaOf } from '../../test/helpers.ts'
import { findOutput, generate, type OutputSettings } from '../outputs.ts'

// The proposed query (Post by userId, newest first) accepted, and one ordered by two fields in mixed directions
const BLOG = `
interface User { id: number; email: string }
interface Post { id: number; userId: number; title: string; createdAt: Date }
`
const blog = () => schemaOf(BLOG, 'typescript')
const settings: OutputSettings = { naming: { tables: 'plural', columns: 'snake' }, strings: 'auto', engine: 'postgresql', migrations: true }

function write(output: string, target: StorageTarget = 'relational', engine: OutputSettings['engine'] = 'postgresql') {
  const design = addQuery(
    acceptQuery(proposeDesign(blog(), target), 'Post', 0),
    'Post',
    [],
    [
      { field: 'createdAt', direction: 'desc' },
      { field: 'title', direction: 'asc' },
    ],
  )
  const columns = target === 'document' ? 'field' : 'snake'
  const generated = generate(blog(), design, findOutput(output), { ...settings, naming: { tables: 'plural', columns }, engine })
  return { code: generated.files.map((file) => file.content).join('\n'), notes: generated.physical.notes }
}

describe('query indexes in the Python ORMs', () => {
  it('SQLAlchemy and SQLModel write the index after the classes, and Alembic orders its columns', () => {
    const sqlalchemy = write('sqlalchemy').code
    expect(sqlalchemy).toContain('Index("ix_posts_user_id_created_at", Post.user_id, Post.created_at.desc())')
    expect(sqlalchemy).toContain('Index("ix_posts_created_at_title", Post.created_at.desc(), Post.title)')
    expect(sqlalchemy).toContain(
      'op.create_index("ix_posts_user_id_created_at", "posts", ["user_id", sa.text("created_at DESC")], unique=False)',
    )
    expect(write('sqlmodel').code).toContain('Index("ix_posts_user_id_created_at", col(Post.user_id), col(Post.created_at).desc())')
  })

  it('Django lists them in Meta.indexes by field, "-" for descending, with names of 30 characters at most', () => {
    const django = write('django').code
    expect(django).toContain('indexes = [models.Index(fields=["user", "-created_at"], name="ix_posts_user_id_created_at")')
    for (const name of django.matchAll(/models\.Index\([^)]*name="([^"]+)"/g)) expect(name[1].length).toBeLessThanOrEqual(30)
    expect(django).not.toContain('constraints = [models.Index')
  })

  it('Tortoise names the columns and says it cannot keep the descending order', () => {
    const { code, notes } = write('tortoise')
    expect(code).toContain('Index(fields=("user_id", "created_at"), name="ix_posts_user_id_created_at")')
    expect(notes).toContainEqual({ code: 'indexOrderIgnored', params: { orm: 'Tortoise ORM', index: 'ix_posts_user_id_created_at' } })
  })
})

describe('query indexes in the TypeScript ORMs', () => {
  it('Prisma, Sequelize and Drizzle keep the descending order', () => {
    expect(write('prisma').code).toContain('@@index([userId, createdAt(sort: Desc)], map: "ix_posts_user_id_created_at")')
    expect(write('sequelize').code).toContain("fields: ['user_id', { name: 'created_at', order: 'DESC' }]")
    expect(write('drizzle').code).toContain("index('ix_posts_user_id_created_at').on(table.userId, table.createdAt.desc().nullsFirst())")
    expect(write('drizzle', 'relational', 'sqlite').code).toContain(
      "index('ix_posts_user_id_created_at').on(table.userId, sql`${table.createdAt} desc`)",
    )
  })

  it('TypeORM keeps it in the migration and says the decorator cannot', () => {
    const { code, notes } = write('typeorm')
    expect(code).toContain('CREATE INDEX ix_posts_user_id_created_at ON posts (user_id, created_at DESC)')
    expect(notes).toContainEqual({
      code: 'indexOrderIgnored',
      params: { orm: 'TypeORM', index: 'ix_posts_user_id_created_at', migration: 'yes' },
    })
  })
})

describe('query indexes in JPA, EF Core and Doctrine', () => {
  it('JPA and EF Core keep the descending order', () => {
    expect(write('jpa').code).toContain('@Index(name = "ix_posts_user_id_created_at", columnList = "user_id, created_at DESC")')
    expect(write('efcore').code).toContain(
      'entity.HasIndex(e => new { e.UserId, e.CreatedAt }).IsDescending(false, true).HasDatabaseName("ix_posts_user_id_created_at");',
    )
  })

  it('Doctrine keeps it in the migration and says the mapping cannot', () => {
    const { code, notes } = write('doctrine')
    expect(code).toContain('CREATE INDEX ix_posts_user_id_created_at ON posts (user_id, created_at DESC)')
    expect(notes).toContainEqual({
      code: 'indexOrderIgnored',
      params: { orm: 'Doctrine', index: 'ix_posts_user_id_created_at', migration: 'yes' },
    })
  })
})

describe('query indexes in the MongoDB libraries', () => {
  it('writes -1 or DESCENDING for a descending key', () => {
    expect(write('mongoose', 'document').code).toContain(
      "postSchema.index({ 'userId': 1, 'createdAt': -1 }, { name: 'ix_posts_userId_createdAt' })",
    )
    expect(write('pymongo', 'document').code).toContain(
      '([("userId", ASCENDING), ("createdAt", DESCENDING)], "ix_posts_userId_createdAt", False)',
    )
    expect(write('beanie', 'document').code).toContain(
      'IndexModel([("userId", ASCENDING), ("createdAt", DESCENDING)], name="ix_posts_userId_createdAt")',
    )
    expect(write('mongoengine', 'document').code).toContain('{"fields": ["userId", "-createdAt"], "name": "ix_posts_userId_createdAt"}')
    expect(write('spring-data-mongodb', 'document').code).toContain(`def = "{'userId': 1, 'createdAt': -1}"`)
  })
})

describe('queries in Couchbase, Redis, Cassandra and ScyllaDB', () => {
  it('Couchbase writes DESC in the index keys', () => {
    expect(write('couchbase', 'document').code).toContain('ON `app`.`_default`.`posts`(`userId`, `createdAt` DESC);')
  })

  it('Redis searches by the filter and sorts by the first order field', () => {
    const { code, notes } = write('redis', 'keyvalue')
    expect(code).toContain('FT.CREATE idx:posts ON HASH PREFIX 1 posts: SCHEMA user_id TAG created_at TAG SORTABLE')
    expect(notes).toContainEqual({
      code: 'querySortOne',
      params: { model: 'Post', query: 'ordered by createdAt desc, title asc', field: 'createdAt' },
    })
  })

  it('Cassandra and ScyllaDB read each query from a table of its own, ordered by its clustering', () => {
    for (const output of ['cassandra', 'scylladb']) {
      const { code, notes } = write(output, 'widecolumn')
      expect(code).toContain('-- Query: Post by userId, ordered by createdAt desc.')
      expect(code).toMatch(
        /CREATE TABLE IF NOT EXISTS posts_by_user_id \([^;]*PRIMARY KEY \(\(user_id\), created_at, id\)\n\) WITH CLUSTERING ORDER BY \(created_at DESC, id ASC\);/,
      )
      expect(notes).toContainEqual({
        code: 'queryNeedsFilter',
        params: {
          database: output === 'cassandra' ? 'Cassandra' : 'ScyllaDB',
          model: 'Post',
          query: 'ordered by createdAt desc, title asc',
        },
      })
      expect(notes).toContainEqual({ code: 'queryTables', params: { database: output === 'cassandra' ? 'Cassandra' : 'ScyllaDB' } })
    }
  })
})
