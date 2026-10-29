import { toScreamingSnakeCase } from '../../../model/naming.ts'
import type { Literal } from '../../../model/schema.ts'
import type { Column, ColumnType, Dialect, PhysicalEnum, RelationalSchema, Table } from '../../../physical/types.ts'
import { generateSql } from '../../sql/sql.ts'
import { todoText } from '../../todos.ts'
import type { GeneratedFile, RelationalWriter, WriteContext } from '../../types.ts'
import { buildEntities, enumMembers, type Attribute, type EntityClass, type EntityView } from '../entities.ts'

/** Jakarta Persistence entities in Java, in three flavors: plain JPA, Hibernate (its own types for JSON,
 * arrays and creation times) and Spring Data JPA (plus a repository per entity). The migration is a
 * Flyway script with the schema of the chosen engine. List and map tables are element collections of
 * their owner, as JPA maps them. */

type Flavor = 'jpa' | 'hibernate' | 'spring'

const PACKAGE = 'com.example.model'
const REPOSITORY_PACKAGE = 'com.example.repository'

function javaString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

const KEYWORDS = new Set(
  (
    'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally ' +
    'float for goto if implements import instanceof int interface long native new package private protected public return short ' +
    'static strictfp super switch synchronized this throw throws transient try void volatile while var record yield'
  ).split(' '),
)

function javaName(name: string): string {
  const clean = name.replace(/\W/g, '_')
  return KEYWORDS.has(clean) ? `${clean}Value` : clean
}

interface JavaType {
  type: string
  imports: string[]
}

function enumWidth(item: PhysicalEnum): number {
  const longest = Math.max(1, ...item.values.map((value) => String(value).length))
  return longest <= 20 ? 20 : longest <= 50 ? 50 : 255
}

/** The Java type of a column, wrapper types so that NULL fits. */
function javaType(type: ColumnType, enums: PhysicalEnum[]): JavaType {
  switch (type.kind) {
    case 'raw':
    case 'json':
      return { type: 'String', imports: [] }
    case 'array': {
      const inner = javaType(type.items, enums)
      return { type: `List<${inner.type}>`, imports: ['java.util.List', ...inner.imports] }
    }
    case 'enum': {
      const item = enums.find((candidate) => candidate.name === type.name)
      if (item && (item.storage === 'check' || item.storage === 'native')) return { type: item.name, imports: [] }
      return item?.values.every((value) => typeof value === 'number') ? { type: 'Integer', imports: [] } : { type: 'String', imports: [] }
    }
    case 'primitive':
      switch (type.name) {
        case 'string':
          return { type: 'String', imports: [] }
        case 'integer':
          return { type: type.bits === 64 ? 'Long' : type.bits === 8 || type.bits === 16 ? 'Short' : 'Integer', imports: [] }
        case 'float':
          return { type: type.bits === 32 ? 'Float' : 'Double', imports: [] }
        case 'decimal':
          return { type: 'BigDecimal', imports: ['java.math.BigDecimal'] }
        case 'boolean':
          return { type: 'Boolean', imports: [] }
        case 'date':
          return { type: 'LocalDate', imports: ['java.time.LocalDate'] }
        case 'datetime':
          return { type: 'OffsetDateTime', imports: ['java.time.OffsetDateTime'] }
        case 'time':
          return { type: 'LocalTime', imports: ['java.time.LocalTime'] }
        case 'duration':
          return { type: 'Duration', imports: ['java.time.Duration'] }
        case 'uuid':
          return { type: 'UUID', imports: ['java.util.UUID'] }
        case 'binary':
          return { type: 'byte[]', imports: [] }
        case 'any':
          return { type: 'String', imports: [] }
      }
  }
}

function literal(value: Literal, column: Column, java: string, enums: PhysicalEnum[]): string | null {
  if (value === null) return null
  const item =
    column.type.kind === 'enum' ? enums.find((candidate) => candidate.name === (column.type as { name: string }).name) : undefined
  if (item && java === item.name) {
    const stored = item.values.find((candidate) => String(candidate).toLowerCase() === String(value).toLowerCase())
    return stored === undefined ? null : `${item.name}.${enumConstant(String(stored))}`
  }
  if (typeof value === 'boolean') return java === 'Boolean' ? String(value) : null
  if (typeof value === 'number') {
    if (java === 'Long') return `${value}L`
    if (java === 'Double') return Number.isInteger(value) ? `${value}.0` : String(value)
    if (java === 'Float') return `${value}f`
    if (java === 'Short') return `(short) ${value}`
    if (java === 'BigDecimal') return `new BigDecimal(${javaString(String(value))})`
    return java === 'Integer' ? String(value) : null
  }
  return java === 'String' ? javaString(value) : null
}

