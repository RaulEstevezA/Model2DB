"""English and Spanish texts. Mirrors web/src/i18n/messages.ts for the texts both versions share; the desktop
says "this computer" where the web says "this browser", and "Save" where it says "Download"."""

from types import SimpleNamespace

from PySide6.QtCore import QLocale, QObject, QSettings, Signal

from ..core.js import js_string


def _en_number(value: int) -> str:
    return f"{value:,}"


def _es_number(value: int) -> str:
    # Spanish groups thousands only from five digits on: 1234, 12.345
    return f"{value:,}".replace(",", ".") if abs(value) >= 10000 else str(value)


def _p(params: dict | None, key: str) -> str:
    value = (params or {}).get(key)
    return "" if value is None else js_string(value)


def _plural(count, one: str, many: str) -> str:
    return one if count == 1 else many


_JSON_DETAIL_EN = {
    "json.unexpectedEnd": "The JSON ends too early: something is not closed.",
    "json.unexpectedCharacter": "Unexpected character.",
    "json.trailingComma": "Comma before the end of a list or object: remove it.",
    "json.invalidNumber": "Invalid number: JSON does not allow leading zeros or a dot without decimals.",
    "json.invalidEscape": "Unknown escape sequence.",
    "json.controlCharacter": "Line break or tab inside a text: write it as \\n or \\t.",
    "json.trailingContent": "There is more text after the end of the JSON.",
    "json.tooDeep": "The JSON is nested too deeply.",
    "modelSchema": "This model schema is not valid.",
}

_JSON_DETAIL_ES = {
    "json.unexpectedEnd": "El JSON termina antes de tiempo: algo no está cerrado.",
    "json.unexpectedCharacter": "Carácter inesperado.",
    "json.trailingComma": "Coma antes del final de una lista u objeto: quítala.",
    "json.invalidNumber": "Número no válido: JSON no admite ceros a la izquierda ni un punto sin decimales.",
    "json.invalidEscape": "Secuencia de escape desconocida.",
    "json.controlCharacter": "Salto de línea o tabulador dentro de un texto: escríbelo como \\n o \\t.",
    "json.trailingContent": "Hay más texto después del final del JSON.",
    "json.tooDeep": "El JSON tiene demasiados niveles.",
    "modelSchema": "Este esquema de modelos no es válido.",
}


def _parse_issue_en(issue: dict) -> str:
    params = issue.get("params")
    code = issue["code"]
    if code == "syntax":
        if params and params.get("detail"):
            detail = _JSON_DETAIL_EN.get(str(params["detail"]), str(params["detail"]))
            return detail + (f" ({_p(params, 'path')})" if params.get("path") else "")
        if params and params.get("message"):
            return f"It cannot be read as this format: {_p(params, 'message')}"
        return "It cannot be read as this format."
    return {
        "empty": "There is nothing to read.",
        "unexpectedToken": f"Unexpected “{_p(params, 'token')}”.",
        "unterminatedString": "A text is not closed.",
        "unterminatedComment": "A comment is not closed.",
        "unclosedBlock": "A block is not closed: a “}” is missing.",
        "noModels": "No model was found. Check the format or paste the declarations.",
        "unknownType": f"“{_p(params, 'type')}” is not declared here: it is treated as a value of any shape.",
        "mixedTypes": f"“{_p(params, 'field')}” has values of different types.",
        "duplicateField": f"“{_p(params, 'field')}” is declared twice.",
        "duplicateModel": f"“{_p(params, 'model')}” is declared twice.",
        "emptyModel": f"“{_p(params, 'model')}” has no fields.",
        "truncatedRows": f"Only the first {_p(params, 'count')} rows were read.",
    }.get(code, code)


def _parse_issue_es(issue: dict) -> str:
    params = issue.get("params")
    code = issue["code"]
    if code == "syntax":
        if params and params.get("detail"):
            detail = _JSON_DETAIL_ES.get(str(params["detail"]), str(params["detail"]))
            return detail + (f" ({_p(params, 'path')})" if params.get("path") else "")
        if params and params.get("message"):
            return f"No se puede leer con este formato: {_p(params, 'message')}"
        return "No se puede leer con este formato."
    return {
        "empty": "No hay nada que leer.",
        "unexpectedToken": f"No se esperaba «{_p(params, 'token')}».",
        "unterminatedString": "Hay un texto sin cerrar.",
        "unterminatedComment": "Hay un comentario sin cerrar.",
        "unclosedBlock": "Hay un bloque sin cerrar: falta una «}».",
        "noModels": "No se ha encontrado ningún modelo. Revisa el formato o pega las declaraciones.",
        "unknownType": f"«{_p(params, 'type')}» no está declarado aquí: se trata como un valor de cualquier forma.",
        "mixedTypes": f"«{_p(params, 'field')}» tiene valores de tipos distintos.",
        "duplicateField": f"«{_p(params, 'field')}» está declarado dos veces.",
        "duplicateModel": f"«{_p(params, 'model')}» está declarado dos veces.",
        "emptyModel": f"«{_p(params, 'model')}» no tiene campos.",
        "truncatedRows": f"Solo se han leído las primeras {_p(params, 'count')} filas.",
    }.get(code, code)


