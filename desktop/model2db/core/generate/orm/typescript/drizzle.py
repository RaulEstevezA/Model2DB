"""A Drizzle ORM schema with its relations. drizzle-kit writes the migrations from it (`drizzle-kit generate`), so
none is written here. Mirrors web/src/core/generate/orm/typescript/drizzle.ts."""

from ....js import is_number, js_string
from ....model.naming import to_camel_case
from ...todos import todo_text
from ...types import file_base, generated_file
from ..entities import build_entities
from .typescript import ts_key, ts_string

FLAVORS = {"postgresql": "pg", "mysql": "mysql", "mariadb": "mysql", "sqlite": "sqlite"}


def _enum_width(item: dict) -> int:
    longest = max([1, *(len(js_string(value)) for value in item["values"])])
    return 20 if longest <= 20 else 50 if longest <= 50 else 255


def _builder(fn: str, name: str, options: str | None = None) -> tuple[str, list[str]]:
    return f"{fn}({ts_string(name)}{f', {options}' if options else ''})", [fn]


def _enum_variable(item: dict) -> str:
    return f"{to_camel_case(item['name'])}Enum"


def _find_enum(enums: list[dict], name: str) -> dict | None:
    return next((candidate for candidate in enums if candidate["name"] == name), None)


def _numeric(item: dict | None) -> bool:
    return bool(item) and all(is_number(value) for value in item["values"])


def _precision(column_type: dict) -> str:
    precision = column_type.get("precision")
    scale = column_type.get("scale")
    return f"{{ precision: {18 if precision is None else precision}, scale: {2 if scale is None else scale} }}"


def _pg_column(column_type: dict, name: str, enums: list[dict]) -> tuple[str, list[str]]:
    kind = column_type["kind"]
    if kind in ("raw", "json"):
        return _builder("jsonb", name)
    if kind == "array":
        call, imports = _pg_column(column_type["items"], name, enums)
        return f"{call}.array()", imports
    if kind == "enum":
        item = _find_enum(enums, column_type["name"])
        if item and item["storage"] == "native":
            return f"{_enum_variable(item)}({ts_string(name)})", []
        if _numeric(item):
            return _builder("integer", name)
        return _builder("varchar", name, f"{{ length: {_enum_width(item) if item else 255} }}")
    type_name, bits = column_type["name"], column_type.get("bits")
    if type_name == "string":
        length = column_type.get("length")
        return _builder("varchar", name, f"{{ length: {length} }}") if length else _builder("text", name)
    if type_name == "integer":
        if bits == 64:
            return _builder("bigint", name, "{ mode: 'number' }")
        if bits in (8, 16):
            return _builder("smallint", name)
        return _builder("integer", name)
    if type_name == "float":
        return _builder("real", name) if bits == 32 else _builder("doublePrecision", name)
    if type_name == "decimal":
        return _builder("numeric", name, _precision(column_type))
    if type_name == "datetime":
        return _builder("timestamp", name, "{ withTimezone: true }")
    if type_name == "binary":
        return f"bytea({ts_string(name)})", ["customType"]
    return _builder(
        {
            "boolean": "boolean",
            "date": "date",
            "time": "time",
            "duration": "interval",
            "uuid": "uuid",
            "any": "jsonb",
        }[type_name],
        name,
    )


def _mysql_column(column_type: dict, name: str, enums: list[dict]) -> tuple[str, list[str]]:
    kind = column_type["kind"]
    if kind in ("raw", "json", "array"):
        return _builder("json", name)
    if kind == "enum":
        item = _find_enum(enums, column_type["name"])
        if item and item["storage"] == "native":
            values = ", ".join(ts_string(js_string(value)) for value in item["values"])
            return _builder("mysqlEnum", name, f"[{values}]")
        if _numeric(item):
            return _builder("int", name)
        return _builder("varchar", name, f"{{ length: {_enum_width(item) if item else 255} }}")
    type_name, bits = column_type["name"], column_type.get("bits")
    if type_name == "string":
        length = column_type.get("length")
        return _builder("varchar", name, f"{{ length: {length} }}") if length else _builder("text", name)
    if type_name == "integer":
        if bits == 64:
            return _builder("bigint", name, "{ mode: 'number' }")
        if bits in (8, 16):
            return _builder("smallint", name)
        return _builder("int", name)
    if type_name == "float":
        return _builder("float", name) if bits == 32 else _builder("double", name)
    if type_name == "decimal":
        return _builder("decimal", name, _precision(column_type))
    if type_name == "datetime":
        return _builder("datetime", name, "{ fsp: 6 }")
    if type_name == "duration":
        return _builder("varchar", name, "{ length: 50 }")
    if type_name == "uuid":
        return _builder("char", name, "{ length: 36 }")
    if type_name == "binary":
        return f"blob({ts_string(name)})", ["customType"]
    return _builder({"boolean": "boolean", "date": "date", "time": "time", "any": "json"}[type_name], name)


