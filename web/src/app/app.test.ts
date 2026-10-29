import { describe, expect, it } from 'vitest'
import { decide } from '../core/design/edit.ts'
import { proposeDesign } from '../core/design/propose.ts'
import { createHandoff } from '../core/interop/handoff.ts'
import { createProject } from '../core/interop/project.ts'
import { modelRoles } from '../core/physical/roles.ts'
import { schemaOf } from '../core/test/helpers.ts'
import { inputFromHandoff } from './handoff.ts'
import { designsForInput, inputOfProject, loadSaved, REMEMBER_KEY, WORKSPACE_KEY } from './project.ts'
import { pendingDecisions, readInput } from './workspace.ts'

const schema = schemaOf(
  'interface Customer { id: number; email: string }\ninterface Order { id: number; customer: Customer }',
  'typescript',
)

describe('a model received from another tool', () => {
  it('opens as its model schema and says where it came from', () => {
    const input = inputFromHandoff(createHandoff('mapper', 'target', schema, 'Order'))
    expect(input).toMatchObject({ format: 'modelschema', receivedFrom: 'Mapper' })
    const read = readInput(input)
    expect(read.outcome?.ok && read.outcome.schema.models.map((model) => model.name)).toEqual(['Customer', 'Order'])
  })

  it('opens as its text when it came with one', () => {
    const handoff = {
      ...createHandoff('api2class', 'source', schema),
      text: { format: 'typescript', content: 'interface A { id: number }' },
    }
    expect(inputFromHandoff(handoff)).toEqual({ text: 'interface A { id: number }', format: 'typescript', receivedFrom: 'Api2Class' })
  })
})

describe('pending decisions', () => {
  it('lists only what reaches the result', () => {
    const design = proposeDesign(schema, 'relational')
    const pending = pendingDecisions(design, modelRoles(schema, design))
    expect(pending.map((item) => item.ref)).toEqual([{ kind: 'unique', model: 'Customer', field: 'email' }])
  })
})

describe('reading the input', () => {
  it('says when a valid text has no model', () => {
    expect(readInput({ text: '{}', format: 'jsonschema' }).outcome).toMatchObject({ ok: false })
  })
})

describe('the work kept in this browser', () => {
  const TEXT = 'interface Customer { id: number; email: string }'
  const relational = decide(
    proposeDesign(schemaOf(TEXT, 'typescript'), 'relational'),
    { kind: 'unique', model: 'Customer', field: 'email' },
    false,
  )
  const project = createProject(
    { format: 'typescript', text: TEXT },
    { relational, document: null },
    {
      output: 'postgresql',
      naming: { relational: { tables: 'plural', columns: 'snake' }, document: { tables: 'plural', columns: 'field' } },
      strings: 'auto',
      engine: 'postgresql',
      migrations: true,
    },
  )
  const storage = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] ?? null })

  it('is restored only while "remember" is on', () => {
    expect(loadSaved(storage({ [WORKSPACE_KEY]: JSON.stringify(project) }))).toBeNull()
    expect(loadSaved(storage({ [REMEMBER_KEY]: 'true', [WORKSPACE_KEY]: JSON.stringify(project) }))).toEqual(project)
    expect(loadSaved(storage({ [REMEMBER_KEY]: 'true', [WORKSPACE_KEY]: '{"format":"model2db-project"' }))).toBeNull()
  })

  it('keeps the decisions that still fit the model the input reads', () => {
    const designs = designsForInput(project.designs, inputOfProject(project))
    expect(designs.relational?.models[0].fields[1].unique).toMatchObject({ value: false, status: 'active', manual: true })
    // The other kind of database had no design yet: it is proposed
    expect(designs.document?.target).toBe('document')
    const edited = designsForInput(project.designs, { text: 'interface Customer { id: number; mail: string }', format: 'typescript' })
    expect(edited.relational?.models[0].fields.map((field) => field.field)).toEqual(['id', 'mail'])
  })
})
