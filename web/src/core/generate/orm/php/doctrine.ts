import type { Literal } from '../../../model/schema.ts'
import type { Column, ColumnType, PhysicalEnum, RelationalSchema } from '../../../physical/types.ts'
import { schemaStatements } from '../../sql/statements.ts'
import { todoText } from '../../todos.ts'
import type { GeneratedFile, RelationalWriter, WriteContext } from '../../types.ts'
import { buildEntities, type Attribute, type EntityClass, type EntityView } from '../entities.ts'
import { backedEnum, caseName, isBackedEnum, phpString, phpType, sqlLiteral } from './php.ts'

/** Doctrine ORM entities with PHP attributes, and a Doctrine Migrations class with the schema written
 * for the chosen engine (`addSql`, as Doctrine writes its own migrations). */

const NAMESPACE = 'App\\Entity'

function enumWidth(item: PhysicalEnum): number {
  const longest = Math.max(1, ...item.values.map((value) => String(value).length))
  return longest <= 20 ? 20 : longest <= 50 ? 50 : 255
}

/** The Doctrine DBAL type and its column settings. */
function dbalType(type: ColumnType, enums: PhysicalEnum[]): string[] {
  switch (type.kind) {
    case 'raw':
    case 'json':
    case 'array':
      return ['type: Types::JSON']
    case 'enum': {
      const item = enums.find((candidate) => candidate.name === type.name)
      if (item?.values.every((value) => typeof value === 'number')) return ['type: Types::INTEGER']
      const settings = ['type: Types::STRING', `length: ${item ? enumWidth(item) : 255}`]
      if (item && isBackedEnum(item)) settings.push(`enumType: ${item.name}::class`)
      return settings
    }
    case 'primitive':
      switch (type.name) {
        case 'string':
          return type.length ? ['type: Types::STRING', `length: ${type.length}`] : ['type: Types::TEXT']
        case 'integer':
          return [
            type.bits === 64
              ? 'type: Types::BIGINT'
              : type.bits === 8 || type.bits === 16
                ? 'type: Types::SMALLINT'
                : 'type: Types::INTEGER',
          ]
        case 'float':
          return ['type: Types::FLOAT']
        case 'decimal':
          return ['type: Types::DECIMAL', `precision: ${type.precision ?? 18}`, `scale: ${type.scale ?? 2}`]
        case 'boolean':
          return ['type: Types::BOOLEAN']
        case 'date':
          return ['type: Types::DATE_IMMUTABLE']
        case 'datetime':
          return ['type: Types::DATETIMETZ_IMMUTABLE']
        case 'time':
          return ['type: Types::TIME_IMMUTABLE']
        case 'duration':
          return ['type: Types::STRING', 'length: 50']
        case 'uuid':
          return ['type: Types::GUID']
        case 'binary':
          return ['type: Types::BLOB']
        case 'any':
          return ['type: Types::JSON']
      }
  }
}

/** PHP type of a property: the DBAL type's PHP value. */
function propertyType(type: ColumnType, enums: PhysicalEnum[]): string {
  if (type.kind === 'primitive' && type.name === 'binary') return 'mixed'
  if (type.kind === 'primitive' && (type.name === 'time' || type.name === 'date' || type.name === 'datetime')) return '\\DateTimeImmutable'
  return phpType(type, enums)
}

function literal(value: Literal, column: Column, php: string, enums: PhysicalEnum[]): string | null {
  if (value === null) return null
  const item =
    column.type.kind === 'enum' ? enums.find((candidate) => candidate.name === (column.type as { name: string }).name) : undefined
  if (item && php === item.name) {
    const stored = item.values.find((candidate) => String(candidate).toLowerCase() === String(value).toLowerCase())
    return stored === undefined ? null : `${item.name}::${caseName(String(stored))}`
  }
  if (typeof value === 'boolean') return php === 'bool' ? String(value) : null
  if (typeof value === 'number')
    return php === 'int' || php === 'float' ? String(value) : php === 'string' ? phpString(String(value)) : null
  return php === 'string' ? phpString(value) : null
}

interface Member {
  attributes: string[]
  declaration: string
  /** `name: type` for the accessors */
  property: { name: string; type: string; collection: boolean }
}