def _relation_option_en(choice: str, shape: str) -> str:
    if choice == "reference":
        return "References (_id list)" if shape == "models" else "Foreign key (many-to-one)"
    if choice == "child":
        if shape == "models":
            return "Child table (one-to-many)"
        return "Key-value table" if shape == "map" else "Table of values"
    return {
        "flatten": "Columns in this table",
        "join": "Join table (many-to-many)",
        "array": "Array column (PostgreSQL)",
        "json": "JSON column",
        "embed": "Embedded",
    }[choice]


def _relation_option_es(choice: str, shape: str) -> str:
    if choice == "reference":
        return "Referencias (lista de _id)" if shape == "models" else "Clave ajena (muchos a uno)"
    if choice == "child":
        if shape == "models":
            return "Tabla hija (uno a muchos)"
        return "Tabla clave-valor" if shape == "map" else "Tabla de valores"
    return {
        "flatten": "Columnas en esta tabla",
        "join": "Tabla intermedia (muchos a muchos)",
        "array": "Columna array (PostgreSQL)",
        "json": "Columna JSON",
        "embed": "Embebido",
    }[choice]


def _key_option_en(choice: dict) -> str:
    if choice["kind"] == "field":
        return f"Field “{choice['field']}”"
    return {
        "integer": "New key: auto-increment number",
        "uuid": "New key: UUID",
    }.get(choice["type"], "MongoDB ObjectId")


def _key_option_es(choice: dict) -> str:
    if choice["kind"] == "field":
        return f"Campo «{choice['field']}»"
    return {
        "integer": "Clave nueva: número autoincremental",
        "uuid": "Clave nueva: UUID",
    }.get(choice["type"], "ObjectId de MongoDB")


def _reason_en(reason: dict) -> str:
    params = reason.get("params")
    code = reason["code"]
    if code == "sharedTarget":
        if _p(params, "users"):
            return (
                f"“{_p(params, 'model')}” is also used by {_p(params, 'users')}. "
                "Decide whether each one keeps its own copy or they share it."
            )
        return f"“{_p(params, 'model')}” is also stored on its own. Decide whether to keep a copy here or refer to it."
    if code == "freeShape":
        if _p(params, "type"):
            return (
                f"“{_p(params, 'type')}” has no fixed shape here: stored as JSON. Write a type in Edit if you know it."
            )
        return "Its shape is not fixed: stored as JSON."
    return {
        "keyDeclared": f"The input marks “{_p(params, 'field')}” as the primary key.",
        "keyNamed": f"“{_p(params, 'field')}” is named like an identifier.",
        "keyCandidates": f"“{_p(params, 'fields')}” could identify each row, but that is not certain. "
        "A new key is suggested; choose the field if it never repeats or changes.",
        "keyMissing": "No field identifies each row: a new key is added.",
        "keyMongo": "MongoDB gives every document an _id.",
        "relationDeclared": "Declared in the input.",
        "selfReference": "The model refers to itself.",
        "targetHasKey": f"“{_p(params, 'model')}” has its own key: it is stored once and referred to.",
        "valueObject": f"“{_p(params, 'model')}” has no key: it is a value that belongs to this model.",
        "notFlattenable": f"“{_p(params, 'model')}” has no key and holds lists, so it cannot become columns. "
        "Choose how to store it.",
        "backReference": f"“{_p(params, 'model')}.{_p(params, 'field')}” already points back to this model.",
        "bothSidesLists": f"“{_p(params, 'model')}.{_p(params, 'field')}” lists this model too: "
        "each side can have many of the other.",
        "ownedList": f"“{_p(params, 'model')}” only appears here: its rows belong to this model.",
        "primitiveList": "A list of plain values: a table with one row per value keeps them searchable.",
        "mapOfValues": "Keys chosen at run time: JSON keeps them as they are.",
        "recursiveEmbed": f"“{_p(params, 'model')}” leads back to this model: embedding it would never end, "
        "so it is referred to.",
        "unboundedList": "Embedded and read with its document. If the list can grow without limit, "
        f"refer to “{_p(params, 'model')}” instead.",
        "targetExcluded": f"“{_p(params, 'model')}” is left out.",
        "foreignKeyNamed": f"Named after “{_p(params, 'model')}”: it most likely holds its key.",
        "uniqueDeclared": "Declared unique in the input.",
        "uniqueNamed": f"“{_p(params, 'field')}” is usually unique. Confirm it if two rows can never share it.",
        "enumCheck": "A CHECK constraint keeps the allowed values without a type of its own and is easy to change.",
        "enumDocument": "The validator lists the allowed values.",
        "parentOnly": "Only used as a base class.",
        "manual": "Chosen by you.",
    }.get(code, code)


