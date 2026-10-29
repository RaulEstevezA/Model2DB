import type { Literal } from '../../../model/schema.ts'
import type { Column, ColumnType, PhysicalEnum } from '../../../physical/types.ts'
import type { Attribute, EntityClass, EntityView, Navigation } from '../entities.ts'
import { pyIdentifier, pyString } from './python.ts'

/** SQLAlchemy column types, column settings and relationships, shared by the SQLAlchemy and SQLModel
 * writers and by the Alembic migration. */

export interface TypeParts {
  /** SQLAlchemy type expression (`String(255)`) without the module prefix */
  sql: string
  /** Python type for `Mapped[...]` */
  python: string
  /** Names to import from `sqlalchemy` */
  imports: string[]
  /** Modules of the standard library the Python type needs */
  modules: string[]
}

function enumLength(item: PhysicalEnum): number {
  const longest = Math.max(1, ...item.values.map((value) => String(value).length))
  return longest <= 20 ? 20 : longest <= 50 ? 50 : 255
}

/** `identity`: the column is a key the database numbers; SQLite only does that for INTEGER, so a
 * BIGINT key uses its INTEGER variant there. */
export function typeParts(type: ColumnType, enums: PhysicalEnum[], migration: boolean, identity = false): TypeParts {
  const parts = (sql: string, python: string, imports: string[], modules: string[] = []): TypeParts => ({ sql, python, imports, modules })
  switch (type.kind) {
    case 'raw':
      return parts(`text(${pyString(type.sql)})`, 'Any', ['text'], ['typing'])
    case 'json':
      return parts('JSON', 'Any', ['JSON'], ['typing'])
    case 'array': {
      const inner = typeParts(type.items, enums, migration)
      return parts(`ARRAY(${inner.sql})`, `list[${inner.python}]`, ['ARRAY', ...inner.imports], inner.modules)
    }
    case 'enum': {
      const item = enums.find((candidate) => candidate.name === type.name)
      if (!item) return parts('String(255)', 'str', ['String'])
      const numeric = item.values.every((value) => typeof value === 'number')
      if (item.storage === 'lookup' || item.storage === 'text')
        return numeric ? parts('Integer', 'int', ['Integer']) : parts(`String(${enumLength(item)})`, 'str', ['String'])
      // In the migration the values are written out; in the models the Python enum gives them
      const source = migration ? item.values.map((value) => pyString(String(value))).join(', ') : item.name
      const settings =
        item.storage === 'native'
          ? `name=${pyString(item.sqlName)}`
          : `native_enum=False, create_constraint=True, length=${enumLength(item)}, name=${pyString(`ck_${item.sqlName}`)}`
      return parts(`Enum(${source}, ${settings}${migration ? '' : ', values_callable=enum_values'})`, item.name, ['Enum'])
    }
    case 'primitive':
      switch (type.name) {
        case 'string':
          return type.length ? parts(`String(${type.length})`, 'str', ['String']) : parts('Text', 'str', ['Text'])
        case 'integer':
          if (type.bits === 64 && identity) return parts('BigInteger().with_variant(Integer(), "sqlite")', 'int', ['BigInteger', 'Integer'])
          if (type.bits === 64) return parts('BigInteger', 'int', ['BigInteger'])
          if (type.bits === 8 || type.bits === 16) return parts('SmallInteger', 'int', ['SmallInteger'])
          return parts('Integer', 'int', ['Integer'])
        case 'float':
          return type.bits === 32 ? parts('Float', 'float', ['Float']) : parts('Double', 'float', ['Double'])
        case 'decimal':
          return parts(`Numeric(${type.precision ?? 18}, ${type.scale ?? 2})`, 'decimal.Decimal', ['Numeric'], ['decimal'])
        case 'boolean':
          return parts('Boolean', 'bool', ['Boolean'])
        case 'date':
          return parts('Date', 'datetime.date', ['Date'], ['datetime'])
        case 'datetime':
          return parts('DateTime(timezone=True)', 'datetime.datetime', ['DateTime'], ['datetime'])
        case 'time':
          return parts('Time', 'datetime.time', ['Time'], ['datetime'])
        case 'duration':
          return parts('Interval', 'datetime.timedelta', ['Interval'], ['datetime'])
        case 'uuid':
          return parts('Uuid', 'uuid.UUID', ['Uuid'], ['uuid'])
        case 'binary':
          return parts('LargeBinary', 'bytes', ['LargeBinary'])
        case 'any':
          return parts('JSON', 'Any', ['JSON'], ['typing'])
      }
  }
}

