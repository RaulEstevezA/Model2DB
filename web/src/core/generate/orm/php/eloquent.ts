import { schemaStatements } from '../../sql/statements.ts'
import { todoText } from '../../todos.ts'
import { fileBase, type GeneratedFile, type RelationalWriter, type WriteContext } from '../../types.ts'
import type { RelationalSchema } from '../../../physical/types.ts'
import { buildEntities, type EntityClass, type EntityView } from '../entities.ts'
import { backedEnum, isBackedEnum, phpString, sqlLiteral } from './php.ts'

/** Laravel Eloquent models, and a migration that runs the schema written for the chosen engine. */

/** Eloquent's cast of a column, when its value is not plain text. */
function cast(column: EntityClass['attributes'][number]['column'], view: EntityView): string | null {
  const type = column.type
  if (type.kind === 'enum') {
    const enumItem = view.enums.find((candidate) => candidate.name === type.name)
    return enumItem && isBackedEnum(enumItem) ? `${enumItem.name}::class` : null
  }
  if (type.kind === 'json' || type.kind === 'array') return "'array'"
  if (type.kind !== 'primitive') return null
  switch (type.name) {
    case 'integer':
      return "'integer'"
    case 'float':
      return "'float'"
    case 'decimal':
      return `'decimal:${type.scale ?? 2}'`
    case 'boolean':
      return "'boolean'"
    case 'date':
      return "'immutable_date'"
    case 'datetime':
      return "'immutable_datetime'"
    case 'any':
      return "'array'"
    default:
      return null
  }
}

function modelFile(item: EntityClass, view: EntityView, context: WriteContext): string {
  const imports = new Set(['Illuminate\\Database\\Eloquent\\Model'])
  const lines: string[] = []
  const key = item.table.primaryKey
  const keyAttribute = key.length === 1 ? item.attributes.find((attribute) => attribute.column.name === key[0]) : undefined
  lines.push(`    protected $table = ${phpString(item.table.name)};`, '')
  if (keyAttribute) {
    lines.push(`    protected $primaryKey = ${phpString(keyAttribute.column.name)};`)
    const numeric = keyAttribute.column.type.kind === 'primitive' && keyAttribute.column.type.name === 'integer'
    if (keyAttribute.column.generated !== 'identity') lines.push('    public $incrementing = false;')
    if (!numeric) lines.push("    protected $keyType = 'string';")
  } else {
    // Eloquent has no composite keys: rows are created and read here, changed through their owner
    lines.push('    protected $primaryKey = null;', '    public $incrementing = false;')
    context.note({ code: 'compositeKeyReadOnly', params: { orm: 'Laravel Eloquent', table: item.table.name } })
  }
  lines.push('    public $timestamps = false;', '')
  const fillable = item.attributes
    .filter((attribute) => attribute.column.generated !== 'identity')
    .map((attribute) => phpString(attribute.column.name))
  lines.push(`    protected $fillable = [${fillable.join(', ')}];`)
  const casts = item.attributes
    .map((attribute) => {
      const value = cast(attribute.column, view)
      return value ? `            ${phpString(attribute.column.name)} => ${value},` : null
    })
    .filter((line): line is string => line !== null)
  if (casts.length > 0) {
    for (const attribute of item.attributes) {
      const enumItem = attribute.enum
      if (enumItem && isBackedEnum(enumItem)) imports.add(`App\\Enums\\${enumItem.name}`)
    }
    lines.push('', '    protected function casts(): array', '    {', '        return [', ...casts, '        ];', '    }')
  }
  for (const navigation of item.navigations) {
    const target = view.classes.find((candidate) => candidate.name === navigation.target)!
    let body: string
    let relation: string
    if (navigation.kind === 'manyToOne') {
      const attribute = item.attributes.find((candidate) => candidate.name === navigation.attribute)!
      relation = 'BelongsTo'
      body = `$this->belongsTo(${target.name}::class, ${phpString(attribute.column.name)}, ${phpString(attribute.foreignKey!.references[0])})`
    } else if (navigation.kind === 'oneToMany') {
      const attribute = target.attributes.find((candidate) => candidate.name === navigation.attribute)!
      relation = 'HasMany'
      body = `$this->hasMany(${target.name}::class, ${phpString(attribute.column.name)}, ${phpString(attribute.foreignKey!.references[0])})`
    } else {
      const join = navigation.join!
      relation = 'BelongsToMany'
      body = `$this->belongsToMany(${target.name}::class, ${phpString(join.table.name)}, ${phpString(join.ownerColumn)}, ${phpString(join.targetColumn)})`
    }
    imports.add(`Illuminate\\Database\\Eloquent\\Relations\\${relation}`)
    lines.push('', `    public function ${navigation.name}(): ${relation}`, '    {', `        return ${body};`, '    }')
  }
  return [
    '<?php',
    '',
    'namespace App\\Models;',
    '',
    ...[...imports].sort().map((name) => `use ${name};`),
    '',
    `/** Model written by Model2DB from ${context.title}. Review it before using it. */`,
    ...item.table.todos.map((todo) => `// ${todoText(todo, item.table.model, 'table')}`),
    `class ${item.name} extends Model`,
    '{',
    ...lines,
    '}',
    '',
  ].join('\n')
}

function migrationFile(physical: RelationalSchema, context: WriteContext): string {
  const { up, down } = schemaStatements(physical, context.settings.engine, context.title)
  return [
    '<?php',
    '',
    'use Illuminate\\Database\\Migrations\\Migration;',
    'use Illuminate\\Support\\Facades\\DB;',
    '',
    `/** Migration written by Model2DB from ${context.title}: the schema as Model2DB writes it for this engine. */`,
    'return new class extends Migration',
    '{',
    '    public function up(): void',
    '    {',
    ...up.map((sql) => `        DB::statement(${sqlLiteral(sql, '            ')});`),
    '    }',
    '',
    '    public function down(): void',
    '    {',
    ...down.map((sql) => `        DB::statement(${phpString(sql)});`),
    '    }',
    '};',
    '',
  ].join('\n')
}

export const eloquentOutput: RelationalWriter = {
  id: 'eloquent',
  label: 'Laravel Eloquent',
  group: 'php',
  engines: ['mysql', 'mariadb', 'postgresql', 'sqlite', 'sqlserver'],
  migrations: true,
  write(physical, context): GeneratedFile[] {
    const view = buildEntities(physical, context.schema, 'camelCase')
    const files: GeneratedFile[] = []
    for (const item of view.enums)
      if (isBackedEnum(item))
        files.push({ name: `app/Enums/${item.name}.php`, content: backedEnum('App\\Enums', item.name, item.values), editorLanguage: 'php' })
    for (const item of view.classes)
      files.push({ name: `app/Models/${item.name}.php`, content: modelFile(item, view, context), editorLanguage: 'php' })
    if (context.settings.migrations)
      files.push({
        name: `database/migrations/2025_01_01_000000_create_${fileBase(context.title)}_schema.php`,
        content: migrationFile(physical, context),
        editorLanguage: 'php',
      })
    return files
  },
}
