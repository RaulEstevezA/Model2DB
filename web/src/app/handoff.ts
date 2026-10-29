import type { Handoff } from '../core/interop/handoff.ts'
import { findParser } from '../core/parsers/registry.ts'
import type { InputFormatId } from '../core/parsers/types.ts'
import type { InputState } from './workspace.ts'

const TOOL_NAMES: Record<string, string> = { api2class: 'Api2Class', mapper: 'Mapper', model2db: 'Model2DB', datacleanr: 'DataCleanr' }

/** A model sent by another tool (Mapper's "Open in Model2DB"), as the input: its text when it came with
 * one, its model schema otherwise. */
export function inputFromHandoff(handoff: Handoff): InputState {
  const receivedFrom = TOOL_NAMES[handoff.from]
  if (handoff.text) {
    const format = findParser(handoff.text.format as InputFormatId)?.id ?? null
    return { text: handoff.text.content, format, receivedFrom }
  }
  return { text: JSON.stringify(handoff.schema, null, 2), format: 'modelschema', receivedFrom }
}
