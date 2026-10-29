import type { TypeRef } from '../../model/schema.ts'
import { todoText } from '../todos.ts'
import type { DocumentWriter, GeneratedFile, WriteContext } from '../types.ts'
import { buildDocumentView, type DocumentClass, type DocumentField } from './documents.ts'

/** Spring Data MongoDB documents, the classes embedded in them and a repository per collection.
 * References keep only the other document's id (`@DocumentReference`). Enum constants are the stored
 * values, which is what Spring Data writes. */

const PACKAGE = 'com.example.document'
const REPOSITORY_PACKAGE = 'com.example.repository'

function javaString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

const javaIdentifier = /^[A-Za-z_$][\w$]*$/

/** An enum whose stored values can be Java constants is written as an enum; otherwise as text. */
function enumWritable(field: DocumentField): boolean {
  return field.enum !== undefined && field.enum.values.every((value) => javaIdentifier.test(String(value.value ?? value.name)))
}

function valueType(field: DocumentField, imports: Set<string>): string {
  const type: TypeRef = field.type
  if (type.kind === 'enum') return enumWritable(field) ? type.name : 'String'
  if (type.kind !== 'primitive') return 'Object'
  switch (type.name) {
    case 'string':
    case 'time':
    case 'duration':
      return 'String'
    case 'integer':
      return type.bits === 64 ? 'Long' : 'Integer'
    case 'float':
      return 'Double'
    case 'decimal':
      imports.add('java.math.BigDecimal')
      return 'BigDecimal'
    case 'boolean':
      return 'Boolean'
    case 'date':
      imports.add('java.time.LocalDate')
      return 'LocalDate'
    case 'datetime':
      imports.add('java.time.Instant')
      return 'Instant'
    case 'uuid':
      imports.add('java.util.UUID')
      return 'UUID'
    case 'binary':
      return 'byte[]'
    case 'any':
      return 'Object'
  }
}

interface Member {
  annotations: string[]
  type: string
  name: string
  initial: string
}

function member(field: DocumentField, imports: Set<string>, annotations: Set<string>): Member {
  let type: string
  if (field.kind === 'embedded' || field.kind === 'reference') type = field.target!
  else if (field.kind === 'free') type = 'Object'
  else {
    type = valueType(field, imports)
    if (field.kind === 'map') {
      imports.add('java.util.Map')
      type = `Map<String, ${type}>`
    }
  }
  let initial = ''
  if (field.many) {
    imports.add('java.util.List').add('java.util.ArrayList')
    type = `List<${type}>`
    initial = ' = new ArrayList<>()'
  }
  const list: string[] = []
  if (field.id) {
    annotations.add('org.springframework.data.annotation.Id')
    list.push('@Id')
  } else if (field.stored !== field.field.name) {
    annotations.add('org.springframework.data.mongodb.core.mapping.Field')
    list.push(`@Field(${javaString(field.stored)})`)
  }
  if (field.kind === 'reference') {
    annotations.add('org.springframework.data.mongodb.core.mapping.DocumentReference')
    list.push('@DocumentReference(lazy = true)')
  }
  return { annotations: list, type, name: field.field.name, initial }
}

function classFile(item: DocumentClass, context: WriteContext): string {
  const imports = new Set<string>()
  const annotations = new Set<string>()
  const members = item.fields.map((field) => member(field, imports, annotations))
  if (item.objectId) {
    annotations.add('org.springframework.data.annotation.Id')
    members.unshift({ annotations: ['@Id'], type: 'String', name: 'id', initial: '' })
  }
  const head: string[] = []
  if (item.collection) {
    annotations.add('org.springframework.data.mongodb.core.mapping.Document')
    head.push(`@Document(collection = ${javaString(item.collection.name)})`)
    if (item.collection.indexes.length > 0) {
      annotations
        .add('org.springframework.data.mongodb.core.index.CompoundIndex')
        .add('org.springframework.data.mongodb.core.index.CompoundIndexes')
      const indexes = item.collection.indexes.map(
        (index) =>
          `@CompoundIndex(name = ${javaString(index.name)}, def = ${javaString(`{${index.columns.map((column) => `'${column}': 1`).join(', ')}}`)}${index.unique ? ', unique = true' : ''})`,
      )
      head.push(`@CompoundIndexes({ ${indexes.join(', ')} })`)
    }
  }
  const fields = members.map((item) =>
    [...item.annotations.map((line) => `    ${line}`), `    private ${item.type} ${item.name}${item.initial};`].join('\n'),
  )
  const accessors = members.map((item) => {
    const capital = item.name.charAt(0).toUpperCase() + item.name.slice(1)
    return `    public ${item.type} get${capital}() {\n        return ${item.name};\n    }\n\n    public void set${capital}(${item.type} ${item.name}) {\n        this.${item.name} = ${item.name};\n    }`
  })
  const allImports = [...[...annotations].sort(), ...[...imports].sort()]
  return [
    `package ${PACKAGE};`,
    '',
    ...allImports.map((name) => `import ${name};`),
    ...(allImports.length > 0 ? [''] : []),
    `/** ${item.collection ? 'Document' : 'Embedded value'} written by Model2DB from ${context.title}. Review it before using it. */`,
    ...item.todos.map((todo) => `// ${todoText(todo, item.name, 'collection')}`),
    ...head,
    `public class ${item.name} {`,
    fields.join('\n\n'),
    ...(accessors.length > 0 ? ['', accessors.join('\n\n')] : []),
    '}',
    '',
  ].join('\n')
}

function enumFile(name: string, values: (string | number)[]): string {
  return [`package ${PACKAGE};`, '', `public enum ${name} {`, `    ${values.map(String).join(',\n    ')}`, '}', ''].join('\n')
}

function repositoryFile(item: DocumentClass): string {
  const imports = new Set<string>()
  const id = item.fields.find((field) => field.id)
  const idType = id ? valueType(id, imports) : 'String'
  return [
    `package ${REPOSITORY_PACKAGE};`,
    '',
    `import ${PACKAGE}.${item.name};`,
    'import org.springframework.data.mongodb.repository.MongoRepository;',
    ...[...imports].map((name) => `import ${name};`),
    '',
    `public interface ${item.name}Repository extends MongoRepository<${item.name}, ${idType}> {}`,
    '',
  ].join('\n')
}

export const springDataMongoOutput: DocumentWriter = {
  id: 'spring-data-mongodb',
  label: 'Spring Data MongoDB',
  group: 'jvm',
  write: (physical, context): GeneratedFile[] => {
    const view = buildDocumentView(context.schema, context.design, physical, context.settings.naming)
    const path = (name: string, pkg = PACKAGE) => `src/main/java/${pkg.replace(/\./g, '/')}/${name}.java`
    const files: GeneratedFile[] = []
    for (const item of view.enums) {
      const values = item.values.map((value) => value.value ?? value.name)
      if (values.every((value) => javaIdentifier.test(String(value))))
        files.push({ name: path(item.name), content: enumFile(item.name, values), editorLanguage: 'java' })
    }
    for (const item of view.classes) files.push({ name: path(item.name), content: classFile(item, context), editorLanguage: 'java' })
    for (const item of view.classes)
      if (item.collection)
        files.push({ name: path(`${item.name}Repository`, REPOSITORY_PACKAGE), content: repositoryFile(item), editorLanguage: 'java' })
    return files
  },
}