export function pyLiteral(value: Literal, column: Column, enums: PhysicalEnum[]): string {
  if (value === null) return 'None'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'number') return String(value)
  const item =
    column.type.kind === 'enum' ? enums.find((candidate) => candidate.name === (column.type as { name: string }).name) : undefined
  const stored = item?.values.find((candidate) => String(candidate).toLowerCase() === value.toLowerCase())
  return pyString(String(stored ?? value))
}

/** Keyword arguments of `mapped_column` / `sa.Column` that both files share. */
export function columnSettings(attribute: Attribute, view: EntityView, prefix: string): string[] {
  const { column } = attribute
  const settings: string[] = []
  if (attribute.primaryKey || attribute.compositeKey) settings.push('primary_key=True')
  if (attribute.primaryKey && column.type.kind === 'primitive' && column.type.name === 'integer' && column.generated !== 'identity')
    settings.push('autoincrement=False')
  if (attribute.unique) settings.push('unique=True')
  if (attribute.indexed) settings.push('index=True')
  if (column.generated === 'uuid') settings.push('default=uuid.uuid4')
  if (column.generated === 'now') settings.push(`server_default=${prefix}func.now()`)
  if (column.defaultValue !== undefined && column.defaultValue !== null)
    settings.push(`default=${pyLiteral(column.defaultValue, column, view.enums)}`)
  return settings
}

export function foreignKeyCall(attribute: Attribute, prefix: string): string | null {
  const fk = attribute.foreignKey
  if (!fk) return null
  const action = fk.onDelete ? `, ondelete=${pyString(fk.onDelete.toUpperCase())}` : ''
  return `${prefix}ForeignKey(${pyString(`${fk.table}.${fk.references[0]}`)}${action})`
}

/** The settings of a relationship, as keyword arguments of SQLAlchemy's `relationship()` (both writers pass them
 * on: SQLAlchemy directly, SQLModel inside `sa_relationship_kwargs`). */
export interface RelationshipParts {
  backPopulates?: string
  /** `Order.customer_id`: which column holds the key, for models with several keys to the same table */
  foreignKeys?: string
  /** `Category.id`: the side holding the key, for a model that refers to itself */
  remoteSide?: string
  cascade?: string
}

export function relationshipParts(navigation: Navigation, owner: EntityClass): RelationshipParts {
  const parts: RelationshipParts = navigation.inverse ? { backPopulates: navigation.inverse } : {}
  if (navigation.kind === 'manyToOne') {
    parts.foreignKeys = `${owner.name}.${navigation.attribute}`
    if (navigation.target === owner.name) parts.remoteSide = `${owner.name}.${primaryAttribute(owner)}`
  }
  if (navigation.kind === 'oneToMany') {
    parts.foreignKeys = `${navigation.target}.${navigation.attribute}`
    if (navigation.cascade) parts.cascade = 'all, delete-orphan'
  }
  return parts
}

export function relationshipLine(navigation: Navigation, owner: EntityClass): string {
  const name = pyIdentifier(navigation.name)
  const parts = relationshipParts(navigation, owner)
  const settings = [
    navigation.kind === 'manyToMany' ? `secondary=${pyIdentifier(navigation.join!.table.name)}` : '',
    parts.backPopulates ? `back_populates=${pyString(parts.backPopulates)}` : '',
    parts.remoteSide ? `remote_side=${pyString(parts.remoteSide)}` : '',
    parts.foreignKeys ? `foreign_keys=${pyString(parts.foreignKeys)}` : '',
    parts.cascade ? `cascade=${pyString(parts.cascade)}` : '',
  ].filter(Boolean)
  const type =
    navigation.kind === 'manyToOne'
      ? navigation.nullable
        ? `${navigation.target} | None`
        : navigation.target
      : `list[${navigation.target}]`
  return `${name}: Mapped[${type}] = relationship(${settings.join(', ')})`
}

export function primaryAttribute(item: EntityClass): string {
  return item.attributes.find((attribute) => attribute.primaryKey)?.name ?? 'id'
}