def _reason_es(reason: dict) -> str:
    params = reason.get("params")
    code = reason["code"]
    if code == "sharedTarget":
        if _p(params, "users"):
            return (
                f"«{_p(params, 'model')}» también lo usa {_p(params, 'users')}. "
                "Decide si cada uno guarda su propia copia o la comparten."
            )
        return (
            f"«{_p(params, 'model')}» también se guarda por su cuenta. "
            "Decide si guardar aquí una copia o referenciarlo."
        )
    if code == "freeShape":
        if _p(params, "type"):
            return (
                f"«{_p(params, 'type')}» no tiene una forma fija aquí: se guarda como JSON. "
                "Escribe un tipo en Editar si lo conoces."
            )
        return "Su forma no es fija: se guarda como JSON."
    return {
        "keyDeclared": f"La entrada marca «{_p(params, 'field')}» como clave primaria.",
        "keyNamed": f"«{_p(params, 'field')}» tiene nombre de identificador.",
        "keyCandidates": f"«{_p(params, 'fields')}» podría identificar cada fila, pero no es seguro. "
        "Se sugiere una clave nueva; elige el campo si nunca se repite ni cambia.",
        "keyMissing": "Ningún campo identifica cada fila: se añade una clave nueva.",
        "keyMongo": "MongoDB da a cada documento un _id.",
        "relationDeclared": "Declarado en la entrada.",
        "selfReference": "El modelo se refiere a sí mismo.",
        "targetHasKey": f"«{_p(params, 'model')}» tiene clave propia: se guarda una vez y se referencia.",
        "valueObject": f"«{_p(params, 'model')}» no tiene clave: es un valor que pertenece a este modelo.",
        "notFlattenable": f"«{_p(params, 'model')}» no tiene clave y contiene listas, así que no puede convertirse "
        "en columnas. Elige cómo guardarlo.",
        "backReference": f"«{_p(params, 'model')}.{_p(params, 'field')}» ya apunta a este modelo.",
        "bothSidesLists": f"«{_p(params, 'model')}.{_p(params, 'field')}» también lista este modelo: "
        "cada lado puede tener muchos del otro.",
        "ownedList": f"«{_p(params, 'model')}» solo aparece aquí: sus filas pertenecen a este modelo.",
        "primitiveList": "Una lista de valores simples: una tabla con una fila por valor permite buscarlos.",
        "mapOfValues": "Las claves se deciden al usarlo: JSON las guarda tal cual.",
        "recursiveEmbed": f"«{_p(params, 'model')}» lleva de vuelta a este modelo: embeberlo no terminaría nunca, "
        "así que se referencia.",
        "unboundedList": "Embebido y leído con su documento. Si la lista puede crecer sin límite, "
        f"referencia «{_p(params, 'model')}».",
        "targetExcluded": f"«{_p(params, 'model')}» está excluido.",
        "foreignKeyNamed": f"Lleva el nombre de «{_p(params, 'model')}»: lo más probable es que guarde su clave.",
        "uniqueDeclared": "Declarado único en la entrada.",
        "uniqueNamed": f"«{_p(params, 'field')}» suele ser único. Confírmalo si dos filas nunca pueden compartirlo.",
        "enumCheck": "Una restricción CHECK limita los valores sin un tipo propio y es fácil de cambiar.",
        "enumDocument": "El validador enumera los valores permitidos.",
        "parentOnly": "Solo se usa como clase base.",
        "manual": "Elegido por ti.",
    }.get(code, code)


