import { describe, expect, it } from 'vitest'
import { proposeDesign } from '../core/design/propose.ts'
import { createHandoff } from '../core/interop/handoff.ts'
import { modelRoles } from '../core/physical/roles.ts'
import { schemaOf } from '../core/test/helpers.ts'
import { inputFromHandoff } from './handoff.ts'
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
