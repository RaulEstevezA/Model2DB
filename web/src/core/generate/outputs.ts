import type { ModelSchema } from '../model/schema.ts'
import { defaultRoot } from '../model/schema.ts'
import type { Design } from '../design/types.ts'
import { buildDocument } from '../physical/document.ts'
import { buildRelational } from '../physical/relational.ts'
import type { BuildOptions, Dialect, PhysicalSchema } from '../physical/types.ts'
import { DIALECT_NAMES, generateSql } from './sql.ts'
import { generateMongo } from './mongodb.ts'
import { djangoOutput } from './orm/python/django.ts'
import { sqlalchemyOutput } from './orm/python/sqlalchemy.ts'
import {
  fileBase,
  type DocumentOutput,
  type GeneratedFile,
  type Output,
  type OutputGroup,
  type OutputSettings,
  type RelationalOutput,
  type WriteContext,
} from './types.ts'

export type { GeneratedFile, Output, OutputGroup, OutputSettings, WriteContext } from './types.ts'

export const OUTPUT_GROUPS: readonly OutputGroup[] = ['relational', 'document', 'python', 'typescript', 'jvm', 'csharp', 'php']

const SQL_DIALECTS = ['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle'] as const

const sqlOutputs = SQL_DIALECTS.map((dialect): RelationalOutput => ({
  id: dialect,
  label: DIALECT_NAMES[dialect],
  group: 'relational',
  target: 'relational',
  write: (physical, context) => [
    {
      name: `${fileBase(context.title)}-${dialect}.sql`,
      content: generateSql(physical, dialect, { title: context.title }),
      editorLanguage: 'sql',
    },
  ],
}))

const mongoOutput: DocumentOutput = {
  id: 'mongodb',
  label: 'MongoDB',
  group: 'document',
  target: 'document',
  write: (physical, context) => [
    {
      name: `${fileBase(context.title)}-mongodb.js`,
      content: generateMongo(physical, { title: context.title }),
      editorLanguage: 'javascript',
    },
  ],
}

/** Every output, in the order the selector shows them. Adding one means listing it here. */
export const OUTPUTS: readonly Output[] = [...sqlOutputs, mongoOutput, djangoOutput, sqlalchemyOutput]

export function findOutput(id: string): Output {
  return OUTPUTS.find((output) => output.id === id) ?? OUTPUTS[0]
}

/** The engine the physical schema is built for: the output's own, or the one chosen for an ORM. */
export function engineOf(output: Output, settings: OutputSettings): Dialect {
  if (output.target === 'document') return 'postgresql'
  if (!output.engines) return output.id as Dialect
  return output.engines.includes(settings.engine) ? settings.engine : output.engines[0]
}

export interface Generated {
  physical: PhysicalSchema
  files: GeneratedFile[]
  /** Name of the .zip when there are several files */
  archiveName: string
}

/** From the decisions to the files: the physical schema for the chosen database and its code. */
export function generate(schema: ModelSchema, design: Design, output: Output, settings: OutputSettings, title?: string): Generated {
  const name = title ?? schema.root ?? defaultRoot(schema) ?? 'schema'
  const options: BuildOptions = { naming: settings.naming, strings: settings.strings, dialect: engineOf(output, settings) }
  const context: WriteContext = { schema, design, settings: { ...settings, engine: options.dialect }, title: name }
  const archiveName = `${fileBase(name)}-${output.id}.zip`
  if (output.target === 'document') {
    const physical = buildDocument(schema, design, options)
    return { physical, files: output.write(physical, context), archiveName }
  }
  const physical = buildRelational(schema, design, options)
  return { physical, files: output.write(physical, context), archiveName }
}
