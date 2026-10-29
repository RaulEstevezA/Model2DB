import type { EnumChoice, KeyChoice, Reason, RelationChoice } from '../core/design/types.ts'
import type { OutputGroup } from '../core/generate/outputs.ts'
import type { Note } from '../core/physical/types.ts'
import type { ModelRole } from '../core/physical/roles.ts'
import type { ParseIssue } from '../core/parsers/types.ts'
import type { ExampleId } from '../examples/index.ts'

type Params = Record<string, string | number> | undefined
const p = (params: Params, key: string) => String(params?.[key] ?? '')

/** Number with the language's thousands separator. */
const number = (locale: string) => (value: number) => value.toLocaleString(locale)
const en$ = number('en')
const es$ = number('es')

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

/** What a relation option means, which depends on the kind of field. */
export type RelationShape = 'model' | 'models' | 'values' | 'map' | 'free'

const JSON_DETAIL_EN: Record<string, string> = {
  'json.unexpectedEnd': 'The JSON ends too early: something is not closed.',
  'json.unexpectedCharacter': 'Unexpected character.',
  'json.trailingComma': 'Comma before the end of a list or object: remove it.',
  'json.invalidNumber': 'Invalid number: JSON does not allow leading zeros or a dot without decimals.',
  'json.invalidEscape': 'Unknown escape sequence.',
  'json.controlCharacter': 'Line break or tab inside a text: write it as \\n or \\t.',
  'json.trailingContent': 'There is more text after the end of the JSON.',
  'json.tooDeep': 'The JSON is nested too deeply.',
  modelSchema: 'This model schema is not valid.',
}

const JSON_DETAIL_ES: Record<string, string> = {
  'json.unexpectedEnd': 'El JSON termina antes de tiempo: algo no está cerrado.',
  'json.unexpectedCharacter': 'Carácter inesperado.',
  'json.trailingComma': 'Coma antes del final de una lista u objeto: quítala.',
  'json.invalidNumber': 'Número no válido: JSON no admite ceros a la izquierda ni un punto sin decimales.',
  'json.invalidEscape': 'Secuencia de escape desconocida.',
  'json.controlCharacter': 'Salto de línea o tabulador dentro de un texto: escríbelo como \\n o \\t.',
  'json.trailingContent': 'Hay más texto después del final del JSON.',
  'json.tooDeep': 'El JSON tiene demasiados niveles.',
  modelSchema: 'Este esquema de modelos no es válido.',
}

