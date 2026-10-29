import type { DecisionRef } from '../core/design/edit.ts'
import { analyze, isTopLevel } from '../core/design/propose.ts'
import type { Decision, Design } from '../core/design/types.ts'
import type { ModelRole } from '../core/physical/roles.ts'
import { allFields, type ModelSchema } from '../core/model/schema.ts'
import { detectFormat, parseInput } from '../core/parsers/registry.ts'
import type { InputFormatId, ParseOutcome } from '../core/parsers/types.ts'

/** Workspace logic that the interface uses, kept out of the components so it can be tested. */

export interface InputState {
  text: string
  /** null: detected from the text */
  format: InputFormatId | null
  /** File name it was opened from, for detection */
  fileName?: string
  /** Where it came from when another tool sent it */
  receivedFrom?: string
}

export const EMPTY_INPUT: InputState = { text: '', format: null }

export interface ReadInput {
  format: InputFormatId | null
  outcome: ParseOutcome | null
}

/** Parses the input with its chosen or detected format. A schema without models is not a model. */
export function readInput(input: InputState): ReadInput {
  if (input.text.trim() === '') return { format: input.format, outcome: null }
  const format = input.format ?? detectFormat(input.text, input.fileName)
  if (!format) return { format: null, outcome: null }
  const outcome = parseInput(input.text, format, { rootName: 'Root' })
  if (outcome.ok && outcome.schema.models.length === 0) return { format, outcome: { ok: false, error: { code: 'noModels' } } }
  return { format, outcome }
}

export interface PendingItem {
  ref: DecisionRef
  decision: Decision<unknown>
}

/** Decisions waiting for the user that matter for what is stored: the keys of stored models and the
 * fields of the models whose fields reach the result. Decisions of models still undecided wait too, but
 * only appear once the decision that involves them is made. */
export function pendingDecisions(design: Design, roles: Map<string, ModelRole>): PendingItem[] {
  const items: PendingItem[] = []
  for (const model of design.models) {
    const role = roles.get(model.model)
    const fieldsMatter = role === 'stored' || (design.target === 'document' && role === 'embedded')
    if (role === 'stored' && model.key?.status === 'pending') items.push({ ref: { kind: 'key', model: model.model }, decision: model.key })
    if (!fieldsMatter) continue
    for (const field of model.fields) {
      if (!field.include) continue
      for (const kind of ['relation', 'foreignKey', 'unique'] as const) {
        const decision = field[kind] as Decision<unknown> | undefined
        if (decision?.status === 'pending') items.push({ ref: { kind, model: model.model, field: field.field }, decision })
      }
    }
  }
  for (const item of design.enums)
    if (item.storage.status === 'pending') items.push({ ref: { kind: 'enum', enum: item.enum }, decision: item.storage })
  return items
}

/** Whether the user can leave the model out: only models no other model uses. */
export function canExclude(schema: ModelSchema, model: string): boolean {
  return isTopLevel(analyze(schema), model)
}

/** Count of fields in every model, inherited ones included. */
export function fieldCount(schema: ModelSchema): number {
  return schema.models.reduce((total, model) => total + allFields(schema, model).length, 0)
}

/** Id of the element of a decision in the design pane, to move the focus to it from the review list. */
export function decisionElementId(ref: DecisionRef): string {
  const raw = ref.kind === 'enum' ? `enum-${ref.enum}` : ref.kind === 'key' ? `key-${ref.model}` : `${ref.kind}-${ref.model}-${ref.field}`
  return `decision-${raw.replace(/[^\w-]/g, '_')}`
}
