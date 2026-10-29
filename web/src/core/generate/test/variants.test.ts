/** Outputs for other engines, decisions and settings than the proposed design with PostgreSQL, shared with the
 * desktop version (shared/README.md). Each file in shared/test-cases/variants/ holds an example, the decisions
 * made on its proposal, the settings and the files every output writes.
 *
 * `UPDATE_SHARED=1 npx vitest run src/core/generate/test/variants.test.ts` writes them again. */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pendingDecisions } from '../../../app/workspace.ts'
import { findExample, type ExampleId } from '../../../examples/index.ts'
import { decide, type DecisionRef } from '../../design/edit.ts'
import { proposeDesign } from '../../design/propose.ts'
import type { Design, StorageTarget } from '../../design/types.ts'
import type { ModelSchema } from '../../model/schema.ts'
import { modelRoles } from '../../physical/roles.ts'
import { schemaOf } from '../../test/helpers.ts'
import { OUTPUTS, generate, type OutputSettings } from '../outputs.ts'

// Tests run from web/
const FOLDER = resolve(process.cwd(), '../shared/test-cases/variants')
const UPDATE = process.env.UPDATE_SHARED === '1'

const ENGINES = ['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle'] as const
const BASE: OutputSettings = { naming: { tables: 'plural', columns: 'snake' }, strings: 'auto', engine: 'postgresql', migrations: true }

interface Decision {
  ref: DecisionRef
  value?: unknown
}

interface Variant {
  example: ExampleId
  target: StorageTarget
  /** Made in this order on the proposed design */
  decisions: Decision[]
  settings: OutputSettings
  /** Outputs written: all of the target's, or only the ORMs that support the engine */
  outputs: 'all' | 'engine'
}

interface VariantFile extends Variant {
  files: Record<string, { name: string; content: string }[]>
}

const schemaFor = (example: ExampleId): ModelSchema => {
  const found = findExample(example)!
  return schemaOf(found.text, found.format, 'Invoice')
}

/** Every pending decision accepted as suggested. */
function acceptAll(example: ExampleId, target: StorageTarget): Decision[] {
  const schema = schemaFor(example)
  let design = proposeDesign(schema, target)
  const decisions: Decision[] = []
  for (;;) {
    const [next] = pendingDecisions(design, modelRoles(schema, design))
    if (!next) return decisions
    decisions.push({ ref: next.ref })
    design = decide(design, next.ref)
  }
}

/** The variants, as they are written when updating. */
function variants(): Record<string, Variant> {
  const result: Record<string, Variant> = {}
  for (const engine of ENGINES)
    result[`engine-${engine}`] = {
      example: 'store',
      target: 'relational',
      decisions: acceptAll('store', 'relational'),
      settings: { ...BASE, engine },
      outputs: 'engine',
    }
  result['jpa-engine-mysql'] = {
    example: 'jpa',
    target: 'relational',
    decisions: [],
    settings: { ...BASE, engine: 'mysql' },
    outputs: 'engine',
  }
  const native: Decision[] = [
    { ref: { kind: 'enum', enum: 'OrderStatus' }, value: 'native' },
    { ref: { kind: 'relation', model: 'Order', field: 'tags' }, value: 'array' },
  ]
  for (const engine of ['postgresql', 'mysql'] as const)
    result[`native-${engine}`] = {
      example: 'store',
      target: 'relational',
      decisions: native,
      settings: { ...BASE, engine },
      outputs: 'all',
    }
  result['lookup'] = {
    example: 'store',
    target: 'relational',
    decisions: [
      { ref: { kind: 'enum', enum: 'OrderStatus' }, value: 'lookup' },
      { ref: { kind: 'relation', model: 'Product', field: 'attributes' }, value: 'child' },
    ],
    settings: BASE,
    outputs: 'all',
  }
  result['uuid-sqlserver'] = {
    example: 'store',
    target: 'relational',
    decisions: [
      { ref: { kind: 'key', model: 'Customer' }, value: { kind: 'surrogate', type: 'uuid' } },
      { ref: { kind: 'key', model: 'Category' }, value: { kind: 'surrogate', type: 'uuid' } },
      { ref: { kind: 'relation', model: 'Order', field: 'customer' }, value: 'json' },
    ],
    settings: { ...BASE, engine: 'sqlserver' },
    outputs: 'all',
  }
  result['names-singular-field'] = {
    example: 'store',
    target: 'relational',
    decisions: acceptAll('store', 'relational'),
    settings: { naming: { tables: 'singular', columns: 'field' }, strings: 'varchar', engine: 'mysql', migrations: false },
    outputs: 'all',
  }
  result['names-model-text'] = {
    example: 'jpa',
    target: 'relational',
    decisions: [],
    settings: { naming: { tables: 'model', columns: 'snake' }, strings: 'text', engine: 'oracle', migrations: true },
    outputs: 'all',
  }
  result['documents-decided'] = {
    example: 'store',
    target: 'document',
    decisions: acceptAll('store', 'document'),
    settings: { ...BASE, naming: { tables: 'singular', columns: 'snake' } },
    outputs: 'all',
  }
  result['documents-json'] = {
    example: 'json',
    target: 'document',
    decisions: acceptAll('json', 'document'),
    settings: { ...BASE, naming: { tables: 'model', columns: 'field' } },
    outputs: 'all',
  }
  return result
}

function files(variant: Variant): VariantFile['files'] {
  const schema = schemaFor(variant.example)
  let design: Design = proposeDesign(schema, variant.target)
  for (const decision of variant.decisions)
    design = 'value' in decision ? decide(design, decision.ref, decision.value) : decide(design, decision.ref)
  const result: VariantFile['files'] = {}
  for (const output of OUTPUTS) {
    if (output.target !== variant.target) continue
    if (variant.outputs === 'engine' && !output.engines?.includes(variant.settings.engine)) continue
    result[output.id] = generate(schema, design, output, variant.settings, schema.root).files.map(({ name, content }) => ({
      name,
      content,
    }))
  }
  return result
}

describe('variants shared with the desktop version', () => {
  if (UPDATE) {
    it('are written', () => {
      mkdirSync(FOLDER, { recursive: true })
      for (const [name, variant] of Object.entries(variants()))
        writeFileSync(join(FOLDER, `${name}.json`), `${JSON.stringify({ ...variant, files: files(variant) }, null, 1)}\n`)
    })
    return
  }
  for (const file of readdirSync(FOLDER).filter((name) => name.endsWith('.json'))) {
    it(file.slice(0, -'.json'.length), () => {
      const variant: VariantFile = JSON.parse(readFileSync(join(FOLDER, file), 'utf8'))
      expect(files(variant)).toEqual(variant.files)
    })
  }
})