function columnMember(attribute: Attribute, view: EntityView): Member {
  const { column } = attribute
  const attributes: string[] = []
  if (attribute.primaryKey || attribute.compositeKey) attributes.push('#[ORM\\Id]')
  if (attribute.primaryKey && column.generated === 'identity') attributes.push("#[ORM\\GeneratedValue(strategy: 'IDENTITY')]")
  const settings = [`name: ${phpString(column.name)}`, ...dbalType(column.type, view.enums)]
  if (column.nullable) settings.push('nullable: true')
  if (column.generated === 'now') settings.push("options: ['default' => 'CURRENT_TIMESTAMP']")
  attributes.push(`#[ORM\\Column(${settings.join(', ')})]`)
  const type = propertyType(column.type, view.enums)
  const nullable = column.nullable || (attribute.primaryKey && column.generated) || column.generated === 'now'
  let initial = nullable && type !== 'mixed' ? ' = null' : ''
  if (column.defaultValue !== undefined && column.defaultValue !== null) {
    const value = literal(column.defaultValue, column, type, view.enums)
    if (value) initial = ` = ${value}`
  }
  const declared = type === 'mixed' ? 'mixed' : `${nullable ? '?' : ''}${type}`
  return {
    attributes,
    declaration: `private ${declared} $${attribute.name}${initial};`,
    property: { name: attribute.name, type: declared, collection: false },
  }
}

function relationMember(navigation: EntityClass['navigations'][number], item: EntityClass, view: EntityView): Member | null {
  const target = view.classes.find((candidate) => candidate.name === navigation.target)!
  switch (navigation.kind) {
    case 'manyToOne': {
      const attribute = item.attributes.find((candidate) => candidate.name === navigation.attribute)!
      const fk = attribute.foreignKey!
      const attributes = []
      if (attribute.compositeKey || attribute.primaryKey) attributes.push('#[ORM\\Id]')
      attributes.push(
        `#[ORM\\ManyToOne(targetEntity: ${target.name}::class${navigation.inverse ? `, inversedBy: ${phpString(navigation.inverse)}` : ''})]`,
        `#[ORM\\JoinColumn(name: ${phpString(attribute.column.name)}, referencedColumnName: ${phpString(fk.references[0])}, nullable: ${navigation.nullable ? 'true' : 'false'}${fk.onDelete ? `, onDelete: ${phpString(fk.onDelete.toUpperCase())}` : ''})]`,
      )
      const type = `${navigation.nullable ? '?' : ''}${target.name}`
      return {
        attributes,
        declaration: `private ${type} $${navigation.name}${navigation.nullable ? ' = null' : ''};`,
        property: { name: navigation.name, type, collection: false },
      }
    }
    case 'oneToMany': {
      const cascade = navigation.cascade ? ", cascade: ['persist', 'remove'], orphanRemoval: true" : ''
      return {
        attributes: [`#[ORM\\OneToMany(targetEntity: ${target.name}::class, mappedBy: ${phpString(navigation.inverse!)}${cascade})]`],
        declaration: `private Collection $${navigation.name};`,
        property: { name: navigation.name, type: 'Collection', collection: true },
      }
    }
    case 'manyToMany': {
      const join = navigation.join!
      const owner = join.ownerColumn === join.table.foreignKeys[0].columns[0]
      const [first, second] = join.table.foreignKeys
      const attributes = owner
        ? [
            `#[ORM\\ManyToMany(targetEntity: ${target.name}::class${navigation.inverse ? `, inversedBy: ${phpString(navigation.inverse)}` : ''})]`,
            `#[ORM\\JoinTable(name: ${phpString(join.table.name)})]`,
            `#[ORM\\JoinColumn(name: ${phpString(first.columns[0])}, referencedColumnName: ${phpString(first.references[0])}, onDelete: 'CASCADE')]`,
            `#[ORM\\InverseJoinColumn(name: ${phpString(second.columns[0])}, referencedColumnName: ${phpString(second.references[0])}, onDelete: 'CASCADE')]`,
          ]
        : [`#[ORM\\ManyToMany(targetEntity: ${target.name}::class, mappedBy: ${phpString(navigation.inverse!)})]`]
      return {
        attributes,
        declaration: `private Collection $${navigation.name};`,
        property: { name: navigation.name, type: 'Collection', collection: true },
      }
    }
  }
}

