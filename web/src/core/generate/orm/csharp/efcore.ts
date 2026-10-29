import { toPascalCase } from '../../../model/naming.ts'
import type { Literal } from '../../../model/schema.ts'
import type { Column, ColumnType, Dialect, PhysicalEnum } from '../../../physical/types.ts'
import { sqlColumnType } from '../../sql/sql.ts'
import { todoText } from '../../todos.ts'
import type { GeneratedFile, RelationalWriter, WriteContext } from '../../types.ts'
import { buildEntities, enumMembers, type Attribute, type EntityClass, type EntityView } from '../entities.ts'

/** Entity Framework Core: entity classes and a DbContext that configures every table, column type, key,
 * index, check and relation with the Fluent API. The column types are the ones the SQL output writes
 * for the chosen engine. EF Core writes its migrations from the model (`dotnet ef migrations add`), with
 * a snapshot a hand-written migration would lack, so none is written here. */

const NAMESPACE = 'Example.Data'

const PROVIDERS: Record<Dialect, string> = {
  sqlserver: 'Microsoft.EntityFrameworkCore.SqlServer',
  postgresql: 'Npgsql.EntityFrameworkCore.PostgreSQL',
  mysql: 'Pomelo.EntityFrameworkCore.MySql',
  mariadb: 'Pomelo.EntityFrameworkCore.MySql',
  sqlite: 'Microsoft.EntityFrameworkCore.Sqlite',
  oracle: 'Oracle.EntityFrameworkCore',
}

function csString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

const KEYWORDS = new Set(
  (
    'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum ' +
    'event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace ' +
    'new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof ' +
    'stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void ' +
    'volatile while'
  ).split(' '),
)

/** Property name: PascalCase, never the class's own name (C# forbids it). */
function propertyName(name: string, owner: string): string {
  const pascal = toPascalCase(name) || 'Value'
  const safe = KEYWORDS.has(pascal) ? `@${pascal}` : pascal
  return safe === owner ? `${safe}Value` : safe
}

function clrType(type: ColumnType, enums: PhysicalEnum[]): { type: string; reference: boolean } {
  switch (type.kind) {
    case 'raw':
    case 'json':
      return { type: 'string', reference: true }
    case 'array': {
      const inner = clrType(type.items, enums)
      return { type: `List<${inner.type}>`, reference: true }
    }
    case 'enum': {
      const item = enums.find((candidate) => candidate.name === type.name)
      if (item && (item.storage === 'check' || item.storage === 'native') && !item.values.some((value) => typeof value === 'number'))
        return { type: item.name, reference: false }
      return item?.values.every((value) => typeof value === 'number')
        ? { type: 'int', reference: false }
        : { type: 'string', reference: true }
    }
    case 'primitive':
      switch (type.name) {
        case 'string':
          return { type: 'string', reference: true }
        case 'integer':
          return { type: type.bits === 64 ? 'long' : type.bits === 8 || type.bits === 16 ? 'short' : 'int', reference: false }
        case 'float':
          return { type: type.bits === 32 ? 'float' : 'double', reference: false }
        case 'decimal':
          return { type: 'decimal', reference: false }
        case 'boolean':
          return { type: 'bool', reference: false }
        case 'date':
          return { type: 'DateOnly', reference: false }
        case 'datetime':
          return { type: 'DateTimeOffset', reference: false }
        case 'time':
          return { type: 'TimeOnly', reference: false }
        case 'duration':
          return { type: 'TimeSpan', reference: false }
        case 'uuid':
          return { type: 'Guid', reference: false }
        case 'binary':
          return { type: 'byte[]', reference: true }
        case 'any':
          return { type: 'string', reference: true }
      }
  }
}

