import type { Literal, Primitive } from '../model/schema.ts'

/** The database a design turns into, independent of the dialect: tables, columns, keys and indexes, or
 * collections with their validators. Only active decisions reach it; pending ones become `todos`. */

export type ColumnType =
  | { kind: 'primitive'; name: Primitive; bits?: 8 | 16 | 32 | 64; length?: number; precision?: number; scale?: number }
  | { kind: 'enum'; name: string }
  | { kind: 'json' }
  | { kind: 'array'; items: ColumnType }
  /** Written by the user: used as it is */
  | { kind: 'raw'; sql: string }

export interface Column {
  name: string
  type: ColumnType
  nullable: boolean
  defaultValue?: Literal
  /** Filled by the database: an identity (auto-increment), a generated UUID or the current time */
  generated?: 'identity' | 'uuid' | 'now'
  /** `Order.customer.city`: where the column comes from, for the comments and the interface */
  source?: string
}

export interface ForeignKey {
  name: string
  columns: string[]
  table: string
  references: string[]
  /** `cascade` for rows that only exist as part of their owner (order lines, list values) */
  onDelete?: 'cascade' | 'set null'
}

export interface Index {
  name: string
  columns: string[]
  unique: boolean
}

export interface Check {
  name: string
  column: string
  values: (string | number)[]
}

/** Something the user still has to decide; the generated code says it in a comment. */
export interface Todo {
  code: TodoCode
  params: Record<string, string>
}

export type TodoCode = 'relationPending' | 'keyPending' | 'targetNotStored' | 'foreignKeyTargetNotStored'

export type TableKind = 'entity' | 'list' | 'map' | 'join' | 'lookup'

export interface Table {
  name: string
  kind: TableKind
  /** The model it stores; for list, map and join tables, the model that owns them */
  model: string
  /** The field a list, map or join table comes from */
  field?: string
  columns: Column[]
  primaryKey: string[]
  foreignKeys: ForeignKey[]
  uniques: Index[]
  indexes: Index[]
  checks: Check[]
  todos: Todo[]
}

export interface PhysicalEnum {
  name: string
  /** Name of the database type (`order_status`) or of the lookup table */
  sqlName: string
  values: (string | number)[]
  storage: 'check' | 'native' | 'lookup' | 'text'
}

export interface Note {
  code: NoteCode
  params: Record<string, string>
}

export type NoteCode = 'arrayAsJson' | 'nativeEnumAsCheck' | 'defaultPrecision' | 'inheritedFields' | 'cycleEmbedded' | 'renamedReserved'

export interface RelationalSchema {
  kind: 'relational'
  tables: Table[]
  enums: PhysicalEnum[]
  notes: Note[]
}

/** A field of a MongoDB `$jsonSchema` validator. */
export interface BsonSchema {
  bsonType?: string | string[]
  enum?: Literal[]
  required?: string[]
  properties?: Record<string, BsonSchema>
  items?: BsonSchema
  additionalProperties?: boolean | BsonSchema
  description?: string
}

export interface Collection {
  name: string
  model: string
  validator: BsonSchema
  indexes: Index[]
  todos: Todo[]
}

export interface DocumentSchema {
  kind: 'document'
  collections: Collection[]
  notes: Note[]
}

export type PhysicalSchema = RelationalSchema | DocumentSchema

export type TableNaming = 'plural' | 'singular' | 'model'
export type ColumnNaming = 'snake' | 'field'

export interface NamingOptions {
  tables: TableNaming
  columns: ColumnNaming
}

export type Dialect = 'postgresql' | 'mysql' | 'sqlite' | 'sqlserver'

export interface BuildOptions {
  naming: NamingOptions
  dialect: Dialect
  /** Type of a text whose input declares no length: `auto` is TEXT in PostgreSQL and SQLite, where it costs
   * nothing, and VARCHAR(255) in MySQL and SQL Server, where unbounded text cannot be indexed */
  strings: 'auto' | 'varchar' | 'text'
}

export const DEFAULT_BUILD_OPTIONS: BuildOptions = {
  naming: { tables: 'plural', columns: 'snake' },
  dialect: 'postgresql',
  strings: 'auto',
}