function enumConstant(value: string): string {
  const constant = toScreamingSnakeCase(value).replace(/\W/g, '_')
  return /^\d/.test(constant) ? `VALUE_${constant}` : constant || 'EMPTY'
}

interface ClassFile {
  engine: Dialect
  context: WriteContext
  imports: Set<string>
  persistence: Set<string>
  hibernate: Set<string>
  lines: string[]
}

/** Fields of a table that is not an entity: list and map tables, mapped on their owner. */
function elementCollection(table: Table, view: EntityView, file: ClassFile, fieldName: string): string[] {
  const ownerColumn = table.foreignKeys[0].columns[0]
  const value = table.columns.find((column) => column.name !== ownerColumn && column.name !== table.primaryKey[1])!
  const second = table.columns.find((column) => column.name === table.primaryKey[1])!
  const type = javaType(value.type, view.enums)
  type.imports.forEach((name) => file.imports.add(name))
  file.persistence.add('ElementCollection').add('CollectionTable').add('JoinColumn').add('Column')
  const lines = [
    '@ElementCollection',
    `@CollectionTable(name = ${javaString(table.name)}, joinColumns = @JoinColumn(name = ${javaString(ownerColumn)}))`,
  ]
  if (table.kind === 'list') {
    file.persistence.add('OrderColumn')
    file.imports.add('java.util.List').add('java.util.ArrayList')
    lines.push(
      `@OrderColumn(name = ${javaString(second.name)})`,
      `@Column(name = ${javaString(value.name)})`,
      `private List<${type.type}> ${fieldName} = new ArrayList<>();`,
    )
  } else {
    file.persistence.add('MapKeyColumn')
    file.imports.add('java.util.Map').add('java.util.HashMap')
    lines.push(
      `@MapKeyColumn(name = ${javaString(second.name)})`,
      `@Column(name = ${javaString(value.name)})`,
      `private Map<String, ${type.type}> ${fieldName} = new HashMap<>();`,
    )
  }
  return lines
}

function columnAnnotation(column: Column, extra: string[] = []): string {
  const settings = [`name = ${javaString(column.name)}`]
  if (!column.nullable) settings.push('nullable = false')
  if (column.type.kind === 'primitive' && column.type.name === 'string' && column.type.length)
    settings.push(`length = ${column.type.length}`)
  if (column.type.kind === 'primitive' && column.type.name === 'decimal')
    settings.push(`precision = ${column.type.precision ?? 18}`, `scale = ${column.type.scale ?? 2}`)
  return `@Column(${[...settings, ...extra].join(', ')})`
}