function literal(value: Literal, column: Column, clr: string, enums: PhysicalEnum[]): string | null {
  if (value === null) return null
  const item =
    column.type.kind === 'enum' ? enums.find((candidate) => candidate.name === (column.type as { name: string }).name) : undefined
  if (item && clr === item.name) {
    const stored = item.values.find((candidate) => String(candidate).toLowerCase() === String(value).toLowerCase())
    return stored === undefined ? null : `${item.name}.${enumMemberName(String(stored))}`
  }
  if (typeof value === 'boolean') return clr === 'bool' ? String(value) : null
  if (typeof value === 'number') {
    if (clr === 'decimal') return `${value}m`
    if (clr === 'float') return `${value}f`
    if (clr === 'long') return `${value}L`
    if (clr === 'double') return Number.isInteger(value) ? `${value}.0` : String(value)
    return clr === 'int' || clr === 'short' ? String(value) : null
  }
  return clr === 'string' ? csString(value) : null
}

function enumMemberName(value: string): string {
  const pascal = toPascalCase(value).replace(/\W/g, '')
  return /^\d/.test(pascal) || pascal === '' ? `Value${pascal}` : pascal
}

/** The C# enums and how their members are stored (`Paid` ⇄ `paid`). */
function enumBlock(item: PhysicalEnum, context: WriteContext): string[] {
  const members = enumMembers(item, context.schema)
  const names = members.map((member) => enumMemberName(String(member.value)))
  return [
    `public enum ${item.name}`,
    '{',
    ...names.map((name) => `    ${name},`),
    '}',
    '',
    `/// <summary>The values of <see cref="${item.name}"/> as the database stores them.</summary>`,
    `public static class ${item.name}Values`,
    '{',
    `    public static string ToValue(${item.name} value) => value switch`,
    '    {',
    ...members.map((member, i) => `        ${item.name}.${names[i]} => ${csString(String(member.value))},`),
    `        _ => throw new ArgumentOutOfRangeException(nameof(value)),`,
    '    };',
    '',
    `    public static ${item.name} FromValue(string value) => value switch`,
    '    {',
    ...members.map((member, i) => `        ${csString(String(member.value))} => ${item.name}.${names[i]},`),
    `        _ => throw new ArgumentOutOfRangeException(nameof(value)),`,
    '    };',
    '}',
  ]
}

function entityBlock(item: EntityClass, view: EntityView): string[] {
  const lines: string[] = []
  for (const todo of item.table.todos) lines.push(`// ${todoText(todo, item.table.model, 'table')}`)
  lines.push(`public class ${item.name}`, '{')
  for (const attribute of item.attributes) {
    const clr = clrType(attribute.column.type, view.enums)
    const nullable = attribute.column.nullable ? '?' : ''
    let initializer = clr.reference && !attribute.column.nullable ? ' = null!;' : ''
    if (attribute.column.defaultValue !== undefined && attribute.column.defaultValue !== null) {
      const value = literal(attribute.column.defaultValue, attribute.column, clr.type, view.enums)
      if (value) initializer = ` = ${value};`
    }
    lines.push(`    public ${clr.type}${nullable} ${propertyName(attribute.name, item.name)} { get; set; }${initializer}`)
  }
  for (const navigation of item.navigations) {
    const name = propertyName(navigation.name, item.name)
    if (navigation.kind === 'manyToOne')
      lines.push(
        `    public ${navigation.target}${navigation.nullable ? '?' : ''} ${name} { get; set; }${navigation.nullable ? '' : ' = null!;'}`,
      )
    else lines.push(`    public List<${navigation.target}> ${name} { get; set; } = new();`)
  }
  lines.push('}')
  return lines
}

