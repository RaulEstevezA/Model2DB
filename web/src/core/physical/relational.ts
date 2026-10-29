import { nameWords, toPascalCase, toSnakeCase } from '../model/naming.ts'
import { allFields, findEnum, findModel, type FieldDef, type ModelDef, type ModelSchema, type TypeRef } from '../model/schema.ts'
import { declaredLength, declaredPrecision } from '../design/hints.ts'
import { singularField } from '../design/propose.ts'
import { findModelDesign, type Design, type FieldDesign, type KeyChoice } from '../design/types.ts'
import { columnName, constraintName, freeName, joinNames, tableName } from './naming.ts'
import { modelRoles } from './roles.ts'
import type { BuildOptions, Column, ColumnType, Note, PhysicalEnum, RelationalSchema, Table, Todo } from './types.ts'

// Precision used for decimals whose input does not say it: enough for money in most currencies
const DEFAULT_PRECISION = { precision: 18, scale: 2 }
const DEFAULT_LENGTH = 255

interface Entity {
  model: ModelDef
  table: Table
  design: FieldDesign[]
  /** Column names already used in the table, in lower case */
  used: Set<string>
  /** The primary key, once known: its column and type */
  key: { column: string; type: ColumnType } | null
}

/** Turns the active decisions of a design into tables. Pending decisions add a `todo` instead. */
export function buildRelational(schema: ModelSchema, design: Design, options: BuildOptions): RelationalSchema {
  const roles = modelRoles(schema, design)
  const notes: Note[] = []
  const usedTables = new Set<string>()
  const entities = new Map<string, Entity>()
  const extraTables: Table[] = []
  const enumsUsed = new Set<string>()
  const decimals: string[] = []

  const newTable = (name: string, kind: Table['kind'], model: string, field?: string): Table => ({
    name: freeName(name, usedTables),
    kind,
    model,
    ...(field ? { field } : {}),
    columns: [],
    primaryKey: [],
    foreignKeys: [],
    uniques: [],
    indexes: [],
    checks: [],
    todos: [],
  })
  const todo = (table: Table, code: Todo['code'], params: Record<string, string>) => table.todos.push({ code, params })

  // ---------- Tables of stored models, with their keys ----------
  for (const model of schema.models) {
    if (roles.get(model.name) !== 'stored') continue
    const item = findModelDesign(design, model.name)
    if (!item) continue
    const table = newTable(item.table ?? tableName(model.name, options.naming), 'entity', model.name)
    const entity: Entity = { model, table, design: item.fields, used: new Set(), key: null }
    entities.set(model.name, entity)
    // Field columns keep their names; a surrogate key takes a free one
    for (const field of allFields(schema, model)) {
      const decided = item.fields.find((other) => other.field === field.name)
      if (decided?.include && !decided.relation) entity.used.add(fieldColumn(field, decided, options).toLowerCase())
    }
    const parents = (model.extends ?? []).filter((parent) => roles.get(parent) === 'parent')
    if (parents.length > 0) notes.push({ code: 'inheritedFields', params: { model: model.name, parents: parents.join(', ') } })
  }

  for (const entity of entities.values()) {
    const decision = findModelDesign(design, entity.model.name)?.key
    if (!decision || decision.status === 'pending') {
      todo(entity.table, 'keyPending', { model: entity.model.name })
      continue
    }
    const key: KeyChoice = decision.value
    if (key.kind === 'surrogate') {
      const name = freeName(columnName('id', options.naming), entity.used)
      const type: ColumnType = key.type === 'uuid' ? { kind: 'primitive', name: 'uuid' } : { kind: 'primitive', name: 'integer', bits: 64 }
      entity.table.columns.push({ name, type, nullable: false, generated: key.type === 'uuid' ? 'uuid' : 'identity' })
      entity.table.primaryKey = [name]
      entity.key = { column: name, type }
    }
  }

  // ---------- Columns of the fields ----------
  const typeOf = (field: FieldDef, decided: FieldDesign | undefined, path: string): ColumnType => {
    if (decided?.type) return { kind: 'raw', sql: decided.type }
    return columnType(field.type, field, path)
  }
  const columnType = (type: TypeRef, field: FieldDef, path: string): ColumnType => {
    if (type.kind === 'enum') {
      enumsUsed.add(type.name)
      return { kind: 'enum', name: type.name }
    }
    if (type.kind !== 'primitive' || type.name === 'any') return { kind: 'json' }
    const result: ColumnType = { kind: 'primitive', name: type.name, ...(type.bits ? { bits: type.bits } : {}) }
    if (type.name === 'string') {
      const varchar =
        options.strings === 'varchar' || (options.strings === 'auto' && (options.dialect === 'mysql' || options.dialect === 'sqlserver'))
      const length = declaredLength(field) ?? (varchar ? DEFAULT_LENGTH : undefined)
      if (length) result.length = length
    }
    if (type.name === 'decimal') {
      const declared = declaredPrecision(field)
      if (!declared) decimals.push(path)
      Object.assign(result, declared ?? DEFAULT_PRECISION)
    }
    return result
  }

  /** Columns of a value object, prefixed with the field that holds it: `address_city`. */
  const flatten = (
    table: Table,
    used: Set<string>,
    prefix: string[],
    target: string,
    nullable: boolean,
    path: string,
    seen: Set<string>,
  ) => {
    const model = findModel(schema, target)
    if (!model || seen.has(target)) return
    for (const field of allFields(schema, model)) {
      const fieldPath = `${path}.${field.name}`
      const optional = nullable || storesNull(field)
      if (field.type.kind === 'model') {
        flatten(table, used, [...prefix, field.name], field.type.name, optional, fieldPath, new Set([...seen, target]))
        continue
      }
      table.columns.push({
        name: freeName(joinNames([...prefix, field.name], options.naming), used),
        type: columnType(field.type, field, fieldPath),
        nullable: optional,
        ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}),
        source: fieldPath,
      })
    }
  }

  const foreignKey = (table: Table, column: string, target: Entity, onDelete?: 'cascade' | 'set null') => {
    if (!target.key) {
      todo(table, 'foreignKeyTargetNotStored', { column, model: target.model.name })
      return
    }
    if (table.foreignKeys.some((fk) => fk.columns.length === 1 && fk.columns[0] === column)) return
    table.foreignKeys.push({
      name: constraintName('fk', table.name, [column]),
      columns: [column],
      table: target.table.name,
      references: [target.key.column],
      ...(onDelete ? { onDelete } : {}),
    })
    if (!table.primaryKey.includes(column) && !table.indexes.some((index) => index.columns[0] === column))
      table.indexes.push({ name: constraintName('ix', table.name, [column]), columns: [column], unique: false })
  }

  // Key fields first, so the columns that refer to them can take their type
  const keyFields = new Map<string, string>()
  for (const entity of entities.values()) {
    const decision = findModelDesign(design, entity.model.name)?.key
    if (decision?.status !== 'active' || decision.value.kind !== 'field') continue
    const name = decision.value.field
    const field = allFields(schema, entity.model).find((item) => item.name === name)
    if (!field) continue
    const decided = entity.design.find((item) => item.field === name)
    keyFields.set(entity.model.name, name)
    entity.key = { column: fieldColumn(field, decided, options), type: keyType(typeOf(field, decided, `${entity.model.name}.${name}`)) }
  }

  // Then the scalar columns of every table
  for (const entity of entities.values()) {
    const { table, model } = entity
    const keyField = keyFields.get(model.name) ?? null
    for (const field of allFields(schema, model)) {
      const decided = entity.design.find((item) => item.field === field.name)
      if (!decided?.include || decided.relation) continue
      const name = fieldColumn(field, decided, options)
      const isKey = field.name === keyField
      // A column holding another table's key has that key's type
      const fk = decided.foreignKey?.status === 'active' && decided.foreignKey.value ? entities.get(decided.foreignKey.value) : undefined
      const column: Column = {
        name,
        type:
          isKey && entity.key
            ? entity.key.type
            : fk?.key && !decided.type
              ? fk.key.type
              : typeOf(field, decided, `${model.name}.${field.name}`),
        nullable: isKey ? false : storesNull(field),
        source: `${model.name}.${field.name}`,
      }
      if (field.defaultValue !== undefined && !isKey) column.defaultValue = field.defaultValue
      if (field.generated && column.type.kind === 'primitive') {
        if (isKey && column.type.name === 'integer') column.generated = 'identity'
        if (isKey && column.type.name === 'uuid') column.generated = 'uuid'
        if (!isKey && (column.type.name === 'datetime' || column.type.name === 'date')) column.generated = 'now'
      }
      table.columns.push(column)
      if (isKey) table.primaryKey = [name]
      if (decided.unique?.status === 'active' && decided.unique.value && !isKey)
        table.uniques.push({ name: constraintName('uq', table.name, [name]), columns: [name], unique: true })
      if (decided.index && !isKey) table.indexes.push({ name: constraintName('ix', table.name, [name]), columns: [name], unique: false })
    }
  }

  // Scalar foreign keys (`customerId` → customers)
  for (const entity of entities.values()) {
    for (const field of allFields(schema, entity.model)) {
      const decided = entity.design.find((item) => item.field === field.name)
      const fk = decided?.foreignKey
      if (!decided?.include || !fk || fk.status !== 'active' || fk.value === null) continue
      const target = entities.get(fk.value)
      const column = fieldColumn(field, decided, options)
      if (target) foreignKey(entity.table, column, target)
      else todo(entity.table, 'targetNotStored', { field: field.name, model: fk.value })
    }
  }

  // ---------- Relations ----------
  const joins = new Set<string>()
  for (const entity of entities.values()) {
    const { table, model } = entity
    for (const field of allFields(schema, model)) {
      const decided = entity.design.find((item) => item.field === field.name)
      const relation = decided?.relation
      if (!decided?.include || !relation) continue
      if (relation.status === 'pending') {
        todo(table, 'relationPending', { field: field.name })
        continue
      }
      const nullable = storesNull(field)
      const path = `${model.name}.${field.name}`
      const items = field.type.kind === 'array' ? field.type.items : field.type.kind === 'map' ? field.type.value : field.type
      const targetName = items.kind === 'model' ? items.name : null
      const target = targetName ? entities.get(targetName) : undefined
      switch (relation.value) {
        case 'json':
          table.columns.push({
            name: freeName(fieldColumn(field, decided, options), entity.used),
            type: { kind: 'json' },
            nullable,
            source: path,
          })
          break
        case 'array': {
          if (options.dialect !== 'postgresql') notes.push({ code: 'arrayAsJson', params: { field: path } })
          const type: ColumnType =
            options.dialect === 'postgresql' ? { kind: 'array', items: columnType(items, field, path) } : { kind: 'json' }
          table.columns.push({ name: freeName(fieldColumn(field, decided, options), entity.used), type, nullable, source: path })
          break
        }
        case 'flatten':
          if (targetName) flatten(table, entity.used, [decided.column ?? field.name], targetName, nullable, path, new Set([model.name]))
          break
        case 'reference': {
          if (!target) {
            todo(table, 'targetNotStored', { field: field.name, model: targetName ?? '' })
            break
          }
          // `customer: Customer` next to `customerId` (or Prisma's `@relation(fields: [customerId])`): reuse it
          const existing = existingKeyColumn(entity, field, options, schema)
          if (existing) {
            foreignKey(table, existing, target)
            break
          }
          if (!target.key) {
            todo(table, 'foreignKeyTargetNotStored', { column: field.name, model: target.model.name })
            break
          }
          const name = freeName(keyColumnName(decided.column ?? field.name, target.key.column, options), entity.used)
          table.columns.push({ name, type: target.key.type, nullable, source: path })
          foreignKey(table, name, target)
          break
        }
        case 'child':
          if (targetName) {
            if (!target) todo(table, 'targetNotStored', { field: field.name, model: targetName })
            else childModels(entity, field, target)
          } else if (field.type.kind === 'map') childMap(entity, field, decided, items)
          else childValues(entity, field, decided, items)
          break
        case 'join':
          if (!target) todo(table, 'targetNotStored', { field: field.name, model: targetName ?? '' })
          else join(entity, field, target)
          break
        case 'embed':
          // Only for documents
          break
      }
    }
  }

  /** A list of models stored in their own table, pointing back to the owner (one-to-many). */
  function childModels(owner: Entity, field: FieldDef, child: Entity) {
    if (!owner.key) {
      todo(owner.table, 'keyPending', { model: owner.model.name })
      return
    }
    // A field of the child that already points to the owner
    if (child.model.name !== owner.model.name) {
      const ownerWords = nameWords(owner.model.name).join('')
      for (const back of allFields(schema, child.model)) {
        const decided = child.design.find((item) => item.field === back.name)
        if (!decided?.include) continue
        if (back.type.kind === 'model' && back.type.name === owner.model.name) {
          // The child's own reference already creates the foreign key
          if (decided.relation?.status === 'active' && decided.relation.value === 'reference') return
          continue
        }
        const words = nameWords(back.name)
        if (
          back.type.kind === 'primitive' &&
          words.length > 1 &&
          words[words.length - 1] === 'id' &&
          words.slice(0, -1).join('') === ownerWords
        ) {
          foreignKey(child.table, fieldColumn(back, decided, options), owner)
          return
        }
      }
    }
    const self = child.model.name === owner.model.name
    const base = keyColumnName(self ? 'parent' : owner.model.name, owner.key.column, options)
    const name = freeName(base, child.used)
    // Rows that only exist inside this list go with their owner; shared ones stay
    const owned =
      !self && !findModelDesign(design, child.model.name)?.key?.reasons.some((r) => r.code === 'keyDeclared' || r.code === 'keyNamed')
    child.table.columns.push({ name, type: owner.key.type, nullable: self || !owned, source: `${owner.model.name}.${field.name}` })
    foreignKey(child.table, name, owner, owned ? 'cascade' : undefined)
  }

  /** A list of plain values: one row per value, in order. */
  function childValues(owner: Entity, field: FieldDef, decided: FieldDesign, items: TypeRef) {
    if (!owner.key) {
      todo(owner.table, 'keyPending', { model: owner.model.name })
      return
    }
    const table = newTable(ownedTableName(owner.model.name, decided.column ?? field.name, options), 'list', owner.model.name, field.name)
    const used = new Set<string>()
    const ownerColumn = freeName(keyColumnName(owner.model.name, owner.key.column, options), used)
    const position = freeName(columnName('position', options.naming), used)
    table.columns.push(
      { name: ownerColumn, type: owner.key.type, nullable: false },
      { name: position, type: { kind: 'primitive', name: 'integer', bits: 32 }, nullable: false },
      {
        name: freeName(columnName('value', options.naming), used),
        type: columnType(items, field, `${owner.model.name}.${field.name}`),
        nullable: field.type.kind === 'array' && field.type.itemsNullable === true,
        source: `${owner.model.name}.${field.name}`,
      },
    )
    table.primaryKey = [ownerColumn, position]
    foreignKey(table, ownerColumn, owner, 'cascade')
    extraTables.push(table)
  }

  /** A map of plain values: one row per key. */
  function childMap(owner: Entity, field: FieldDef, decided: FieldDesign, value: TypeRef) {
    if (!owner.key) {
      todo(owner.table, 'keyPending', { model: owner.model.name })
      return
    }
    const table = newTable(ownedTableName(owner.model.name, decided.column ?? field.name, options), 'map', owner.model.name, field.name)
    const used = new Set<string>()
    const ownerColumn = freeName(keyColumnName(owner.model.name, owner.key.column, options), used)
    const key = freeName(columnName('key', options.naming), used)
    table.columns.push(
      { name: ownerColumn, type: owner.key.type, nullable: false },
      { name: key, type: { kind: 'primitive', name: 'string', length: DEFAULT_LENGTH }, nullable: false },
      {
        name: freeName(columnName('value', options.naming), used),
        type: columnType(value, field, `${owner.model.name}.${field.name}`),
        nullable: true,
      },
    )
    table.primaryKey = [ownerColumn, key]
    foreignKey(table, ownerColumn, owner, 'cascade')
    extraTables.push(table)
  }

  /** A many-to-many list: a table with the keys of both sides. Both lists of a pair share it. */
  function join(owner: Entity, field: FieldDef, other: Entity) {
    if (!owner.key || !other.key) {
      todo(owner.table, 'keyPending', { model: (owner.key ? other : owner).model.name })
      return
    }
    const self = owner.model.name === other.model.name
    const mirror = self
      ? null
      : allFields(schema, other.model).find((item) => {
          const decided = other.design.find((d) => d.field === item.name)
          return (
            item.type.kind === 'array' &&
            item.type.items.kind === 'model' &&
            item.type.items.name === owner.model.name &&
            decided?.include &&
            decided.relation?.status === 'active' &&
            decided.relation.value === 'join'
          )
        })
    const pair = [`${owner.model.name}.${field.name}`, mirror ? `${other.model.name}.${mirror.name}` : ''].sort().join('|')
    if (joins.has(pair)) return
    joins.add(pair)
    const names = self ? [owner.table.name, toSnakeCase(field.name)] : [owner.table.name, other.table.name].sort()
    const table = newTable(names.join('_'), 'join', owner.model.name, field.name)
    const used = new Set<string>()
    const first = freeName(keyColumnName(owner.model.name, owner.key.column, options), used)
    const second = freeName(keyColumnName(self ? singularField(field.name) : other.model.name, other.key.column, options), used)
    table.columns.push({ name: first, type: owner.key.type, nullable: false }, { name: second, type: other.key.type, nullable: false })
    table.primaryKey = [first, second]
    foreignKey(table, first, owner, 'cascade')
    foreignKey(table, second, other, 'cascade')
    // The primary key already indexes the first column
    table.indexes = table.indexes.filter((index) => index.columns[0] !== first)
    extraTables.push(table)
  }

  // ---------- Enums ----------
  const enums: PhysicalEnum[] = []
  const lookups: Table[] = []
  for (const name of enumsUsed) {
    const definition = findEnum(schema, name)
    if (!definition) continue
    const values = definition.values.map((value) => value.value ?? value.name)
    let storage = design.enums.find((item) => item.enum === name)?.storage.value ?? 'check'
    if (storage === 'native' && (options.dialect === 'sqlite' || options.dialect === 'sqlserver')) {
      notes.push({ code: 'nativeEnumAsCheck', params: { enum: name } })
      storage = 'check'
    }
    const sqlName = storage === 'lookup' ? freeName(tableName(name, options.naming), usedTables) : toSnakeCase(name)
    enums.push({ name, sqlName, values, storage })
    if (storage === 'lookup') {
      const numeric = values.every((value) => typeof value === 'number')
      const code = columnName('code', options.naming)
      lookups.push({
        name: sqlName,
        kind: 'lookup',
        model: name,
        columns: [
          {
            name: code,
            type: numeric
              ? { kind: 'primitive', name: 'integer', bits: 32 }
              : { kind: 'primitive', name: 'string', length: enumLength(values) },
            nullable: false,
          },
        ],
        primaryKey: [code],
        foreignKeys: [],
        uniques: [],
        indexes: [],
        checks: [],
        todos: [],
      })
    }
  }
  const allTables = [...lookups, ...[...entities.values()].map((entity) => entity.table), ...extraTables]
  for (const table of allTables) {
    for (const column of table.columns) {
      if (column.type.kind !== 'enum') continue
      const physical = enums.find((item) => item.name === (column.type as { name: string }).name)
      if (!physical) continue
      if (physical.storage === 'check')
        table.checks.push({ name: constraintName('ck', table.name, [column.name]), column: column.name, values: physical.values })
      if (physical.storage === 'lookup') {
        const lookup = lookups.find((item) => item.name === physical.sqlName)!
        table.foreignKeys.push({
          name: constraintName('fk', table.name, [column.name]),
          columns: [column.name],
          table: lookup.name,
          references: [lookup.primaryKey[0]],
        })
      }
    }
  }
  if (decimals.length > 0)
    notes.push({
      code: 'defaultPrecision',
      params: { fields: decimals.join(', '), precision: `${DEFAULT_PRECISION.precision}, ${DEFAULT_PRECISION.scale}` },
    })

  return { kind: 'relational', tables: allTables, enums, notes }
}