function fieldLines(attribute: Attribute, view: EntityView, flavor: Flavor, file: ClassFile): string[] {
  const { column } = attribute
  const type = javaType(column.type, view.enums)
  type.imports.forEach((name) => file.imports.add(name))
  const lines: string[] = []
  file.persistence.add('Column')
  if (attribute.primaryKey) {
    file.persistence.add('Id')
    lines.push('@Id')
    if (column.generated === 'identity') {
      file.persistence.add('GeneratedValue').add('GenerationType')
      lines.push('@GeneratedValue(strategy = GenerationType.IDENTITY)')
    }
    if (column.generated === 'uuid') {
      file.persistence.add('GeneratedValue').add('GenerationType')
      lines.push('@GeneratedValue(strategy = GenerationType.UUID)')
    }
  }
  const enumItem = attribute.enum
  // A PostgreSQL enum type does not take text as it is: Hibernate casts it when writing
  if (enumItem?.storage === 'native' && file.engine === 'postgresql') {
    if (flavor === 'jpa') file.context.note({ code: 'enumNeedsCast', params: { orm: 'JPA', enum: enumItem.name } })
    else {
      file.hibernate.add('annotations.ColumnTransformer')
      lines.push(`@ColumnTransformer(write = ${javaString(`?::${enumItem.sqlName}`)})`)
    }
  }
  if (flavor !== 'jpa' && (column.type.kind === 'json' || (column.type.kind === 'primitive' && column.type.name === 'any'))) {
    file.hibernate.add('annotations.JdbcTypeCode').add('type.SqlTypes')
    lines.push('@JdbcTypeCode(SqlTypes.JSON)')
  }
  if (column.type.kind === 'array') {
    file.hibernate.add('annotations.JdbcTypeCode').add('type.SqlTypes')
    lines.push('@JdbcTypeCode(SqlTypes.ARRAY)')
  }
  if (column.generated === 'now' && flavor !== 'jpa') {
    file.hibernate.add('annotations.CreationTimestamp')
    lines.push('@CreationTimestamp')
  }
  const enumLength = enumItem && enumItem.storage !== 'native' && type.type !== 'Integer' ? [`length = ${enumWidth(enumItem)}`] : []
  // Without Hibernate, the database fills the creation time: JPA must not write it
  const fill = column.generated === 'now' && flavor === 'jpa' ? ['insertable = false', 'updatable = false'] : []
  lines.push(columnAnnotation(column, [...fill, ...enumLength]))
  let initializer = ''
  if (column.defaultValue !== undefined && column.defaultValue !== null) {
    const value = literal(column.defaultValue, column, type.type, view.enums)
    if (value) initializer = ` = ${value}`
  }
  lines.push(`private ${type.type} ${javaName(attribute.name)}${initializer};`)
  return lines
}

function relationLines(
  navigation: EntityClass['navigations'][number],
  item: EntityClass,
  view: EntityView,
  listTables: Map<string, Table>,
  file: ClassFile,
): string[] {
  const name = javaName(navigation.name)
  switch (navigation.kind) {
    case 'manyToOne': {
      const attribute = item.attributes.find((candidate) => candidate.name === navigation.attribute)!
      const fk = attribute.foreignKey!
      file.persistence.add('ManyToOne').add('FetchType').add('JoinColumn').add('ForeignKey')
      const target = view.classes.find((candidate) => candidate.name === navigation.target)!
      const reference = target.attributes.find((candidate) => !candidate.primaryKey && candidate.column.name === fk.references[0])
      const settings = [
        `name = ${javaString(attribute.column.name)}`,
        ...(reference ? [`referencedColumnName = ${javaString(fk.references[0])}`] : []),
        ...(attribute.column.nullable ? [] : ['nullable = false']),
        `foreignKey = @ForeignKey(name = ${javaString(fk.name)})`,
      ]
      return [
        `@ManyToOne(fetch = FetchType.LAZY${navigation.nullable ? '' : ', optional = false'})`,
        `@JoinColumn(${settings.join(', ')})`,
        `private ${navigation.target} ${name};`,
      ]
    }
    case 'oneToMany': {
      const table = listTables.get(`${item.name}.${navigation.name}`)
      if (table) return elementCollection(table, view, file, name)
      file.persistence.add('OneToMany')
      file.imports.add('java.util.List').add('java.util.ArrayList')
      if (navigation.cascade) file.persistence.add('CascadeType')
      const settings = [
        `mappedBy = ${javaString(navigation.inverse!)}`,
        ...(navigation.cascade ? ['cascade = CascadeType.ALL', 'orphanRemoval = true'] : []),
      ]
      return [`@OneToMany(${settings.join(', ')})`, `private List<${navigation.target}> ${name} = new ArrayList<>();`]
    }
    case 'manyToMany': {
      file.persistence.add('ManyToMany')
      file.imports.add('java.util.Set').add('java.util.HashSet')
      const join = navigation.join!
      const owner = join.ownerColumn === join.table.foreignKeys[0].columns[0]
      if (!owner)
        return [
          `@ManyToMany(mappedBy = ${javaString(navigation.inverse!)})`,
          `private Set<${navigation.target}> ${name} = new HashSet<>();`,
        ]
      file.persistence.add('JoinTable').add('JoinColumn')
      return [
        '@ManyToMany',
        `@JoinTable(name = ${javaString(join.table.name)}, joinColumns = @JoinColumn(name = ${javaString(join.ownerColumn)}), inverseJoinColumns = @JoinColumn(name = ${javaString(join.targetColumn)}))`,
        `private Set<${navigation.target}> ${name} = new HashSet<>();`,
      ]
    }
  }
}