function configuration(item: EntityClass, view: EntityView, engine: Dialect): string[] {
  const lines: string[] = []
  const prop = (attribute: Attribute) => `e => e.${propertyName(attribute.name, item.name)}`
  const byColumn = (column: string) => item.attributes.find((attribute) => attribute.column.name === column)!
  const checks = item.table.checks.map((check) => {
    const values = check.values.map((value) => (typeof value === 'number' ? value : `'${String(value).replace(/'/g, "''")}'`)).join(', ')
    return `t.HasCheckConstraint(${csString(check.name)}, ${csString(`${check.column} IN (${values})`)})`
  })
  lines.push(`modelBuilder.Entity<${item.name}>(entity =>`, '{')
  lines.push(
    checks.length > 0
      ? `    entity.ToTable(${csString(item.table.name)}, t => { ${checks.join('; ')}; });`
      : `    entity.ToTable(${csString(item.table.name)});`,
  )
  const key = item.table.primaryKey.map((column) => propertyName(byColumn(column).name, item.name))
  if (key.length === 1) lines.push(`    entity.HasKey(e => e.${key[0]}).HasName(${csString(`pk_${item.table.name}`)});`)
  else if (key.length > 1)
    lines.push(
      `    entity.HasKey(e => new { ${key.map((name) => `e.${name}`).join(', ')} }).HasName(${csString(`pk_${item.table.name}`)});`,
    )
  else lines.push('    entity.HasNoKey();')
  for (const attribute of item.attributes) {
    const { column } = attribute
    const settings = [
      `.HasColumnName(${csString(column.name)})`,
      `.HasColumnType(${csString(sqlColumnType(column.type, engine, view.enums))})`,
    ]
    if (!column.nullable) settings.push('.IsRequired()')
    if (attribute.primaryKey)
      settings.push(column.generated === 'identity' || column.generated === 'uuid' ? '.ValueGeneratedOnAdd()' : '.ValueGeneratedNever()')
    if (column.generated === 'now') settings.push('.HasDefaultValueSql("CURRENT_TIMESTAMP")')
    const clr = clrType(column.type, view.enums)
    if (column.defaultValue !== undefined && column.defaultValue !== null) {
      const value = literal(column.defaultValue, column, clr.type, view.enums)
      if (value) settings.push(`.HasDefaultValue(${value})`)
    }
    const enumItem = attribute.enum
    if (enumItem && clr.type === enumItem.name)
      settings.push(`.HasConversion(v => ${enumItem.name}Values.ToValue(v), v => ${enumItem.name}Values.FromValue(v))`)
    lines.push(`    entity.Property(${prop(attribute)})${settings.join('')};`)
  }
  for (const unique of item.table.uniques)
    lines.push(
      `    entity.HasIndex(e => new { ${unique.columns.map((column) => `e.${propertyName(byColumn(column).name, item.name)}`).join(', ')} }).IsUnique().HasDatabaseName(${csString(unique.name)});`,
    )
  for (const index of item.table.indexes)
    lines.push(
      `    entity.HasIndex(e => new { ${index.columns.map((column) => `e.${propertyName(byColumn(column).name, item.name)}`).join(', ')} })${index.unique ? '.IsUnique()' : ''}.HasDatabaseName(${csString(index.name)});`,
    )
  for (const navigation of item.navigations) {
    if (navigation.kind === 'manyToOne') {
      const attribute = item.attributes.find((candidate) => candidate.name === navigation.attribute)!
      const fk = attribute.foreignKey!
      const target = view.classes.find((candidate) => candidate.name === navigation.target)!
      const withMany = navigation.inverse ? `.WithMany(p => p.${propertyName(navigation.inverse, target.name)})` : '.WithMany()'
      const reference = target.attributes.find((candidate) => candidate.column.name === fk.references[0])!
      const principal = reference.primaryKey ? '' : `.HasPrincipalKey(p => p.${propertyName(reference.name, target.name)})`
      const onDelete = fk.onDelete === 'cascade' ? 'Cascade' : fk.onDelete === 'set null' ? 'SetNull' : 'Restrict'
      lines.push(
        `    entity.HasOne(e => e.${propertyName(navigation.name, item.name)})${withMany}.HasForeignKey(e => e.${propertyName(attribute.name, item.name)})${principal}.HasConstraintName(${csString(fk.name)}).OnDelete(DeleteBehavior.${onDelete});`,
      )
    }
    if (
      navigation.kind === 'manyToMany' &&
      navigation.join &&
      navigation.join.ownerColumn === navigation.join.table.foreignKeys[0].columns[0]
    ) {
      const join = navigation.join
      const target = view.classes.find((candidate) => candidate.name === navigation.target)!
      const withMany = navigation.inverse ? `.WithMany(p => p.${propertyName(navigation.inverse, target.name)})` : '.WithMany()'
      const [first, second] = join.table.foreignKeys
      lines.push(
        `    entity.HasMany(e => e.${propertyName(navigation.name, item.name)})${withMany}.UsingEntity<Dictionary<string, object>>(`,
        `        ${csString(join.table.name)},`,
        `        r => r.HasOne<${target.name}>().WithMany().HasForeignKey(${csString(second.columns[0])}).HasConstraintName(${csString(second.name)}).OnDelete(DeleteBehavior.Cascade),`,
        `        l => l.HasOne<${item.name}>().WithMany().HasForeignKey(${csString(first.columns[0])}).HasConstraintName(${csString(first.name)}).OnDelete(DeleteBehavior.Cascade),`,
        `        j => { j.ToTable(${csString(join.table.name)}); j.HasKey(${csString(first.columns[0])}, ${csString(second.columns[0])}).HasName(${csString(`pk_${join.table.name}`)}); });`,
      )
    }
  }
  lines.push('});')
  return lines
}