def _sqlite_column(column_type: dict, name: str, enums: list[dict]) -> tuple[str, list[str]]:
    kind = column_type["kind"]
    if kind in ("raw", "json", "array"):
        return _builder("text", name, "{ mode: 'json' }")
    if kind == "enum":
        item = _find_enum(enums, column_type["name"])
        return _builder("integer", name) if _numeric(item) else _builder("text", name)
    type_name = column_type["name"]
    if type_name == "boolean":
        return _builder("integer", name, "{ mode: 'boolean' }")
    if type_name == "any":
        return _builder("text", name, "{ mode: 'json' }")
    return _builder(
        {"integer": "integer", "float": "real", "decimal": "numeric", "binary": "blob"}.get(type_name, "text"), name
    )


# What changes between the three flavors of Drizzle: the module, the table function and the builders
RULES = {
    "pg": {
        "module": "drizzle-orm/pg-core",
        "table": "pgTable",
        "column": _pg_column,
        "identity": lambda call: f"{call}.generatedByDefaultAsIdentity()",
        "now": ".defaultNow()",
        "anyColumn": "AnyPgColumn",
    },
    "mysql": {
        "module": "drizzle-orm/mysql-core",
        "table": "mysqlTable",
        "column": _mysql_column,
        "identity": lambda call: f"{call}.autoincrement()",
        # datetime(6) has no defaultNow() in Drizzle
        "now": ".default(sql`CURRENT_TIMESTAMP(6)`)",
        "anyColumn": "AnyMySqlColumn",
    },
    "sqlite": {
        "module": "drizzle-orm/sqlite-core",
        "table": "sqliteTable",
        "column": _sqlite_column,
        "identity": lambda call: call,
        "now": ".default(sql`CURRENT_TIMESTAMP`)",
        "anyColumn": "AnySQLiteColumn",
    },
}


def _literal(value, column: dict, enums: list[dict]) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool) or is_number(value):
        return js_string(value)
    item = _find_enum(enums, column["type"]["name"]) if column["type"]["kind"] == "enum" else None
    stored = (
        next((candidate for candidate in item["values"] if js_string(candidate).lower() == value.lower()), value)
        if item
        else value
    )
    return js_string(stored) if is_number(stored) else ts_string(js_string(stored))


def _locale_key(name: str):
    """The order of localeCompare for these names: letters regardless of case, lower case first on a tie."""
    bare = name.replace("type ", "", 1)
    return bare.lower(), [char.isupper() for char in bare]