const en = {
  tagline: 'Turn a data model into a database design you review before any code is written',
  introDescription:
    'Paste or open your models (classes, DTOs, JSON, schemas) or receive them from Mapper. Model2DB proposes tables, keys, relations, embedded documents and indexes, explains each proposal and waits for you where it is not sure. Then copy the schema for PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle or MongoDB.',
  privacyShort: 'Processed locally',
  privacyTitle: 'Your models stay with you',
  privacyPoints: [
    'What you paste or open never leaves your browser.',
    'Code is analyzed, never run, and the original is never changed.',
    'Nothing uncertain is applied until you decide.',
  ],
  examplesLabel: 'Try an example',
  examples: {
    store: 'Online shop',
    jpa: 'JPA entities',
    json: 'JSON response',
    prisma: 'Prisma to MongoDB',
  } satisfies Record<ExampleId, string>,
  exampleDescriptions: {
    store: 'TypeScript interfaces: references, value objects, lists and a many-to-many relation',
    jpa: 'Java entities whose annotations already declare keys and relations',
    json: 'An API response: every key, relation and type is inferred',
    prisma: 'A Prisma schema designed for MongoDB: embedded documents and references',
  } satisfies Record<ExampleId, string>,
  confirmReplace: 'This replaces your model and the decisions you made. Continue?',
  languageLabel: 'Language',
  license: 'MIT License',
  sourceCode: 'Source code',
  allTools: 'All tools',
  mapperNote: 'Two models that do not match yet? Relate them with Mapper first.',
  mapperLink: 'Open Mapper',
  api2classNote: 'Starting from a JSON response? Generate its classes with Api2Class.',
  api2classLink: 'Open Api2Class',
  workspaceTabs: 'Workspace',
  tabs: { input: 'Model', design: 'Design', result: 'Result' },

  // Input
  inputTitle: 'Model',
  inputLabel: 'Model to analyze',
  inputPlaceholder: 'Paste classes, DTOs, JSON or a schema here, or drop a file…',
  openFile: 'Open',
  clear: 'Clear',
  formatLabel: 'Format',
  formatAuto: (detected: string | null) => (detected ? `Detect (${detected})` : 'Detect automatically'),
  dropFile: 'Drop the file to open it',
  fileTooLarge: (name: string) => `“${name}” is larger than 10 MB.`,
  fileError: (name: string) => `“${name}” could not be read.`,
  receivedFrom: (tool: string) => `Model received from ${tool}.`,
  inputEmpty: 'Paste or open a model to start.',
  undetected: 'The format could not be detected: choose it in the list.',
  inputSummary: (format: string, models: number, fields: number) =>
    `${format} · ${en$(models)} ${plural(models, 'model', 'models')} · ${en$(fields)} ${plural(fields, 'field', 'fields')}`,
  warningsCount: (count: number) => `${en$(count)} ${plural(count, 'note', 'notes')}`,
  errorPosition: (line: number, column: number) => `Line ${en$(line)}, column ${en$(column)}`,
  parseIssue: (issue: ParseIssue): string => {
    const params = issue.params
    switch (issue.code) {
      case 'empty':
        return 'There is nothing to read.'
      case 'syntax':
        return params?.detail
          ? (JSON_DETAIL_EN[String(params.detail)] ?? String(params.detail)) + (params.path ? ` (${p(params, 'path')})` : '')
          : params?.message
            ? `It cannot be read as this format: ${p(params, 'message')}`
            : 'It cannot be read as this format.'
      case 'unexpectedToken':
        return `Unexpected “${p(params, 'token')}”.`
      case 'unterminatedString':
        return 'A text is not closed.'
      case 'unterminatedComment':
        return 'A comment is not closed.'
      case 'unclosedBlock':
        return 'A block is not closed: a “}” is missing.'
      case 'noModels':
        return 'No model was found. Check the format or paste the declarations.'
      case 'unknownType':
        return `“${p(params, 'type')}” is not declared here: it is treated as a value of any shape.`
      case 'mixedTypes':
        return `“${p(params, 'field')}” has values of different types.`
      case 'duplicateField':
        return `“${p(params, 'field')}” is declared twice.`
      case 'duplicateModel':
        return `“${p(params, 'model')}” is declared twice.`
      case 'emptyModel':
        return `“${p(params, 'model')}” has no fields.`
      case 'truncatedRows':
        return `Only the first ${p(params, 'count')} rows were read.`
    }
  },

  // Design
  designTitle: 'Design',
  designWaiting: 'The proposed design will appear here when the model can be read.',
  designFor: (database: string, kind: 'relational' | 'document') =>
    kind === 'relational' ? `Relational design for ${database}` : `Document design for ${database}`,
  designSummary: (stored: number, kind: 'relational' | 'document') =>
    kind === 'relational'
      ? `${en$(stored)} ${plural(stored, 'table', 'tables')} from the models`
      : `${en$(stored)} ${plural(stored, 'collection', 'collections')}`,
  pendingCount: (count: number) => `${en$(count)} ${plural(count, 'decision', 'decisions')} to review`,
  allDecided: 'Nothing left to review.',
  reviewSummary: (count: number) => `${en$(count)} ${plural(count, 'decision waits', 'decisions wait')} for you`,
  reviewHelp: 'They are not applied until you choose: the result leaves a TODO where each one goes.',
  undo: 'Undo',
  redo: 'Redo',
  undoTitle: 'Undo (Ctrl/Cmd+Z)',
  redoTitle: 'Redo (Ctrl/Cmd+Shift+Z)',
  reset: 'Reset',
  resetTitle: 'Go back to the proposed design, discarding your decisions',
  confirmReset: 'This discards every decision you made on the design. Continue?',
  accept: 'Accept',
  acceptTitle: (subject: string) => `Accept the suggestion for “${subject}”`,
  edit: 'Edit',
  editTitle: (field: string) => `Edit how “${field}” is stored`,
  tableName: 'Table name',
  collectionName: 'Collection name',
  key: 'Primary key',
  documentKey: '_id',
  includeModel: (model: string) => `Store “${model}”`,
  includeField: 'Store this field',
  columnName: 'Column name',
  propertyName: 'Property name',
  columnType: 'Type in the database',
  columnTypeHelp: 'Written as it is in the result, for every database. Leave it empty to use the derived type.',
  addIndex: 'Add an index',
  derived: 'derived',
  fieldHeader: 'Field',
  storageHeader: 'Stored as',
  statusHeader: 'State',
  notStored: 'not stored',
  primaryKey: 'primary key',
  enumsTitle: 'Enums',
  otherModelsTitle: 'Models without a table of their own',
  otherDocumentsTitle: 'Models without a collection of their own',
  role: {
    stored: 'Own table',
    embedded: 'Stored inside the models that use it',
    parent: 'Base class: its fields go into the models that extend it',
    excluded: 'Left out',
    pending: 'Waits for a decision on a field that uses it',
    unused: 'Nothing stored uses it',
  } satisfies Record<ModelRole, string>,
  documentRole: {
    stored: 'Own collection',
    embedded: 'Embedded in the documents that use it',
    parent: 'Base class: its fields go into the models that extend it',
    excluded: 'Left out',
    pending: 'Waits for a decision on a field that uses it',
    unused: 'Nothing stored uses it',
  } satisfies Record<ModelRole, string>,
  status: {
    exact: 'Exact',
    high: 'High',
    probable: 'Likely',
    review: 'Review',
    conflict: 'Conflict',
    none: 'No match',
    manual: 'Chosen',
  },
  subjects: {
    key: (model: string) => `key of ${model}`,
    field: (model: string, field: string) => `${model}.${field}`,
    unique: (model: string, field: string) => `unique ${model}.${field}`,
    enum: (name: string) => `enum ${name}`,
  },
  relationOption: (choice: RelationChoice, shape: RelationShape): string => {
    switch (choice) {
      case 'reference':
        return shape === 'models' ? 'References (_id list)' : 'Foreign key (many-to-one)'
      case 'flatten':
        return 'Columns in this table'
      case 'child':
        return shape === 'models' ? 'Child table (one-to-many)' : shape === 'map' ? 'Key-value table' : 'Table of values'
      case 'join':
        return 'Join table (many-to-many)'
      case 'array':
        return 'Array column (PostgreSQL)'
      case 'json':
        return 'JSON column'
      case 'embed':
        return 'Embedded'
    }
  },
  documentReference: (many: boolean): string => (many ? 'References (list of _id)' : 'Reference (_id)'),
  keyOption: (choice: KeyChoice): string =>
    choice.kind === 'field'
      ? `Field “${choice.field}”`
      : choice.type === 'integer'
        ? 'New key: auto-increment number'
        : choice.type === 'uuid'
          ? 'New key: UUID'
          : 'MongoDB ObjectId',
  enumOption: {
    check: 'Text with a CHECK constraint',
    native: 'Enum type of the database',
    lookup: 'Lookup table',
    text: 'Plain text, no constraint',
  } satisfies Record<EnumChoice, string>,
  uniqueOption: (value: boolean): string => (value ? 'Unique' : 'Not unique'),
  foreignKeyOption: (model: string | null) => (model ? `Foreign key to “${model}”` : 'Plain column'),
  reason: (reason: Reason): string => {
    const params = reason.params
    switch (reason.code) {
      case 'keyDeclared':
        return `The input marks “${p(params, 'field')}” as the primary key.`
      case 'keyNamed':
        return `“${p(params, 'field')}” is named like an identifier.`
      case 'keyCandidates':
        return `“${p(params, 'fields')}” could identify each row, but that is not certain. A new key is suggested; choose the field if it never repeats or changes.`
      case 'keyMissing':
        return 'No field identifies each row: a new key is added.'
      case 'keyMongo':
        return 'MongoDB gives every document an _id.'
      case 'relationDeclared':
        return 'Declared in the input.'
      case 'selfReference':
        return 'The model refers to itself.'
      case 'targetHasKey':
        return `“${p(params, 'model')}” has its own key: it is stored once and referred to.`
      case 'valueObject':
        return `“${p(params, 'model')}” has no key: it is a value that belongs to this model.`
      case 'notFlattenable':
        return `“${p(params, 'model')}” has no key and holds lists, so it cannot become columns. Choose how to store it.`
      case 'backReference':
        return `“${p(params, 'model')}.${p(params, 'field')}” already points back to this model.`
      case 'bothSidesLists':
        return `“${p(params, 'model')}.${p(params, 'field')}” lists this model too: each side can have many of the other.`
      case 'sharedTarget':
        return p(params, 'users')
          ? `“${p(params, 'model')}” is also used by ${p(params, 'users')}. Decide whether each one keeps its own copy or they share it.`
          : `“${p(params, 'model')}” is also stored on its own. Decide whether to keep a copy here or refer to it.`
      case 'ownedList':
        return `“${p(params, 'model')}” only appears here: its rows belong to this model.`
      case 'primitiveList':
        return 'A list of plain values: a table with one row per value keeps them searchable.'
      case 'freeShape':
        return p(params, 'type')
          ? `“${p(params, 'type')}” has no fixed shape here: stored as JSON. Write a type in Edit if you know it.`
          : 'Its shape is not fixed: stored as JSON.'
      case 'mapOfValues':
        return 'Keys chosen at run time: JSON keeps them as they are.'
      case 'recursiveEmbed':
        return `“${p(params, 'model')}” leads back to this model: embedding it would never end, so it is referred to.`
      case 'unboundedList':
        return `Embedded and read with its document. If the list can grow without limit, refer to “${p(params, 'model')}” instead.`
      case 'targetExcluded':
        return `“${p(params, 'model')}” is left out.`
      case 'foreignKeyNamed':
        return `Named after “${p(params, 'model')}”: it most likely holds its key.`
      case 'uniqueDeclared':
        return 'Declared unique in the input.'
      case 'uniqueNamed':
        return `“${p(params, 'field')}” is usually unique. Confirm it if two rows can never share it.`
      case 'enumCheck':
        return 'A CHECK constraint keeps the allowed values without a type of its own and is easy to change.'
      case 'enumDocument':
        return 'The validator lists the allowed values.'
      case 'parentOnly':
        return 'Only used as a base class.'
      case 'manual':
        return 'Chosen by you.'
    }
  },

  // Result
  resultTitle: 'Result',
  databaseLabel: 'Database',
  outputGroups: {
    relational: 'Relational SQL',
    document: 'Documents',
    python: 'Python',
    typescript: 'TypeScript / JavaScript',
    jvm: 'Java / Kotlin',
    csharp: 'C#',
    php: 'PHP',
  } satisfies Record<OutputGroup, string>,
  engineLabel: 'Database engine',
  includeMigration: 'Include the migration',
  filesLabel: 'Files',
  downloadZip: (count: number) => `Download .zip (${en$(count)} files)`,
  tablesNaming: 'Table names',
  collectionsNaming: 'Collection names',
  tablesNamingOption: { plural: 'Plural (order_lines)', singular: 'Singular (order_line)', model: 'As the model (OrderLine)' },
  collectionsNamingOption: { plural: 'Plural (order_lines)', singular: 'Singular (order_line)', model: 'As the model (OrderLine)' },
  columnsNaming: 'Column names',
  propertiesNaming: 'Property names',
  columnsNamingOption: { snake: 'snake_case (created_at)', field: 'As the field (createdAt)' },
  stringsLabel: 'Text without a length',
  stringsOption: { auto: 'Database default', varchar: 'VARCHAR(255)', text: 'TEXT' },
  resultEmpty: 'The schema will appear here.',
  resultLabel: (database: string) => `${database} schema generated`,
  copy: 'Copy',
  copied: 'Copied',
  download: 'Download',
  pendingInResult: (count: number) => `${en$(count)} ${plural(count, 'TODO', 'TODOs')} for pending decisions`,
  notesCount: (count: number) => `${en$(count)} ${plural(count, 'note', 'notes')}`,
  note: (note: Note): string => {
    const params = note.params
    switch (note.code) {
      case 'arrayAsJson':
        return `“${p(params, 'field')}” is stored as JSON: only PostgreSQL has array columns.`
      case 'nativeEnumAsCheck':
        return `“${p(params, 'enum')}” uses a CHECK constraint: this database has no enum types.`
      case 'defaultPrecision':
        return `${p(params, 'fields')}: the input does not give a precision, so DECIMAL(${p(params, 'precision')}) is used. Check it.`
      case 'inheritedFields':
        return `“${p(params, 'model')}” includes the fields of ${p(params, 'parents')}.`
      case 'cycleEmbedded':
        return `“${p(params, 'model')}” contains itself: the inner copy is stored as a plain object.`
      case 'renamedReserved':
        return `“${p(params, 'name')}” is a reserved word and is quoted.`
      case 'compositeKeyAsId':
        return `${p(params, 'orm')} has no composite primary keys: “${p(params, 'table')}” gets an id column, and ${p(params, 'columns')} stay unique together.`
      case 'enumCheckedInCode':
        return `${p(params, 'orm')} checks the values of “${p(params, 'enum')}” in the application: the database does not restrict them.`
      case 'ormEnumType':
        return `${p(params, 'orm')} stores “${p(params, 'enum')}” with an enum type of the database, not with a CHECK constraint.`
      case 'enumNeedsCast':
        return `${p(params, 'orm')} sends “${p(params, 'enum')}” as text, and PostgreSQL does not cast it to its enum type: choose a CHECK constraint, or Hibernate.`
      case 'compositeKeyReadOnly':
        return `${p(params, 'orm')} has no composite keys: rows of “${p(params, 'table')}” are created and read with their model, and changed through their owner.`
    }
  },
}