function tableAnnotation(table: Table, file: ClassFile): string {
  const settings = [`name = ${javaString(table.name)}`]
  if (table.uniques.length > 0) {
    file.persistence.add('UniqueConstraint')
    settings.push(
      `uniqueConstraints = { ${table.uniques.map((unique) => `@UniqueConstraint(name = ${javaString(unique.name)}, columnNames = { ${unique.columns.map(javaString).join(', ')} })`).join(', ')} }`,
    )
  }
  if (table.indexes.length > 0) {
    file.persistence.add('Index')
    settings.push(
      `indexes = { ${table.indexes.map((index) => `@Index(name = ${javaString(index.name)}, columnList = ${javaString(index.columns.join(', '))}${index.unique ? ', unique = true' : ''})`).join(', ')} }`,
    )
  }
  if (table.checks.length > 0) {
    file.persistence.add('CheckConstraint')
    const checks = table.checks.map((check) => {
      const values = check.values.map((value) => (typeof value === 'number' ? value : `'${String(value).replace(/'/g, "''")}'`)).join(', ')
      return `@CheckConstraint(name = ${javaString(check.name)}, constraint = ${javaString(`${check.column} IN (${values})`)})`
    })
    settings.push(`check = { ${checks.join(', ')} }`)
  }
  return `@Table(${settings.join(', ')})`
}

function render(file: ClassFile, packageName: string): string {
  const imports = [
    ...[...file.persistence].sort().map((name) => `import jakarta.persistence.${name};`),
    ...[...file.hibernate].sort().map((name) => `import org.hibernate.${name};`),
    ...[...file.imports].sort().map((name) => `import ${name};`),
  ]
  return [`package ${packageName};`, '', ...imports, ...(imports.length > 0 ? [''] : []), ...file.lines, ''].join('\n')
}

function entityFile(item: EntityClass, view: EntityView, flavor: Flavor, listTables: Map<string, Table>, context: WriteContext): string {
  const file: ClassFile = {
    engine: context.settings.engine,
    context,
    imports: new Set(),
    persistence: new Set(['Entity', 'Table']),
    hibernate: new Set(),
    lines: [],
  }
  const members: string[][] = []
  const navigated = new Set(
    item.navigations.filter((navigation) => navigation.kind === 'manyToOne').map((navigation) => navigation.attribute),
  )
  for (const attribute of item.attributes) {
    // A key column with its navigation is mapped by the navigation's @JoinColumn
    if (navigated.has(attribute.name) && !attribute.primaryKey) continue
    members.push(fieldLines(attribute, view, flavor, file))
  }
  for (const navigation of item.navigations) members.push(relationLines(navigation, item, view, listTables, file))
  file.lines.push(
    `/** Entity written by Model2DB from ${context.title}. Review it before using it. */`,
    ...item.table.todos.map((todo) => `// ${todoText(todo, item.table.model, 'table')}`),
    '@Entity',
    tableAnnotation(item.table, file),
    `public class ${item.name} {`,
    members.map((lines) => lines.map((line) => `    ${line}`).join('\n')).join('\n\n'),
  )
  // Getters and setters keep the fields private, as JPA providers and Spring expect
  const accessors: string[] = []
  for (const lines of members) {
    const declaration = lines[lines.length - 1].replace(/ = .*;$/, ';')
    const match = /^private (.+) (\w+);$/.exec(declaration)
    if (!match) continue
    const [, type, name] = match
    const capital = name.charAt(0).toUpperCase() + name.slice(1)
    accessors.push(
      `    public ${type} get${capital}() {\n        return ${name};\n    }`,
      `    public void set${capital}(${type} ${name}) {\n        this.${name} = ${name};\n    }`,
    )
  }
  file.lines.push('', accessors.join('\n\n'), '}')
  return render(file, PACKAGE)
}

function enumFile(item: PhysicalEnum, context: WriteContext): string {
  const members = enumMembers(item, context.schema)
  const constants = members.map((member) => `    ${enumConstant(String(member.value))}(${javaString(String(member.value))})`)
  return [
    `package ${PACKAGE};`,
    '',
    `/** The values of ${item.name} as the database stores them. */`,
    `public enum ${item.name} {`,
    `${constants.join(',\n')};`,
    '',
    '    private final String value;',
    '',
    `    ${item.name}(String value) {`,
    '        this.value = value;',
    '    }',
    '',
    '    public String getValue() {',
    '        return value;',
    '    }',
    '}',
    '',
  ].join('\n')
}