/** Column name of a field: the one the user wrote, the database name the input declares, or the field's. */
export function fieldColumn(field: FieldDef, decided: FieldDesign | undefined, options: BuildOptions): string {
  return decided?.column ?? field.serializedName ?? columnName(field.name, options.naming)
}

/** A column accepts NULL when the field may be null, or may be missing without a value to put instead. */
export function storesNull(field: FieldDef): boolean {
  return field.nullable || (field.optional && field.defaultValue === undefined && !field.generated)
}

/** A float without a size (TypeScript's `number`) used as a key is an integer. */
function keyType(type: ColumnType): ColumnType {
  return type.kind === 'primitive' && type.name === 'float' && type.bits === undefined
    ? { kind: 'primitive', name: 'integer', bits: 64 }
    : type
}

/** Name of a column holding another table's key: `customer` + `id` → `customer_id`; a key that already
 * starts with the prefix is kept as it is (`customer` + `customer_id` → `customer_id`). */
function keyColumnName(prefix: string, key: string, options: BuildOptions): string {
  const prefixWords = nameWords(prefix)
  const keyWords = nameWords(key)
  if (keyWords.length > prefixWords.length && prefixWords.every((word, i) => keyWords[i] === word)) return joinNames([key], options.naming)
  return joinNames([prefix, key], options.naming)
}