export type Messages = typeof en

const es: Messages = {
  tagline: 'Convierte un modelo de datos en un diseño de base de datos que revisas antes de generar código',
  introDescription:
    'Pega o abre tus modelos (clases, DTOs, JSON, esquemas) o recíbelos de Mapper. Model2DB propone tablas, claves, relaciones, documentos embebidos e índices, explica cada propuesta y te espera donde no está seguro. Después copia el esquema para PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle o MongoDB.',
  privacyShort: 'Procesado en local',
  privacyTitle: 'Tus modelos no salen de aquí',
  privacyPoints: [
    'Lo que pegas o abres no sale de tu navegador.',
    'El código se analiza, nunca se ejecuta, y el original no se modifica.',
    'Nada dudoso se aplica hasta que decides.',
  ],
  examplesLabel: 'Prueba un ejemplo',
  examples: {
    store: 'Tienda online',
    jpa: 'Entidades JPA',
    json: 'Respuesta JSON',
    prisma: 'Prisma a MongoDB',
  },
  exampleDescriptions: {
    store: 'Interfaces de TypeScript: referencias, objetos de valor, listas y una relación muchos a muchos',
    jpa: 'Entidades de Java cuyas anotaciones ya declaran claves y relaciones',
    json: 'Una respuesta de API: todas las claves, relaciones y tipos se deducen',
    prisma: 'Un esquema de Prisma diseñado para MongoDB: documentos embebidos y referencias',
  },
  confirmReplace: 'Se sustituirán tu modelo y las decisiones que has tomado. ¿Continuar?',
  languageLabel: 'Idioma',
  license: 'Licencia MIT',
  sourceCode: 'Código fuente',
  allTools: 'Todas las herramientas',
  mapperNote: '¿Dos modelos que todavía no encajan? Relaciónalos antes con Mapper.',
  mapperLink: 'Abrir Mapper',
  api2classNote: '¿Partes de una respuesta JSON? Genera sus clases con Api2Class.',
  api2classLink: 'Abrir Api2Class',
  workspaceTabs: 'Área de trabajo',
  tabs: { input: 'Modelo', design: 'Diseño', result: 'Resultado' },

  inputTitle: 'Modelo',
  inputLabel: 'Modelo para analizar',
  inputPlaceholder: 'Pega aquí clases, DTOs, JSON o un esquema, o suelta un archivo…',
  openFile: 'Abrir',
  clear: 'Limpiar',
  formatLabel: 'Formato',
  formatAuto: (detected) => (detected ? `Detectar (${detected})` : 'Detectar automáticamente'),
  dropFile: 'Suelta el archivo para abrirlo',
  fileTooLarge: (name) => `«${name}» supera los 10 MB.`,
  fileError: (name) => `«${name}» no se ha podido leer.`,
  receivedFrom: (tool) => `Modelo recibido de ${tool}.`,
  inputEmpty: 'Pega o abre un modelo para empezar.',
  undetected: 'No se ha podido detectar el formato: elígelo en la lista.',
  inputSummary: (format, models, fields) =>
    `${format} · ${es$(models)} ${plural(models, 'modelo', 'modelos')} · ${es$(fields)} ${plural(fields, 'campo', 'campos')}`,
  warningsCount: (count) => `${es$(count)} ${plural(count, 'nota', 'notas')}`,
  errorPosition: (line, column) => `Línea ${es$(line)}, columna ${es$(column)}`,
  parseIssue: (issue) => {
    const params = issue.params
    switch (issue.code) {
      case 'empty':
        return 'No hay nada que leer.'
      case 'syntax':
        return params?.detail
          ? (JSON_DETAIL_ES[String(params.detail)] ?? String(params.detail)) + (params.path ? ` (${p(params, 'path')})` : '')
          : params?.message
            ? `No se puede leer con este formato: ${p(params, 'message')}`
            : 'No se puede leer con este formato.'
      case 'unexpectedToken':
        return `No se esperaba «${p(params, 'token')}».`
      case 'unterminatedString':
        return 'Hay un texto sin cerrar.'
      case 'unterminatedComment':
        return 'Hay un comentario sin cerrar.'
      case 'unclosedBlock':
        return 'Hay un bloque sin cerrar: falta una «}».'
      case 'noModels':
        return 'No se ha encontrado ningún modelo. Revisa el formato o pega las declaraciones.'
      case 'unknownType':
        return `«${p(params, 'type')}» no está declarado aquí: se trata como un valor de cualquier forma.`
      case 'mixedTypes':
        return `«${p(params, 'field')}» tiene valores de tipos distintos.`
      case 'duplicateField':
        return `«${p(params, 'field')}» está declarado dos veces.`
      case 'duplicateModel':
        return `«${p(params, 'model')}» está declarado dos veces.`
      case 'emptyModel':
        return `«${p(params, 'model')}» no tiene campos.`
      case 'truncatedRows':
        return `Solo se han leído las primeras ${p(params, 'count')} filas.`
    }
  },

  designTitle: 'Diseño',
  designWaiting: 'El diseño propuesto aparecerá aquí cuando se pueda leer el modelo.',
  designFor: (database, kind) => (kind === 'relational' ? `Diseño relacional para ${database}` : `Diseño de documentos para ${database}`),
  designSummary: (stored, kind) =>
    kind === 'relational'
      ? `${es$(stored)} ${plural(stored, 'tabla', 'tablas')} a partir de los modelos`
      : `${es$(stored)} ${plural(stored, 'colección', 'colecciones')}`,
  pendingCount: (count) => `${es$(count)} ${plural(count, 'decisión', 'decisiones')} para revisar`,
  allDecided: 'No queda nada por revisar.',
  reviewSummary: (count) => `${es$(count)} ${plural(count, 'decisión te espera', 'decisiones te esperan')}`,
  reviewHelp: 'No se aplican hasta que eliges: el resultado deja un TODO donde va cada una.',
  undo: 'Deshacer',
  redo: 'Rehacer',
  undoTitle: 'Deshacer (Ctrl/Cmd+Z)',
  redoTitle: 'Rehacer (Ctrl/Cmd+Mayús+Z)',
  reset: 'Restablecer',
  resetTitle: 'Volver al diseño propuesto y descartar tus decisiones',
  confirmReset: 'Se descartarán todas las decisiones que has tomado en el diseño. ¿Continuar?',
  accept: 'Aceptar',
  acceptTitle: (subject) => `Aceptar la sugerencia para «${subject}»`,
  edit: 'Editar',
  editTitle: (field) => `Editar cómo se guarda «${field}»`,
  tableName: 'Nombre de la tabla',
  collectionName: 'Nombre de la colección',
  key: 'Clave primaria',
  documentKey: '_id',
  includeModel: (model) => `Guardar «${model}»`,
  includeField: 'Guardar este campo',
  columnName: 'Nombre de la columna',
  propertyName: 'Nombre de la propiedad',
  columnType: 'Tipo en la base de datos',
  columnTypeHelp: 'Se escribe tal cual en el resultado, para cualquier base de datos. Déjalo vacío para usar el tipo deducido.',
  addIndex: 'Añadir un índice',
  derived: 'deducido',
  fieldHeader: 'Campo',
  storageHeader: 'Se guarda como',
  statusHeader: 'Estado',
  notStored: 'no se guarda',
  primaryKey: 'clave primaria',
  enumsTitle: 'Enumeraciones',
  otherModelsTitle: 'Modelos sin tabla propia',
  otherDocumentsTitle: 'Modelos sin colección propia',
  role: {
    stored: 'Tabla propia',
    embedded: 'Se guarda dentro de los modelos que lo usan',
    parent: 'Clase base: sus campos van a los modelos que la heredan',
    excluded: 'Excluido',
    pending: 'Espera una decisión sobre un campo que lo usa',
    unused: 'Nada de lo que se guarda lo usa',
  },
  documentRole: {
    stored: 'Colección propia',
    embedded: 'Embebido en los documentos que lo usan',
    parent: 'Clase base: sus campos van a los modelos que la heredan',
    excluded: 'Excluido',
    pending: 'Espera una decisión sobre un campo que lo usa',
    unused: 'Nada de lo que se guarda lo usa',
  },
  status: {
    exact: 'Exacta',
    high: 'Alta',
    probable: 'Probable',
    review: 'Revisar',
    conflict: 'Conflicto',
    none: 'Sin coincidencia',
    manual: 'Elegida',
  },
  subjects: {
    key: (model) => `clave de ${model}`,
    field: (model, field) => `${model}.${field}`,
    unique: (model, field) => `única ${model}.${field}`,
    enum: (name) => `enumeración ${name}`,
  },
  relationOption: (choice, shape) => {
    switch (choice) {
      case 'reference':
        return shape === 'models' ? 'Referencias (lista de _id)' : 'Clave ajena (muchos a uno)'
      case 'flatten':
        return 'Columnas en esta tabla'
      case 'child':
        return shape === 'models' ? 'Tabla hija (uno a muchos)' : shape === 'map' ? 'Tabla clave-valor' : 'Tabla de valores'
      case 'join':
        return 'Tabla intermedia (muchos a muchos)'
      case 'array':
        return 'Columna array (PostgreSQL)'
      case 'json':
        return 'Columna JSON'
      case 'embed':
        return 'Embebido'
    }
  },
  documentReference: (many) => (many ? 'Referencias (lista de _id)' : 'Referencia (_id)'),
  keyOption: (choice) =>
    choice.kind === 'field'
      ? `Campo «${choice.field}»`
      : choice.type === 'integer'
        ? 'Clave nueva: número autoincremental'
        : choice.type === 'uuid'
          ? 'Clave nueva: UUID'
          : 'ObjectId de MongoDB',
  enumOption: {
    check: 'Texto con restricción CHECK',
    native: 'Tipo enumerado de la base de datos',
    lookup: 'Tabla de consulta',
    text: 'Texto sin restricción',
  },
  uniqueOption: (value) => (value ? 'Única' : 'No única'),
  foreignKeyOption: (model) => (model ? `Clave ajena a «${model}»` : 'Columna normal'),
  reason: (reason) => {
    const params = reason.params
    switch (reason.code) {
      case 'keyDeclared':
        return `La entrada marca «${p(params, 'field')}» como clave primaria.`
      case 'keyNamed':
        return `«${p(params, 'field')}» tiene nombre de identificador.`
      case 'keyCandidates':
        return `«${p(params, 'fields')}» podría identificar cada fila, pero no es seguro. Se sugiere una clave nueva; elige el campo si nunca se repite ni cambia.`
      case 'keyMissing':
        return 'Ningún campo identifica cada fila: se añade una clave nueva.'
      case 'keyMongo':
        return 'MongoDB da a cada documento un _id.'
      case 'relationDeclared':
        return 'Declarado en la entrada.'
      case 'selfReference':
        return 'El modelo se refiere a sí mismo.'
      case 'targetHasKey':
        return `«${p(params, 'model')}» tiene clave propia: se guarda una vez y se referencia.`
      case 'valueObject':
        return `«${p(params, 'model')}» no tiene clave: es un valor que pertenece a este modelo.`
      case 'notFlattenable':
        return `«${p(params, 'model')}» no tiene clave y contiene listas, así que no puede convertirse en columnas. Elige cómo guardarlo.`
      case 'backReference':
        return `«${p(params, 'model')}.${p(params, 'field')}» ya apunta a este modelo.`
      case 'bothSidesLists':
        return `«${p(params, 'model')}.${p(params, 'field')}» también lista este modelo: cada lado puede tener muchos del otro.`
      case 'sharedTarget':
        return p(params, 'users')
          ? `«${p(params, 'model')}» también lo usa ${p(params, 'users')}. Decide si cada uno guarda su propia copia o la comparten.`
          : `«${p(params, 'model')}» también se guarda por su cuenta. Decide si guardar aquí una copia o referenciarlo.`
      case 'ownedList':
        return `«${p(params, 'model')}» solo aparece aquí: sus filas pertenecen a este modelo.`
      case 'primitiveList':
        return 'Una lista de valores simples: una tabla con una fila por valor permite buscarlos.'
      case 'freeShape':
        return p(params, 'type')
          ? `«${p(params, 'type')}» no tiene una forma fija aquí: se guarda como JSON. Escribe un tipo en Editar si lo conoces.`
          : 'Su forma no es fija: se guarda como JSON.'
      case 'mapOfValues':
        return 'Las claves se deciden al usarlo: JSON las guarda tal cual.'
      case 'recursiveEmbed':
        return `«${p(params, 'model')}» lleva de vuelta a este modelo: embeberlo no terminaría nunca, así que se referencia.`
      case 'unboundedList':
        return `Embebido y leído con su documento. Si la lista puede crecer sin límite, referencia «${p(params, 'model')}».`
      case 'targetExcluded':
        return `«${p(params, 'model')}» está excluido.`
      case 'foreignKeyNamed':
        return `Lleva el nombre de «${p(params, 'model')}»: lo más probable es que guarde su clave.`
      case 'uniqueDeclared':
        return 'Declarado único en la entrada.'
      case 'uniqueNamed':
        return `«${p(params, 'field')}» suele ser único. Confírmalo si dos filas nunca pueden compartirlo.`
      case 'enumCheck':
        return 'Una restricción CHECK limita los valores sin un tipo propio y es fácil de cambiar.'
      case 'enumDocument':
        return 'El validador enumera los valores permitidos.'
      case 'parentOnly':
        return 'Solo se usa como clase base.'
      case 'manual':
        return 'Elegido por ti.'
    }
  },

  resultTitle: 'Resultado',
  databaseLabel: 'Base de datos',
  outputGroups: {
    relational: 'SQL relacional',
    document: 'Documentos',
    python: 'Python',
    typescript: 'TypeScript / JavaScript',
    jvm: 'Java / Kotlin',
    csharp: 'C#',
    php: 'PHP',
  },
  engineLabel: 'Motor de base de datos',
  includeMigration: 'Incluir la migración',
  filesLabel: 'Archivos',
  downloadZip: (count) => `Descargar .zip (${es$(count)} archivos)`,
  tablesNaming: 'Nombres de tabla',
  collectionsNaming: 'Nombres de colección',
  tablesNamingOption: { plural: 'Plural (order_lines)', singular: 'Singular (order_line)', model: 'Como el modelo (OrderLine)' },
  collectionsNamingOption: { plural: 'Plural (order_lines)', singular: 'Singular (order_line)', model: 'Como el modelo (OrderLine)' },
  columnsNaming: 'Nombres de columna',
  propertiesNaming: 'Nombres de propiedad',
  columnsNamingOption: { snake: 'snake_case (created_at)', field: 'Como el campo (createdAt)' },
  stringsLabel: 'Texto sin longitud',
  stringsOption: { auto: 'Según la base de datos', varchar: 'VARCHAR(255)', text: 'TEXT' },
  resultEmpty: 'El esquema aparecerá aquí.',
  resultLabel: (database) => `Esquema de ${database} generado`,
  copy: 'Copiar',
  copied: 'Copiado',
  download: 'Descargar',
  pendingInResult: (count) => `${es$(count)} ${plural(count, 'TODO', 'TODO')} por decisiones pendientes`,
  notesCount: (count) => `${es$(count)} ${plural(count, 'nota', 'notas')}`,
  note: (note) => {
    const params = note.params
    switch (note.code) {
      case 'arrayAsJson':
        return `«${p(params, 'field')}» se guarda como JSON: solo PostgreSQL tiene columnas array.`
      case 'nativeEnumAsCheck':
        return `«${p(params, 'enum')}» usa una restricción CHECK: esta base de datos no tiene tipos enumerados.`
      case 'defaultPrecision':
        return `${p(params, 'fields')}: la entrada no indica la precisión, así que se usa DECIMAL(${p(params, 'precision')}). Revísala.`
      case 'inheritedFields':
        return `«${p(params, 'model')}» incluye los campos de ${p(params, 'parents')}.`
      case 'cycleEmbedded':
        return `«${p(params, 'model')}» se contiene a sí mismo: la copia interior se guarda como un objeto sin validar.`
      case 'renamedReserved':
        return `«${p(params, 'name')}» es una palabra reservada y va entre comillas.`
      case 'compositeKeyAsId':
        return `${p(params, 'orm')} no admite claves primarias compuestas: «${p(params, 'table')}» recibe una columna id, y ${p(params, 'columns')} siguen siendo únicas juntas.`
      case 'enumCheckedInCode':
        return `${p(params, 'orm')} comprueba los valores de «${p(params, 'enum')}» en la aplicación: la base de datos no los restringe.`
      case 'ormEnumType':
        return `${p(params, 'orm')} guarda «${p(params, 'enum')}» con un tipo enumerado de la base de datos, no con una restricción CHECK.`
      case 'enumNeedsCast':
        return `${p(params, 'orm')} envía «${p(params, 'enum')}» como texto, y PostgreSQL no lo convierte a su tipo enumerado: elige una restricción CHECK, o Hibernate.`
      case 'compositeKeyReadOnly':
        return `${p(params, 'orm')} no admite claves compuestas: las filas de «${p(params, 'table')}» se crean y se leen con su modelo, y se cambian a través de su propietario.`
    }
  },
}

export const languages = ['en', 'es'] as const
export type Language = (typeof languages)[number]

export const messages: Record<Language, Messages> = { en, es }
