import { expect } from 'vitest'
import type { ModelSchema } from '../model/schema.ts'
import { parseInput } from '../parsers/registry.ts'
import type { InputFormatId } from '../parsers/types.ts'

/** Parses a test input and fails the test if it cannot be read. */
export function schemaOf(text: string, format: InputFormatId, rootName = 'Root'): ModelSchema {
  const outcome = parseInput(text, format, { rootName })
  if (!outcome.ok) expect.fail(`Could not parse the test input: ${JSON.stringify(outcome.error)}`)
  return outcome.schema
}