/** Table of a list or map owned by a model: `Order.tags` → `order_tags`. */
function ownedTableName(model: string, field: string, options: BuildOptions): string {
  if (options.naming.tables === 'model') return `${model}${toPascalCase(field)}`
  return `${toSnakeCase(model)}_${toSnakeCase(field)}`
}

/** The scalar column that already holds the key of a referenced model: `customerId` next to `customer`,
 * or the one Prisma names in `@relation(fields: [...])`. */
function existingKeyColumn(entity: Entity, field: FieldDef, options: BuildOptions, schema: ModelSchema): string | null {
  const relation = field.annotations?.find((item) => item.name === 'relation')
  const named = relation?.args ? /fields\s*:\s*\[\s*(\w+)/.exec(relation.args)?.[1] : undefined
  const words = [...nameWords(field.name), 'id'].join('')
  for (const other of allFields(schema, entity.model)) {
    const decided = entity.design.find((item) => item.field === other.name)
    if (!decided?.include || decided.relation || other.name === field.name) continue
    if (other.name === named || nameWords(other.name).join('') === words) return fieldColumn(other, decided, options)
  }
  return null
}

function enumLength(values: (string | number)[]): number {
  const longest = Math.max(1, ...values.map((value) => String(value).length))
  return longest <= 20 ? 20 : longest <= 50 ? 50 : DEFAULT_LENGTH
}