def _table_block(table: dict, item: dict | None, view: dict, flavor: str, imports: dict, variables: dict) -> list[str]:
    rules = RULES[flavor]
    variable = variables[table["name"]]
    composite = len(table["primaryKey"]) > 1

    def attribute_name(column: str) -> str:
        if item:
            found = next(
                (attribute["name"] for attribute in item["attributes"] if attribute["column"]["name"] == column), None
            )
            if found is not None:
                return found
        return to_camel_case(column)

    lines = []
    for column in table["columns"]:
        call, needed = rules["column"](column["type"], column["name"], view["enums"])
        imports["core"].update(needed)
        primary = not composite and bool(table["primaryKey"]) and table["primaryKey"][0] == column["name"]
        generated = column.get("generated")
        if primary:
            if generated == "identity":
                call = rules["identity"](call)
            call += (
                ".primaryKey({ autoIncrement: true })"
                if flavor == "sqlite" and generated == "identity"
                else ".primaryKey()"
            )
        if not column["nullable"] and not primary:
            call += ".notNull()"
        if generated == "uuid":
            call += ".defaultRandom()" if flavor == "pg" else ".$defaultFn(() => crypto.randomUUID())"
        if generated == "now":
            call += rules["now"]
            if "sql`" in rules["now"]:
                imports["orm"].add("sql")
        if column.get("defaultValue") is not None:
            value = _literal(column["defaultValue"], column, view["enums"])
            if value is not None:
                call += f".default({value})"
        fk = next(
            (
                candidate
                for candidate in table["foreignKeys"]
                if len(candidate["columns"]) == 1 and candidate["columns"][0] == column["name"]
            ),
            None,
        )
        if fk:
            target = variables[fk["table"]]
            target_item = next(
                (candidate for candidate in view["classes"] if candidate["table"]["name"] == fk["table"]), None
            )
            reference = next(
                (
                    attribute["name"]
                    for attribute in (target_item["attributes"] if target_item else [])
                    if attribute["column"]["name"] == fk["references"][0]
                ),
                None,
            )
            if reference is None:
                reference = to_camel_case(fk["references"][0])
            action = f", {{ onDelete: {ts_string(fk['onDelete'])} }}" if fk.get("onDelete") else ""
            call += f".references((): {rules['anyColumn']} => {target}.{reference}{action})"
            imports["core"].add(f"type {rules['anyColumn']}")
        lines.append(f"  {ts_key(attribute_name(column['name']))}: {call},")

    def on(columns: list[str]) -> str:
        return ", ".join(f"table.{attribute_name(column)}" for column in columns)

    extras = []
    if composite:
        imports["core"].add("primaryKey")
        extras.append(
            f"primaryKey({{ name: {ts_string('pk_' + table['name'])}, columns: [{on(table['primaryKey'])}] }})"
        )
    for unique in table["uniques"]:
        imports["core"].add("unique")
        extras.append(f"unique({ts_string(unique['name'])}).on({on(unique['columns'])})")
    for index in table["indexes"]:
        function = "uniqueIndex" if index["unique"] else "index"
        imports["core"].add(function)
        extras.append(f"{function}({ts_string(index['name'])}).on({on(index['columns'])})")
    for check in table["checks"]:
        imports["core"].add("check")
        imports["orm"].add("sql")
        values = ", ".join(
            js_string(value) if is_number(value) else "'" + js_string(value).replace("'", "''") + "'"
            for value in check["values"]
        )
        extras.append(
            f"check({ts_string(check['name'])}, sql`${{table.{attribute_name(check['column'])}}} IN ({values})`)"
        )
    imports["core"].add(rules["table"])
    head = [
        *(f"// {todo_text(todo, table['model'], 'table')}" for todo in table["todos"]),
        f"export const {variable} = {rules['table']}({ts_string(table['name'])}, {{",
    ]
    if not extras:
        return [*head, *lines, "})"]
    return [*head, *lines, "}, (table) => [", *(f"  {extra}," for extra in extras), "])"]


def _relations_block(item: dict, view: dict, variables: dict, join_relations: dict) -> list[str]:
    """`relations(...)` of a table: one() for its foreign keys, many() for the lists of the design. Both sides
    share a relation name, so several relations between the same tables stay apart."""
    variable = variables[item["table"]["name"]]
    entries = []
    for navigation in item["navigations"]:
        if navigation["kind"] == "manyToOne":
            attribute = next(
                candidate for candidate in item["attributes"] if candidate["name"] == navigation["attribute"]
            )
            target = next(candidate for candidate in view["classes"] if candidate["name"] == navigation["target"])
            reference = next(
                candidate["name"]
                for candidate in target["attributes"]
                if candidate["column"]["name"] == attribute["foreignKey"]["references"][0]
            )
            target_variable = variables[target["table"]["name"]]
            relation = ts_string(f"{item['name']}_{navigation['name']}")
            entries.append(
                f"  {ts_key(navigation['name'])}: one({target_variable}, "
                f"{{ fields: [{variable}.{navigation['attribute']}], "
                f"references: [{target_variable}.{reference}], relationName: {relation} }}),"
            )
        elif navigation["kind"] == "oneToMany":
            target = next(candidate for candidate in view["classes"] if candidate["name"] == navigation["target"])
            relation = ts_string(f"{target['name']}_{navigation.get('inverse')}")
            entries.append(
                f"  {ts_key(navigation['name'])}: many({variables[target['table']['name']]}, "
                f"{{ relationName: {relation} }}),"
            )
    entries.extend(join_relations.get(item["table"]["name"], []))
    if not entries:
        return []
    return [f"export const {variable}Relations = relations({variable}, ({{ one, many }}) => ({{", *entries, "}))"]


