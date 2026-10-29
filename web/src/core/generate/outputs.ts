import type { ModelSchema } from '../model/schema.ts'
import type { Design } from '../design/types.ts'
import { buildDocument } from '../physical/document.ts'
import { buildRelational } from '../physical/relational.ts'
import type { BuildOptions, Dialect, NamingOptions, PhysicalSchema } from '../physical/types.ts'
import { toSnakeCase } from '../model/naming.ts'
import { DIALECT_NAMES, generateSql } from './sql.ts'
import { generateMongo } from './mongodb.ts'

/** Every database Model2DB writes for, in the order the selector shows them. */
export type OutputId = Dialect | 'mongodb'

export interface Output {
  id: OutputId
  label: string
  target: 'relational' | 'document'
  /** Highlighting used by the result editor (utils/editorLanguages.ts) */
  editorLanguage: string
  extension: string
}

export const OUTPUTS: readonly Output[] = [
  { id: 'postgresql', label: DIALECT_NAMES.postgresql, target: 'relational', editorLanguage: 'sql', extension: '.sql' },
  { id: 'mysql', label: DIALECT_NAMES.mysql, target: 'relational', editorLanguage: 'sql', extension: '.sql' },
  { id: 'sqlite', label: DIALECT_NAMES.sqlite, target: 'relational', editorLanguage: 'sql', extension: '.sql' },
  { id: 'sqlserver', label: DIALECT_NAMES.sqlserver, target: 'relational', editorLanguage: 'sql', extension: '.sql' },
  { id: 'mongodb', label: 'MongoDB', target: 'document', editorLanguage: 'javascript', extension: '.js' },
]

export function findOutput(id: string): Output {
  return OUTPUTS.find((output) => output.id === id) ?? OUTPUTS[0]
}

export interface OutputSettings {
  naming: NamingOptions
  strings: BuildOptions['strings']
}

export interface Generated {
  physical: PhysicalSchema
  fileName: string
  content: string
}

/** From the decisions to the file: the physical schema for the chosen database and its code. */
export function generate(schema: ModelSchema, design: Design, output: Output, settings: OutputSettings, title?: string): Generated {
  const options: BuildOptions = {
    naming: settings.naming,
    strings: settings.strings,
    dialect: output.id === 'mongodb' ? 'postgresql' : output.id,
  }
  const base = toSnakeCase(title ?? 'schema') || 'schema'
  if (output.target === 'document') {
    const physical = buildDocument(schema, design, options)
    return { physical, fileName: `${base}-mongodb${output.extension}`, content: generateMongo(physical, { title }) }
  }
  const physical = buildRelational(schema, design, options)
  return { physical, fileName: `${base}-${output.id}${output.extension}`, content: generateSql(physical, output.id as Dialect, { title }) }
}
