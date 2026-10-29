import { defaultRoot, type ModelSchema } from '../model/schema.ts'
import type { Design } from '../design/types.ts'
import { buildDocument } from '../physical/document.ts'
import { buildRelational } from '../physical/relational.ts'
import type { Dialect, Note, PhysicalSchema } from '../physical/types.ts'
import { generateMongo } from './mongodb/mongodb.ts'
import { efCoreOutput } from './orm/csharp/efcore.ts'
import { hibernateOutput, jpaOutput, springDataJpaOutput } from './orm/jvm/jpa.ts'
import { djangoOutput } from './orm/python/django.ts'
import { sqlalchemyOutput } from './orm/python/sqlalchemy.ts'
import { sqlmodelOutput } from './orm/python/sqlmodel.ts'
import { tortoiseOutput } from './orm/python/tortoise.ts'
import { drizzleOutput } from './orm/typescript/drizzle.ts'
import { prismaOutput } from './orm/typescript/prisma.ts'
import { sequelizeOutput } from './orm/typescript/sequelize.ts'
import { typeormOutput } from './orm/typescript/typeorm.ts'
import { DIALECT_NAMES, generateSql } from './sql/sql.ts'
import {
  fileBase,
  type DocumentWriter,
  type GeneratedFile,
  type Output,
  type OutputGroup,
  type OutputSettings,
  type RelationalWriter,
} from './types.ts'

export type { GeneratedFile, Output, OutputGroup, OutputSettings, WriteContext } from './types.ts'

export const OUTPUT_GROUPS: readonly OutputGroup[] = ['relational', 'document', 'python', 'typescript', 'jvm', 'csharp', 'php']

/** The engine a writer builds for: its own (plain SQL), or the one chosen among those it supports. */
function engineOf(writer: RelationalWriter, settings: OutputSettings): Dialect {
  if (!writer.engines) return writer.id as Dialect
  return writer.engines.includes(settings.engine) ? settings.engine : writer.engines[0]
}

/** A writer for tables as an output: it builds the relational schema for its engine first. */
function relational(writer: RelationalWriter): Output {
  return {
    ...writer,
    target: 'relational',
    generate(schema, design, settings, title) {
      const engine = engineOf(writer, settings)
      const physical = buildRelational(schema, design, { naming: settings.naming, strings: settings.strings, dialect: engine })
      const notes: Note[] = []
      const files = writer.write(physical, { schema, design, settings: { ...settings, engine }, title, note: (note) => notes.push(note) })
      return { physical: { ...physical, notes: [...physical.notes, ...notes] }, files }
    },
  }
}

/** A writer for documents as an output: it builds the collections first. */
function documental(writer: DocumentWriter): Output {
  return {
    ...writer,
    target: 'document',
    generate(schema, design, settings, title) {
      const physical = buildDocument(schema, design, settings.naming)
      const notes: Note[] = []
      const files = writer.write(physical, { schema, design, settings, title, note: (note) => notes.push(note) })
      return { physical: { ...physical, notes: [...physical.notes, ...notes] }, files }
    },
  }
}

const sqlWriters = (['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle'] as const).map((dialect): RelationalWriter => ({
  id: dialect,
  label: DIALECT_NAMES[dialect],
  group: 'relational',
  write: (physical, context) => [
    {
      name: `${fileBase(context.title)}-${dialect}.sql`,
      content: generateSql(physical, dialect, { title: context.title }),
      editorLanguage: 'sql',
    },
  ],
}))

const mongoWriter: DocumentWriter = {
  id: 'mongodb',
  label: 'MongoDB',
  group: 'document',
  write: (physical, context) => [
    {
      name: `${fileBase(context.title)}-mongodb.js`,
      content: generateMongo(physical, { title: context.title }),
      editorLanguage: 'javascript',
    },
  ],
}

/** Every output, in the order the selector shows them. Adding one means listing it here. */
export const OUTPUTS: readonly Output[] = [
  ...sqlWriters.map(relational),
  documental(mongoWriter),
  relational(djangoOutput),
  relational(sqlalchemyOutput),
  relational(sqlmodelOutput),
  relational(tortoiseOutput),
  relational(prismaOutput),
  relational(typeormOutput),
  relational(sequelizeOutput),
  relational(drizzleOutput),
  relational(jpaOutput),
  relational(hibernateOutput),
  relational(springDataJpaOutput),
  relational(efCoreOutput),
]

export function findOutput(id: string): Output {
  return OUTPUTS.find((output) => output.id === id) ?? OUTPUTS[0]
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
  return { ...output.generate(schema, design, settings, name), archiveName: `${fileBase(name)}-${output.id}.zip` }
}