def _schema_file(view: dict, flavor: str, context, tables: list[dict]) -> str:
    imports = {"core": set(), "orm": set()}
    rules = RULES[flavor]
    variables = {table["name"]: to_camel_case(table["name"]) for table in tables}
    body: list[str] = []
    for item in view["enums"]:
        if item["storage"] != "native" or flavor != "pg":
            continue
        imports["core"].add("pgEnum")
        values = ", ".join(ts_string(js_string(value)) for value in item["values"])
        body.extend(["", f"export const {_enum_variable(item)} = pgEnum({ts_string(item['sqlName'])}, [{values}])"])
    uses_binary = any(
        column["type"]["kind"] == "primitive" and column["type"]["name"] == "binary"
        for table in tables
        for column in table["columns"]
    )
    if uses_binary and flavor != "sqlite":
        name = "bytea" if flavor == "pg" else "blob"
        body.extend(["", f"const {name} = customType<{{ data: Uint8Array }}>({{ dataType: () => {ts_string(name)} }})"])
    for table in tables:
        item = next((candidate for candidate in view["classes"] if candidate["table"] is table), None)
        body.extend(["", *_table_block(table, item, view, flavor, imports, variables)])
    # Join tables relate to both sides, and each side lists them
    join_relations: dict[str, list[str]] = {}
    join_blocks: list[str] = []
    for join in view["joins"]:
        variable = variables[join["name"]]
        entries = []
        for fk in join["foreignKeys"]:
            target = next(candidate for candidate in view["classes"] if candidate["table"]["name"] == fk["table"])
            reference = next(
                attribute["name"]
                for attribute in target["attributes"]
                if attribute["column"]["name"] == fk["references"][0]
            )
            column = fk["columns"][0]
            reference_column = fk["references"][0]
            name = (
                to_camel_case(column[: -len(reference_column) - 1])
                if column.endswith(f"_{reference_column}")
                else to_camel_case(column)
            )
            relation = f"{join['name']}_{name}"
            listed = next(
                (
                    navigation
                    for navigation in target["navigations"]
                    if navigation["kind"] == "manyToMany"
                    and navigation.get("join")
                    and navigation["join"]["table"] is join
                    and navigation["join"]["ownerColumn"] == column
                ),
                None,
            )
            list_name = listed["name"] if listed else f"{variable}Links"
            join_relations[fk["table"]] = [
                *join_relations.get(fk["table"], []),
                f"  {ts_key(list_name)}: many({variable}, {{ relationName: {ts_string(relation)} }}),",
            ]
            target_variable = variables[fk["table"]]
            entries.append(
                f"  {ts_key(name)}: one({target_variable}, {{ fields: [{variable}.{to_camel_case(column)}], "
                f"references: [{target_variable}.{reference}], relationName: {ts_string(relation)} }}),"
            )
        join_blocks.extend(
            ["", f"export const {variable}Relations = relations({variable}, ({{ one }}) => ({{", *entries, "}))"]
        )
    relation_blocks: list[str] = []
    for item in view["classes"]:
        block = _relations_block(item, view, variables, join_relations)
        if block:
            relation_blocks.extend(["", *block])
    if relation_blocks or join_blocks:
        imports["orm"].add("relations")
    orm_imports = sorted(imports["orm"], key=_locale_key)
    header = [
        f"// Drizzle schema written by Model2DB from {context.title}. Review it, then run `npx drizzle-kit generate`.",
        *([f"import {{ {', '.join(orm_imports)} }} from 'drizzle-orm'"] if orm_imports else []),
        f"import {{ {', '.join(sorted(imports['core'], key=_locale_key))} }} from {ts_string(rules['module'])}",
    ]
    return "\n".join([*header, *body, *relation_blocks, *join_blocks, ""])


class DrizzleOutput:
    id = "drizzle"
    label = "Drizzle ORM"
    group = "typescript"
    engines = ("postgresql", "mysql", "mariadb", "sqlite")

    def write(self, physical: dict, context) -> list[dict]:
        flavor = FLAVORS.get(context.settings["engine"], "pg")
        view = build_entities(physical, context.schema, "camelCase")
        content = _schema_file(view, flavor, context, physical["tables"])
        return [generated_file(f"db/{file_base(context.title)}.schema.ts", content, "typescript")]
