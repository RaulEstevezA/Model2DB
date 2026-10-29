import type { Design } from '../design/types.ts'
import type { ModelSchema } from '../model/schema.ts'
import { toSnakeCase } from '../model/naming.ts'
import type { BuildOptions, Dialect, DocumentSchema, NamingOptions, RelationalSchema } from '../physical/types.ts'

/** Groups of the output selector */
export type OutputGroup = 'relational' | 'document' | 'python' | 'typescript' | 'jvm' | 'csharp' | 'php'

export interface GeneratedFile {
  /** Path inside the download (`models.py`, `migrations/0001_initial.py`) */
  name: string
  content: string
  /** Highlighting used by the result editor (utils/editorLanguages.ts) */
  editorLanguage: string
}

export interface OutputSettings {
  naming: NamingOptions
  strings: BuildOptions['strings']
  /** SQL engine of ORM outputs: types, migrations and connection settings depend on it */
  engine: Dialect
  /** Add the migration that creates the schema, where the output has migrations */
  migrations: boolean
}

export interface WriteContext {
  schema: ModelSchema
  design: Design
  settings: OutputSettings
  /** The model the schema is mainly about: names the files */
  title: string
}

export interface RelationalOutput {
  id: string
  label: string
  group: OutputGroup
  target: 'relational'
  /** Engines the user can choose; plain SQL outputs have their own and no choice */
  engines?: readonly Dialect[]
  /** The output can add a migration (and the option is shown) */
  migrations?: boolean
  write(physical: RelationalSchema, context: WriteContext): GeneratedFile[]
}

export interface DocumentOutput {
  id: string
  label: string
  group: OutputGroup
  target: 'document'
  migrations?: boolean
  write(physical: DocumentSchema, context: WriteContext): GeneratedFile[]
}

export type Output = RelationalOutput | DocumentOutput

/** Base of file names: the main model in snake_case (`order_line`). */
export function fileBase(title: string): string {
  return toSnakeCase(title) || 'schema'
}