def _note_en(note: dict) -> str:
    params = note.get("params")
    return {
        "arrayAsJson": f"“{_p(params, 'field')}” is stored as JSON: only PostgreSQL has array columns.",
        "nativeEnumAsCheck": f"“{_p(params, 'enum')}” uses a CHECK constraint: this database has no enum types.",
        "defaultPrecision": f"{_p(params, 'fields')}: the input does not give a precision, "
        f"so DECIMAL({_p(params, 'precision')}) is used. Check it.",
        "inheritedFields": f"“{_p(params, 'model')}” includes the fields of {_p(params, 'parents')}.",
        "cycleEmbedded": f"“{_p(params, 'model')}” contains itself: the inner copy is stored as a plain object.",
        "renamedReserved": f"“{_p(params, 'name')}” is a reserved word and is quoted.",
        "textKeyLength": f"“{_p(params, 'column')}” is part of a key or an index, and this engine cannot index text "
        f"without a length: it is VARCHAR({_p(params, 'length')}).",
        "compositeKeyAsId": f"{_p(params, 'orm')} has no composite primary keys: “{_p(params, 'table')}” gets an id "
        f"column, and {_p(params, 'columns')} stay unique together.",
        "enumCheckedInCode": f"{_p(params, 'orm')} checks the values of “{_p(params, 'enum')}” in the application: "
        "the database does not restrict them.",
        "ormEnumType": f"{_p(params, 'orm')} stores “{_p(params, 'enum')}” with an enum type of the database, "
        "not with a CHECK constraint.",
        "enumNeedsCast": f"{_p(params, 'orm')} sends “{_p(params, 'enum')}” as text, and PostgreSQL does not cast it "
        "to its enum type: choose a CHECK constraint, or Hibernate.",
        "compositeKeyReadOnly": f"{_p(params, 'orm')} has no composite keys: rows of “{_p(params, 'table')}” are "
        "created and read with their model, and changed through their owner.",
    }.get(note["code"], note["code"])


def _note_es(note: dict) -> str:
    params = note.get("params")
    return {
        "arrayAsJson": f"«{_p(params, 'field')}» se guarda como JSON: solo PostgreSQL tiene columnas array.",
        "nativeEnumAsCheck": f"«{_p(params, 'enum')}» usa una restricción CHECK: "
        "esta base de datos no tiene tipos enumerados.",
        "defaultPrecision": f"{_p(params, 'fields')}: la entrada no indica la precisión, "
        f"así que se usa DECIMAL({_p(params, 'precision')}). Revísala.",
        "inheritedFields": f"«{_p(params, 'model')}» incluye los campos de {_p(params, 'parents')}.",
        "cycleEmbedded": f"«{_p(params, 'model')}» se contiene a sí mismo: "
        "la copia interior se guarda como un objeto sin validar.",
        "renamedReserved": f"«{_p(params, 'name')}» es una palabra reservada y va entre comillas.",
        "textKeyLength": f"«{_p(params, 'column')}» forma parte de una clave o un índice, y este motor no indexa "
        f"texto sin longitud: es VARCHAR({_p(params, 'length')}).",
        "compositeKeyAsId": f"{_p(params, 'orm')} no admite claves primarias compuestas: «{_p(params, 'table')}» "
        f"recibe una columna id, y {_p(params, 'columns')} siguen siendo únicas juntas.",
        "enumCheckedInCode": f"{_p(params, 'orm')} comprueba los valores de «{_p(params, 'enum')}» en la aplicación: "
        "la base de datos no los restringe.",
        "ormEnumType": f"{_p(params, 'orm')} guarda «{_p(params, 'enum')}» con un tipo enumerado de la base de datos, "
        "no con una restricción CHECK.",
        "enumNeedsCast": f"{_p(params, 'orm')} envía «{_p(params, 'enum')}» como texto, y PostgreSQL no lo convierte "
        "a su tipo enumerado: elige una restricción CHECK, o Hibernate.",
        "compositeKeyReadOnly": f"{_p(params, 'orm')} no admite claves compuestas: las filas de "
        f"«{_p(params, 'table')}» se crean y se leen con su modelo, y se cambian a través de su propietario.",
    }.get(note["code"], note["code"])


def _project_error_en(error: str, path: str | None = None) -> str:
    return {
        "notJson": "The file is not a Model2DB project (it is not JSON).",
        "notProject": "The file is not a Model2DB project.",
        "newerVersion": "The project was saved by a newer version of Model2DB.",
    }.get(error, f"The project is damaged{f' ({path})' if path else ''}.")


