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
