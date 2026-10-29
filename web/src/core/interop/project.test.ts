import { describe, expect, it } from 'vitest'
import { decide } from '../design/edit.ts'
import { proposeDesign } from '../design/propose.ts'
import { schemaOf } from '../test/helpers.ts'
import { createProject, projectFileName, readProject, type ProjectOutput } from './project.ts'

const TEXT = 'interface Customer { id: number; email: string }\ninterface Order { id: number; customer: Customer }'
const schema = schemaOf(TEXT, 'typescript')
const relational = decide(proposeDesign(schema, 'relational'), { kind: 'unique', model: 'Customer', field: 'email' }, false)
const output: ProjectOutput = {
  output: 'mysql',
  naming: { relational: { tables: 'singular', columns: 'snake' }, document: { tables: 'plural', columns: 'field' } },
  strings: 'varchar',
  engine: 'mysql',
  migrations: false,
}
const project = createProject(
  { format: 'typescript', text: TEXT, fileName: 'models.ts' },
  { relational, document: null },
  output,
  new Date('2026-10-29T12:00:00Z'),
)

describe('project files', () => {
  it('round-trip through JSON', () => {
    expect(readProject(JSON.stringify(project))).toEqual({ ok: true, project })
    expect(projectFileName('Order')).toBe('order.model2db.json')
    expect(projectFileName('Línea de pedido')).toBe('l-nea-de-pedido.model2db.json')
  })

  it('reject other files and newer versions', () => {
    expect(readProject('not json')).toEqual({ ok: false, error: 'notJson' })
    expect(readProject('{"format":"mapper-project","version":1}')).toEqual({ ok: false, error: 'notProject' })
    expect(readProject(JSON.stringify({ ...project, version: 2 }))).toEqual({ ok: false, error: 'newerVersion' })
  })

  it('reject damaged projects with the path of the first problem', () => {
    const damaged = (change: (value: ReturnType<typeof structuredClone<typeof project>>) => void) => {
      const copy = structuredClone(project)
      change(copy)
      return readProject(JSON.stringify(copy))
    }
    expect(damaged((copy) => ((copy.input as unknown as Record<string, unknown>).format = 'cobol'))).toEqual({
      ok: false,
      error: 'invalid',
      path: '$.input.format',
    })
    expect(
      damaged((copy) => ((copy.designs.relational!.models[0].fields[1].unique as unknown as Record<string, unknown>).status = 'maybe')),
    ).toEqual({ ok: false, error: 'invalid', path: '$.designs.relational.models[0].fields[1].unique.status' })
    expect(
      damaged((copy) => ((copy.designs as unknown as Record<string, unknown>).document = { target: 'relational', models: [], enums: [] })),
    ).toEqual({ ok: false, error: 'invalid', path: '$.designs.document' })
    expect(damaged((copy) => ((copy.output as unknown as Record<string, unknown>).engine = 'db2'))).toEqual({
      ok: false,
      error: 'invalid',
      path: '$.output.engine',
    })
  })

  it('leave unknown keys behind', () => {
    const extra = { ...project, script: 'alert(1)', input: { ...project.input, run: true } }
    const read = readProject(JSON.stringify(extra))
    expect(read.ok && read.project).toEqual(project)
  })
})