def _project_error_es(error: str, path: str | None = None) -> str:
    return {
        "notJson": "El archivo no es un proyecto de Model2DB (no es JSON).",
        "notProject": "El archivo no es un proyecto de Model2DB.",
        "newerVersion": "El proyecto se guardó con una versión más reciente de Model2DB.",
    }.get(error, f"El proyecto está dañado{f' ({path})' if path else ''}.")


EN = SimpleNamespace(
    tagline="Turn a data model into a database design you review before any code is written",
    intro_description="Paste or open your models (classes, DTOs, JSON, schemas) or receive them from Mapper. "
    "Model2DB proposes tables, keys, relations, embedded documents and indexes, explains each proposal and waits "
    "for you where it is not sure. Then save the schema for PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle "
    "or MongoDB, or the models of your ORM.",
    privacy_short="Processed locally",
    privacy_points=[
        "What you paste or open never leaves your computer.",
        "Code is analyzed, never run, and the original is never changed.",
        "Nothing uncertain is applied until you decide.",
        "Nothing is saved unless you turn on “Remember on this computer”.",
    ],
    examples_label="Try an example",
    examples={"store": "Online shop", "jpa": "JPA entities", "json": "JSON response", "prisma": "Prisma to MongoDB"},
    example_descriptions={
        "store": "TypeScript interfaces: references, value objects, lists and a many-to-many relation",
        "jpa": "Java entities whose annotations already declare keys and relations",
        "json": "An API response: every key, relation and type is inferred",
        "prisma": "A Prisma schema designed for MongoDB: embedded documents and references",
    },
    confirm_replace="This replaces your model and the decisions you made. Continue?",
    developed_by="Developed by",
    # Input
    input_title="Model",
    input_placeholder="Paste classes, DTOs, JSON or a schema here, or drop a file…",
    open_file="Open",
    clear="Clear",
    format_label="Format",
    format_auto=lambda detected: f"Detect ({detected})" if detected else "Detect automatically",
    open_dialog="Open a model",
    model_files="Models and documents",
    all_files="All files",
    file_too_large=lambda name: f"“{name}” is larger than 10 MB.",
    file_error=lambda name: f"“{name}” could not be read.",
    received_from=lambda tool: f"Model received from {tool}.",
    input_empty="Paste or open a model to start.",
    undetected="The format could not be detected: choose it in the list.",
    input_summary=lambda format_label, models, fields: (
        f"{format_label} · {_en_number(models)} "
        f"{_plural(models, 'model', 'models')} · {_en_number(fields)} {_plural(fields, 'field', 'fields')}"
    ),
    warnings_count=lambda count: f"{_en_number(count)} {_plural(count, 'note', 'notes')}",
    error_position=lambda line, column: f"Line {_en_number(line)}, column {_en_number(column)}",
    parse_issue=_parse_issue_en,
    # Design
    design_title="Design",
    design_waiting="The proposed design will appear here when the model can be read.",
    design_for=lambda database, kind: (
        f"Relational design for {database}" if kind == "relational" else f"Document design for {database}"
    ),
    design_summary=lambda stored, kind: (
        f"{_en_number(stored)} {_plural(stored, 'table', 'tables')} from the models"
        if kind == "relational"
        else f"{_en_number(stored)} {_plural(stored, 'collection', 'collections')}"
    ),
    pending_count=lambda count: f"{_en_number(count)} {_plural(count, 'decision', 'decisions')} to review",
    all_decided="Nothing left to review.",
    review_summary=lambda count: f"{_en_number(count)} {_plural(count, 'decision waits', 'decisions wait')} for you",
    review_help="They are not applied until you choose: the result leaves a TODO where each one goes.",
    undo="Undo",
    redo="Redo",
    undo_title="Undo (Ctrl/Cmd+Z)",
    redo_title="Redo (Ctrl/Cmd+Shift+Z)",
    reset="Reset",
    reset_title="Go back to the proposed design, discarding your decisions",
    confirm_reset="This discards every decision you made on the design. Continue?",
    accept="Accept",
    accept_title=lambda subject: f"Accept the suggestion for “{subject}”",
    edit="Edit",
    edit_title=lambda field: f"Edit how “{field}” is stored",
    table_name="Table name",
    collection_name="Collection name",
    key="Primary key",
    document_key="_id",
    include_model=lambda model: f"Store “{model}”",
    include_field="Store this field",
    column_name="Column name",
    property_name="Property name",
    column_type="Type in the database",
    column_type_help="Written as it is in the result, for every database. Leave it empty to use the derived type.",
    add_index="Add an index",
    derived="derived",
    not_stored="not stored",
    primary_key="primary key",
    enums_title="Enums",
    other_models_title="Models without a table of their own",
    other_documents_title="Models without a collection of their own",
    role={
        "stored": "Own table",
        "embedded": "Stored inside the models that use it",
        "parent": "Base class: its fields go into the models that extend it",
        "excluded": "Left out",
        "pending": "Waits for a decision on a field that uses it",
        "unused": "Nothing stored uses it",
    },
    document_role={
        "stored": "Own collection",
        "embedded": "Embedded in the documents that use it",
        "parent": "Base class: its fields go into the models that extend it",
        "excluded": "Left out",
        "pending": "Waits for a decision on a field that uses it",
        "unused": "Nothing stored uses it",
    },
    status={
        "exact": "Exact",
        "high": "High",
        "probable": "Likely",
        "review": "Review",
        "conflict": "Conflict",
        "none": "No match",
        "manual": "Chosen",
    },
    subjects=SimpleNamespace(
        key=lambda model: f"key of {model}",
        field=lambda model, field: f"{model}.{field}",
        unique=lambda model, field: f"unique {model}.{field}",
        enum=lambda name: f"enum {name}",
    ),
    relation_option=_relation_option_en,
    document_reference=lambda many: "References (list of _id)" if many else "Reference (_id)",
    key_option=_key_option_en,
    enum_option={
        "check": "Text with a CHECK constraint",
        "native": "Enum type of the database",
        "lookup": "Lookup table",
        "text": "Plain text, no constraint",
    },
    unique_option=lambda value: "Unique" if value else "Not unique",
    foreign_key_option=lambda model: f"Foreign key to “{model}”" if model else "Plain column",
    reason=_reason_en,
    # Result
    result_title="Result",
    database_label="Database",
    output_groups={
        "relational": "Relational SQL",
        "document": "Documents",
        "python": "Python",
        "typescript": "TypeScript / JavaScript",
        "jvm": "Java / Kotlin",
        "csharp": "C#",
        "php": "PHP",
    },
    engine_label="Database engine",
    include_migration="Include the migration",
    tables_naming="Table names",
    collections_naming="Collection names",
    tables_naming_option={
        "plural": "Plural (order_lines)",
        "singular": "Singular (order_line)",
        "model": "As the model (OrderLine)",
    },
    columns_naming="Column names",
    properties_naming="Property names",
    columns_naming_option={"snake": "snake_case (created_at)", "field": "As the field (createdAt)"},
    strings_label="Text without a length",
    strings_option={"auto": "Database default", "varchar": "VARCHAR(255)", "text": "TEXT"},
    result_empty="The schema will appear here.",
    copy="Copy",
    copied="Copied",
    save="Save",
    save_zip=lambda count: f"Save .zip ({_en_number(count)} files)",
    saved=lambda path: f"Saved in {path}",
    pending_in_result=lambda count: f"{_en_number(count)} {_plural(count, 'TODO', 'TODOs')} for pending decisions",
    notes_count=lambda count: f"{_en_number(count)} {_plural(count, 'note', 'notes')}",
    note=_note_en,
    # Project
    save_project="Save project",
    open_project="Open project",
    project_files="Model2DB projects",
    project_loaded=lambda name: f"Project “{name}” opened.",
    project_error=_project_error_en,
    remember="Remember on this computer",
    remember_hint="Saves your model and decisions on this computer only, to continue later.",
    clear_saved="Delete saved work",
    clear_saved_confirm="Delete the work saved on this computer?",
    saved_cleared="Saved work deleted.",
    restored="Your previous work was restored from this computer.",
)