/** Stores the enum's values (`paid`) rather than the constants' names (`PAID`). */
function converterFile(item: PhysicalEnum): string {
  return [
    `package ${PACKAGE};`,
    '',
    'import jakarta.persistence.AttributeConverter;',
    'import jakarta.persistence.Converter;',
    '',
    '@Converter(autoApply = true)',
    `public class ${item.name}Converter implements AttributeConverter<${item.name}, String> {`,
    '    @Override',
    `    public String convertToDatabaseColumn(${item.name} value) {`,
    '        return value == null ? null : value.getValue();',
    '    }',
    '',
    '    @Override',
    `    public ${item.name} convertToEntityAttribute(String value) {`,
    '        if (value == null) return null;',
    `        for (${item.name} candidate : ${item.name}.values()) if (candidate.getValue().equals(value)) return candidate;`,
    `        throw new IllegalArgumentException("Unknown ${item.name}: " + value);`,
    '    }',
    '}',
    '',
  ].join('\n')
}

function repositoryFile(item: EntityClass, view: EntityView): string | null {
  const key = item.attributes.find((attribute) => attribute.primaryKey)
  if (!key) return null
  const type = javaType(key.column.type, view.enums)
  return [
    `package ${REPOSITORY_PACKAGE};`,
    '',
    `import ${PACKAGE}.${item.name};`,
    'import org.springframework.data.jpa.repository.JpaRepository;',
    ...type.imports.map((name) => `import ${name};`),
    '',
    `public interface ${item.name}Repository extends JpaRepository<${item.name}, ${type.type}> {}`,
    '',
  ].join('\n')
}

function writer(id: string, label: string, flavor: Flavor): RelationalWriter {
  return {
    id,
    label,
    group: 'jvm',
    engines: ['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle'],
    migrations: true,
    write(physical: RelationalSchema, context: WriteContext): GeneratedFile[] {
      const view = buildEntities(physical, context.schema, 'camelCase')
      // List and map tables are element collections of their owner, not entities
      const listTables = new Map<string, Table>()
      for (const item of view.classes) {
        if (item.table.kind !== 'list' && item.table.kind !== 'map') continue
        const owner = view.classes.find((candidate) =>
          candidate.navigations.some((navigation) => navigation.kind === 'oneToMany' && navigation.target === item.name),
        )
        const navigation = owner?.navigations.find((candidate) => candidate.kind === 'oneToMany' && candidate.target === item.name)
        if (owner && navigation) listTables.set(`${owner.name}.${navigation.name}`, item.table)
      }
      const entities = view.classes.filter((item) => item.table.kind !== 'list' && item.table.kind !== 'map')
      const path = (name: string, pkg = PACKAGE) => `src/main/java/${pkg.replace(/\./g, '/')}/${name}.java`
      const files: GeneratedFile[] = []
      for (const item of view.enums) {
        if (item.storage !== 'check' && item.storage !== 'native') continue
        if (item.values.some((value) => typeof value === 'number')) continue
        files.push({ name: path(item.name), content: enumFile(item, context), editorLanguage: 'java' })
        files.push({ name: path(`${item.name}Converter`), content: converterFile(item), editorLanguage: 'java' })
      }
      for (const item of entities)
        files.push({ name: path(item.name), content: entityFile(item, view, flavor, listTables, context), editorLanguage: 'java' })
      if (flavor === 'spring')
        for (const item of entities) {
          const content = repositoryFile(item, view)
          if (content) files.push({ name: path(`${item.name}Repository`, REPOSITORY_PACKAGE), content, editorLanguage: 'java' })
        }
      if (context.settings.migrations)
        files.push({
          name: 'src/main/resources/db/migration/V1__create_schema.sql',
          content: generateSql(physical, context.settings.engine, { title: context.title }),
          editorLanguage: 'sql',
        })
      return files
    },
  }
}

export const jpaOutput = writer('jpa', 'JPA (Jakarta Persistence)', 'jpa')
export const hibernateOutput = writer('hibernate', 'Hibernate', 'hibernate')
export const springDataJpaOutput = writer('spring-data-jpa', 'Spring Data JPA', 'spring')