function contextName(title: string): string {
  return `${toPascalCase(title)}DbContext`
}

function modelsFile(view: EntityView, context: WriteContext): string {
  const body: string[] = []
  for (const item of view.enums) {
    if ((item.storage === 'check' || item.storage === 'native') && !item.values.some((value) => typeof value === 'number'))
      body.push('', ...enumBlock(item, context))
  }
  for (const item of view.classes) body.push('', ...entityBlock(item, view))
  return [
    `// Entities written by Model2DB from ${context.title}. Review them before using them.`,
    'using System;',
    'using System.Collections.Generic;',
    '',
    `namespace ${NAMESPACE};`,
    ...body,
    '',
  ].join('\n')
}

function contextFile(view: EntityView, engine: Dialect, context: WriteContext): string {
  const name = contextName(context.title)
  const sets = view.classes.map((item) => `    public DbSet<${item.name}> ${propertyName(item.table.name, name)} => Set<${item.name}>();`)
  const config = view.classes.flatMap((item) => ['', ...configuration(item, view, engine).map((line) => `        ${line}`)])
  return [
    `// DbContext written by Model2DB from ${context.title}, for ${PROVIDERS[engine]}.`,
    '// Create the database with `dotnet ef migrations add InitialCreate` and `dotnet ef database update`.',
    'using System.Collections.Generic;',
    'using Microsoft.EntityFrameworkCore;',
    '',
    `namespace ${NAMESPACE};`,
    '',
    `public class ${name}(DbContextOptions<${name}> options) : DbContext(options)`,
    '{',
    ...sets,
    '',
    '    protected override void OnModelCreating(ModelBuilder modelBuilder)',
    '    {',
    ...config.slice(1),
    '    }',
    '}',
    '',
  ].join('\n')
}

export const efCoreOutput: RelationalWriter = {
  id: 'efcore',
  label: 'Entity Framework Core',
  group: 'csharp',
  engines: ['sqlserver', 'postgresql', 'mysql', 'mariadb', 'sqlite', 'oracle'],
  write(physical, context): GeneratedFile[] {
    const engine = context.settings.engine
    const view = buildEntities(physical, context.schema, 'camelCase')
    const title = toPascalCase(context.title)
    return [
      { name: `Data/${title}Entities.cs`, content: modelsFile(view, context), editorLanguage: 'csharp' },
      { name: `Data/${contextName(context.title)}.cs`, content: contextFile(view, engine, context), editorLanguage: 'csharp' },
    ]
  },
}