ES = SimpleNamespace(
    tagline="Convierte un modelo de datos en un diseño de base de datos que revisas antes de generar código",
    intro_description="Pega o abre tus modelos (clases, DTOs, JSON, esquemas) o recíbelos de Mapper. Model2DB propone "
    "tablas, claves, relaciones, documentos embebidos e índices, explica cada propuesta y te espera donde no está "
    "seguro. Después guarda el esquema para PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle o MongoDB, o los "
    "modelos de tu ORM.",
    privacy_short="Procesado en local",
    privacy_points=[
        "Lo que pegas o abres no sale de tu equipo.",
        "El código se analiza, nunca se ejecuta, y el original no se modifica.",
        "Nada dudoso se aplica hasta que decides.",
        "No se guarda nada salvo que actives «Recordar en este equipo».",
    ],
    examples_label="Prueba un ejemplo",
    examples={"store": "Tienda online", "jpa": "Entidades JPA", "json": "Respuesta JSON", "prisma": "Prisma a MongoDB"},
    example_descriptions={
        "store": "Interfaces de TypeScript: referencias, objetos de valor, listas y una relación muchos a muchos",
        "jpa": "Entidades de Java cuyas anotaciones ya declaran claves y relaciones",
        "json": "Una respuesta de API: todas las claves, relaciones y tipos se deducen",
        "prisma": "Un esquema de Prisma diseñado para MongoDB: documentos embebidos y referencias",
    },
    confirm_replace="Se sustituirán tu modelo y las decisiones que has tomado. ¿Continuar?",
    developed_by="Desarrollado por",
    # Entrada
    input_title="Modelo",
    input_placeholder="Pega aquí clases, DTOs, JSON o un esquema, o suelta un archivo…",
    open_file="Abrir",
    clear="Limpiar",
    format_label="Formato",
    format_auto=lambda detected: f"Detectar ({detected})" if detected else "Detectar automáticamente",
    open_dialog="Abrir un modelo",
    model_files="Modelos y documentos",
    all_files="Todos los archivos",
    file_too_large=lambda name: f"«{name}» supera los 10 MB.",
    file_error=lambda name: f"«{name}» no se ha podido leer.",
    received_from=lambda tool: f"Modelo recibido de {tool}.",
    input_empty="Pega o abre un modelo para empezar.",
    undetected="No se ha podido detectar el formato: elígelo en la lista.",
    input_summary=lambda format_label, models, fields: (
        f"{format_label} · {_es_number(models)} "
        f"{_plural(models, 'modelo', 'modelos')} · {_es_number(fields)} {_plural(fields, 'campo', 'campos')}"
    ),
    warnings_count=lambda count: f"{_es_number(count)} {_plural(count, 'nota', 'notas')}",
    error_position=lambda line, column: f"Línea {_es_number(line)}, columna {_es_number(column)}",
    parse_issue=_parse_issue_es,
    # Diseño
    design_title="Diseño",
    design_waiting="El diseño propuesto aparecerá aquí cuando se pueda leer el modelo.",
    design_for=lambda database, kind: (
        f"Diseño relacional para {database}" if kind == "relational" else f"Diseño de documentos para {database}"
    ),
    design_summary=lambda stored, kind: (
        f"{_es_number(stored)} {_plural(stored, 'tabla', 'tablas')} a partir de los modelos"
        if kind == "relational"
        else f"{_es_number(stored)} {_plural(stored, 'colección', 'colecciones')}"
    ),
    pending_count=lambda count: f"{_es_number(count)} {_plural(count, 'decisión', 'decisiones')} para revisar",
    all_decided="No queda nada por revisar.",
    review_summary=lambda count: f"{_es_number(count)} {_plural(count, 'decisión te espera', 'decisiones te esperan')}",
    review_help="No se aplican hasta que eliges: el resultado deja un TODO donde va cada una.",
    undo="Deshacer",
    redo="Rehacer",
    undo_title="Deshacer (Ctrl/Cmd+Z)",
    redo_title="Rehacer (Ctrl/Cmd+Mayús+Z)",
    reset="Restablecer",
    reset_title="Volver al diseño propuesto y descartar tus decisiones",
    confirm_reset="Se descartarán todas las decisiones que has tomado en el diseño. ¿Continuar?",
    accept="Aceptar",
    accept_title=lambda subject: f"Aceptar la sugerencia para «{subject}»",
    edit="Editar",
    edit_title=lambda field: f"Editar cómo se guarda «{field}»",
    table_name="Nombre de la tabla",
    collection_name="Nombre de la colección",
    key="Clave primaria",
    document_key="_id",
    include_model=lambda model: f"Guardar «{model}»",
    include_field="Guardar este campo",
    column_name="Nombre de la columna",
    property_name="Nombre de la propiedad",
    column_type="Tipo en la base de datos",
    column_type_help="Se escribe tal cual en el resultado, para cualquier base de datos. "
    "Déjalo vacío para usar el tipo deducido.",
    add_index="Añadir un índice",
    derived="deducido",
    not_stored="no se guarda",
    primary_key="clave primaria",
    enums_title="Enumeraciones",
    other_models_title="Modelos sin tabla propia",
    other_documents_title="Modelos sin colección propia",
    role={
        "stored": "Tabla propia",
        "embedded": "Se guarda dentro de los modelos que lo usan",
        "parent": "Clase base: sus campos van a los modelos que la heredan",
        "excluded": "Excluido",
        "pending": "Espera una decisión sobre un campo que lo usa",
        "unused": "Nada de lo que se guarda lo usa",
    },
    document_role={
        "stored": "Colección propia",
        "embedded": "Embebido en los documentos que lo usan",
        "parent": "Clase base: sus campos van a los modelos que la heredan",
        "excluded": "Excluido",
        "pending": "Espera una decisión sobre un campo que lo usa",
        "unused": "Nada de lo que se guarda lo usa",
    },
    status={
        "exact": "Exacta",
        "high": "Alta",
        "probable": "Probable",
        "review": "Revisar",
        "conflict": "Conflicto",
        "none": "Sin coincidencia",
        "manual": "Elegida",
    },
    subjects=SimpleNamespace(
        key=lambda model: f"clave de {model}",
        field=lambda model, field: f"{model}.{field}",
        unique=lambda model, field: f"única {model}.{field}",
        enum=lambda name: f"enumeración {name}",
    ),
    relation_option=_relation_option_es,
    document_reference=lambda many: "Referencias (lista de _id)" if many else "Referencia (_id)",
    key_option=_key_option_es,
    enum_option={
        "check": "Texto con restricción CHECK",
        "native": "Tipo enumerado de la base de datos",
        "lookup": "Tabla de consulta",
        "text": "Texto sin restricción",
    },
    unique_option=lambda value: "Única" if value else "No única",
    foreign_key_option=lambda model: f"Clave ajena a «{model}»" if model else "Columna normal",
    reason=_reason_es,
    # Resultado
    result_title="Resultado",
    database_label="Base de datos",
    output_groups={
        "relational": "SQL relacional",
        "document": "Documentos",
        "python": "Python",
        "typescript": "TypeScript / JavaScript",
        "jvm": "Java / Kotlin",
        "csharp": "C#",
        "php": "PHP",
    },
    engine_label="Motor de base de datos",
    include_migration="Incluir la migración",
    tables_naming="Nombres de tabla",
    collections_naming="Nombres de colección",
    tables_naming_option={
        "plural": "Plural (order_lines)",
        "singular": "Singular (order_line)",
        "model": "Como el modelo (OrderLine)",
    },
    columns_naming="Nombres de columna",
    properties_naming="Nombres de propiedad",
    columns_naming_option={"snake": "snake_case (created_at)", "field": "Como el campo (createdAt)"},
    strings_label="Texto sin longitud",
    strings_option={"auto": "Según la base de datos", "varchar": "VARCHAR(255)", "text": "TEXT"},
    result_empty="El esquema aparecerá aquí.",
    copy="Copiar",
    copied="Copiado",
    save="Guardar",
    save_zip=lambda count: f"Guardar .zip ({_es_number(count)} archivos)",
    saved=lambda path: f"Guardado en {path}",
    pending_in_result=lambda count: f"{_es_number(count)} TODO por decisiones pendientes",
    notes_count=lambda count: f"{_es_number(count)} {_plural(count, 'nota', 'notas')}",
    note=_note_es,
    # Proyecto
    save_project="Guardar proyecto",
    open_project="Abrir proyecto",
    project_files="Proyectos de Model2DB",
    project_loaded=lambda name: f"Proyecto «{name}» abierto.",
    project_error=_project_error_es,
    remember="Recordar en este equipo",
    remember_hint="Guarda tu modelo y tus decisiones solo en este equipo, para seguir más tarde.",
    clear_saved="Borrar el trabajo guardado",
    clear_saved_confirm="¿Borrar el trabajo guardado en este equipo?",
    saved_cleared="Trabajo guardado borrado.",
    restored="Se ha recuperado tu trabajo anterior de este equipo.",
)

MESSAGES = {"en": EN, "es": ES}


class I18n(QObject):
    """The current language, remembered in the settings. Widgets listen to changed to update their texts."""

    changed = Signal()

    def __init__(self, settings: QSettings):
        super().__init__()
        self._settings = settings
        stored = settings.value("language")
        if stored not in MESSAGES:
            stored = "es" if QLocale.system().name().startswith("es") else "en"
        self.language: str = stored

    @property
    def t(self) -> SimpleNamespace:
        return MESSAGES[self.language]

    def set_language(self, language: str) -> None:
        if language == self.language:
            return
        self.language = language
        self._settings.setValue("language", language)
        self.changed.emit()