function entityFile(item: EntityClass, view: EntityView, context: WriteContext): string {
  const navigated = new Set(
    item.navigations.filter((navigation) => navigation.kind === 'manyToOne').map((navigation) => navigation.attribute),
  )
  const members: Member[] = []
  // A key column with its navigation is mapped by the navigation's JoinColumn
  for (const attribute of item.attributes) if (!navigated.has(attribute.name)) members.push(columnMember(attribute, view))
  for (const navigation of item.navigations) {
    const member = relationMember(navigation, item, view)
    if (member) members.push(member)
  }
  const tableSettings = [`name: ${phpString(item.table.name)}`]
  const classAttributes = [`#[ORM\\Entity]`, `#[ORM\\Table(${tableSettings.join(', ')})]`]
  for (const index of item.table.indexes)
    classAttributes.push(`#[ORM\\Index(name: ${phpString(index.name)}, columns: [${index.columns.map(phpString).join(', ')}])]`)
  for (const unique of item.table.uniques)
    classAttributes.push(
      `#[ORM\\UniqueConstraint(name: ${phpString(unique.name)}, columns: [${unique.columns.map(phpString).join(', ')}])]`,
    )
  const collections = members.filter((member) => member.property.collection)
  const uses = ['Doctrine\\DBAL\\Types\\Types', 'Doctrine\\ORM\\Mapping as ORM']
  if (collections.length > 0) uses.unshift('Doctrine\\Common\\Collections\\ArrayCollection', 'Doctrine\\Common\\Collections\\Collection')
  for (const attribute of item.attributes)
    if (attribute.enum && isBackedEnum(attribute.enum)) uses.push(`App\\Enum\\${attribute.enum.name}`)
  const body: string[] = []
  for (const member of members) body.push(...member.attributes.map((line) => `    ${line}`), `    ${member.declaration}`, '')
  if (collections.length > 0)
    body.push(
      '    public function __construct()',
      '    {',
      ...collections.map((member) => `        $this->${member.property.name} = new ArrayCollection();`),
      '    }',
      '',
    )
  for (const member of members) {
    const { name, type } = member.property
    const capital = name.charAt(0).toUpperCase() + name.slice(1)
    body.push(`    public function get${capital}(): ${type}`, '    {', `        return $this->${name};`, '    }', '')
    if (!member.property.collection)
      body.push(
        `    public function set${capital}(${type} $${name}): static`,
        '    {',
        `        $this->${name} = $${name};`,
        '',
        '        return $this;',
        '    }',
        '',
      )
  }
  body.pop()
  return [
    '<?php',
    '',
    `namespace ${NAMESPACE};`,
    '',
    ...[...new Set(uses)].sort().map((name) => `use ${name};`),
    '',
    `/** Entity written by Model2DB from ${context.title}. Review it before using it. */`,
    ...item.table.todos.map((todo) => `// ${todoText(todo, item.table.model, 'table')}`),
    ...classAttributes,
    `class ${item.name}`,
    '{',
    ...body,
    '}',
    '',
  ].join('\n')
}

function migrationFile(physical: RelationalSchema, context: WriteContext): string {
  const { up, down } = schemaStatements(physical, context.settings.engine, context.title)
  return [
    '<?php',
    '',
    'declare(strict_types=1);',
    '',
    'namespace DoctrineMigrations;',
    '',
    'use Doctrine\\DBAL\\Schema\\Schema;',
    'use Doctrine\\Migrations\\AbstractMigration;',
    '',
    `/** Migration written by Model2DB from ${context.title}: the schema as Model2DB writes it for this engine. */`,
    'final class Version20250101000000 extends AbstractMigration',
    '{',
    '    public function getDescription(): string',
    '    {',
    `        return ${phpString(`Create the ${context.title} schema`)};`,
    '    }',
    '',
    '    public function up(Schema $schema): void',
    '    {',
    ...up.map((sql) => `        $this->addSql(${sqlLiteral(sql, '            ')});`),
    '    }',
    '',
    '    public function down(Schema $schema): void',
    '    {',
    ...down.map((sql) => `        $this->addSql(${phpString(sql)});`),
    '    }',
    '}',
    '',
  ].join('\n')
}

export const doctrineOutput: RelationalWriter = {
  id: 'doctrine',
  label: 'Doctrine ORM',
  group: 'php',
  engines: ['mysql', 'mariadb', 'postgresql', 'sqlite', 'sqlserver', 'oracle'],
  migrations: true,
  write(physical, context): GeneratedFile[] {
    const view = buildEntities(physical, context.schema, 'camelCase')
    const files: GeneratedFile[] = []
    for (const item of view.enums)
      if (isBackedEnum(item))
        files.push({ name: `src/Enum/${item.name}.php`, content: backedEnum('App\\Enum', item.name, item.values), editorLanguage: 'php' })
    for (const item of view.classes)
      files.push({ name: `src/Entity/${item.name}.php`, content: entityFile(item, view, context), editorLanguage: 'php' })
    if (context.settings.migrations)
      files.push({ name: 'migrations/Version20250101000000.php', content: migrationFile(physical, context), editorLanguage: 'php' })
    return files
  },
}
