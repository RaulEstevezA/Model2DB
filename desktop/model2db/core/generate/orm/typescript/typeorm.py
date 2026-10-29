"""TypeORM entities, and a migration that runs the schema written for the chosen engine. Mirrors
web/src/core/generate/orm/typescript/typeorm.ts."""

import re

from ....js import is_number, js_string
from ...sql.statements import schema_statements
from ...todos import todo_text
from ...types import file_base, generated_file
from ..entities import build_entities, enum_members
from .typescript import ts_enum, ts_string, ts_type


def _enum_width(item: dict) -> int:
    longest = max([1, *(len(js_string(value)) for value in item["values"])])
    return 20 if longest <= 20 else 50 if longest <= 50 else 255


def _column_type(column_type: dict, engine: str, enums: list[dict]) -> list[str]:
    """The column options that say its type for the driver of the engine (`{ type: 'varchar', length: 20 }`)."""
    pg = engine == "postgresql"
    my = engine in ("mysql", "mariadb")
    ms = engine == "sqlserver"
    ora = engine == "oracle"
    sqlite = engine == "sqlite"

    def t(name: str, *more: str) -> list[str]:
        return [f"type: {ts_string(name)}", *more]

    def text() -> list[str]:
        return t("nvarchar", "length: 'MAX'") if ms else t("clob") if ora else t("text")

    def varchar(length) -> list[str]:
        return t("varchar2" if ora else "nvarchar" if ms else "varchar", f"length: {length}")

    def json_type() -> list[str]:
        return t("jsonb") if pg else t("json") if my else t("simple-json") if sqlite else text()

    kind = column_type["kind"]
    if kind in ("raw", "json"):
        return json_type()
    if kind == "array":
        return [*_column_type(column_type["items"], engine, enums), "array: true"]
    if kind == "enum":
        item = next((candidate for candidate in enums if candidate["name"] == column_type["name"]), None)
        if item and item["storage"] == "native" and (pg or my):
            return t("enum", f"enum: {item['name']}", f"enumName: {ts_string(item['sqlName'])}")
        if item and all(is_number(value) for value in item["values"]):
            return t("number", "precision: 10") if ora else t("int" if ms or my else "integer")
        return varchar(_enum_width(item) if item else 255)
    name, bits = column_type["name"], column_type.get("bits")
    if name == "string":
        length = column_type.get("length")
        return varchar(length) if length else text()
    if name == "integer":
        if ora:
            return t("number", f"precision: {19 if bits == 64 else 5 if bits == 16 else 10}")
        if bits == 64:
            return t("bigint")
        if bits in (8, 16):
            return t("smallint")
        return t("int" if ms or my else "integer")
    if name == "float":
        return t("double precision") if pg else t("double") if my else t("real") if sqlite else t("float")
    if name == "decimal":
        precision = column_type.get("precision")
        scale = column_type.get("scale")
        return t(
            "number" if ora else "decimal",
            f"precision: {18 if precision is None else precision}",
            f"scale: {2 if scale is None else scale}",
        )
    if name == "boolean":
        return t("bit") if ms else t("number", "precision: 1") if ora else t("boolean")
    if name == "date":
        return t("date")
    if name == "datetime":
        if pg:
            return t("timestamptz")
        if my:
            return t("datetime", "precision: 6")
        if sqlite:
            return t("datetime")
        return t("datetimeoffset") if ms else t("timestamp with time zone")
    if name == "time":
        return t("varchar2", "length: 15") if ora else t("time")
    if name == "duration":
        return t("interval") if pg else varchar(50)
    if name == "uuid":
        if pg or engine == "mariadb":
            return t("uuid")
        if ms:
            return t("uniqueidentifier")
        if ora:
            return t("raw", "length: 16")
        return t("char" if my else "varchar", "length: 36")
    if name == "binary":
        return t("bytea") if pg else t("varbinary", "length: 'MAX'") if ms else t("blob")
    return json_type()


def _literal(value, column: dict, enums: list[dict]) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool) or is_number(value):
        return js_string(value)
    item = (
        next((candidate for candidate in enums if candidate["name"] == column["type"]["name"]), None)
        if column["type"]["kind"] == "enum"
        else None
    )
    stored = (
        next((candidate for candidate in item["values"] if js_string(candidate).lower() == value.lower()), value)
        if item
        else value
    )
    return js_string(stored) if is_number(stored) else ts_string(js_string(stored))


def _column_lines(attribute: dict, writer: dict) -> list[str]:
    column = attribute["column"]
    engine, enums = writer["engine"], writer["view"]["enums"]
    options = [f"name: {ts_string(column['name'])}", *_column_type(column["type"], engine, enums)]
    if column["nullable"]:
        options.append("nullable: true")
    if column.get("generated") == "now":
        options.append("default: () => 'CURRENT_TIMESTAMP'")
    if column.get("defaultValue") is not None:
        value = _literal(column["defaultValue"], column, enums)
        if value is not None:
            options.append(f"default: {value}")
    decorator = "Column"
    if attribute["primaryKey"] and column.get("generated") == "identity":
        decorator = "PrimaryGeneratedColumn"
        # A generated key takes only its type: TypeORM does not accept a precision there
        options = [options[0], _column_type(column["type"], engine, enums)[0]]
    elif attribute["primaryKey"] and column.get("generated") == "uuid":
        writer["decorators"].add("PrimaryGeneratedColumn")
        return [
            f"@PrimaryGeneratedColumn('uuid', {{ name: {ts_string(column['name'])} }})",
            f"{attribute['name']}!: string",
        ]
    elif attribute["primaryKey"] or attribute["compositeKey"]:
        decorator = "PrimaryColumn"
    writer["decorators"].add(decorator)
    type_text = ts_type(column["type"], enums)
    return [
        f"@{decorator}({{ {', '.join(options)} }})",
        f"{attribute['name']}!: {type_text}{' | null' if column['nullable'] else ''}",
    ]


def _referenced(view: dict, class_name: str, column: str) -> str:
    """The property of a class that maps a column, for `referencedColumnName`."""
    item = next((candidate for candidate in view["classes"] if candidate["name"] == class_name), None)
    if not item:
        return column
    return next(
        (attribute["name"] for attribute in item["attributes"] if attribute["column"]["name"] == column), column
    )


def _relation_lines(navigation: dict, item: dict, writer: dict) -> list[str]:
    target = navigation["target"]
    view = writer["view"]
    kind = navigation["kind"]
    if kind == "manyToOne":
        writer["decorators"].update(("ManyToOne", "JoinColumn"))
        attribute = next(candidate for candidate in item["attributes"] if candidate["name"] == navigation["attribute"])
        fk = attribute["foreignKey"]
        options = [f"nullable: {'true' if navigation['nullable'] else 'false'}"]
        if fk.get("onDelete"):
            options.append(f"onDelete: {ts_string(fk['onDelete'].upper())}")
        inverse = f", (other) => other.{navigation['inverse']}" if navigation.get("inverse") else ""
        referenced = ts_string(_referenced(view, target, fk["references"][0]))
        return [
            f"@ManyToOne(() => {target}{inverse}, {{ {', '.join(options)} }})",
            f"@JoinColumn({{ name: {ts_string(attribute['column']['name'])}, referencedColumnName: {referenced} }})",
            f"{navigation['name']}!: {target}{' | null' if navigation['nullable'] else ''}",
        ]
    if kind == "oneToMany":
        writer["decorators"].add("OneToMany")
        return [
            f"@OneToMany(() => {target}, (other) => other.{navigation.get('inverse')})",
            f"{navigation['name']}!: {target}[]",
        ]
    writer["decorators"].add("ManyToMany")
    join = navigation["join"]
    owner = join["ownerColumn"] == join["table"]["foreignKeys"][0]["columns"][0]
    inverse = f", (other) => other.{navigation['inverse']}" if navigation.get("inverse") else ""
    lines = [f"@ManyToMany(() => {target}{inverse})"]
    if owner:
        writer["decorators"].add("JoinTable")
        first, second = join["table"]["foreignKeys"][0], join["table"]["foreignKeys"][1]
        join_column = (
            f"{{ name: {ts_string(first['columns'][0])}, "
            f"referencedColumnName: {ts_string(_referenced(view, item['name'], first['references'][0]))} }}"
        )
        inverse_column = (
            f"{{ name: {ts_string(second['columns'][0])}, "
            f"referencedColumnName: {ts_string(_referenced(view, target, second['references'][0]))} }}"
        )
        lines.append(
            f"@JoinTable({{ name: {ts_string(join['table']['name'])}, joinColumn: {join_column}, "
            f"inverseJoinColumn: {inverse_column} }})"
        )
    return [*lines, f"{navigation['name']}!: {target}[]"]


def _entities_file(view: dict, engine: str, context) -> str:
    writer = {"view": view, "engine": engine, "decorators": {"Entity"}}
    body: list[str] = []
    for item in view["enums"]:
        if item["storage"] in ("check", "native"):
            body.extend(["", *ts_enum(item["name"], enum_members(item, context.schema))])
    for item in view["classes"]:
        table = item["table"]
        body.append("")
        for todo in table["todos"]:
            body.append(f"// {todo_text(todo, table['model'], 'table')}")
        for check in table["checks"]:
            writer["decorators"].add("Check")
            values = ", ".join(
                js_string(value) if is_number(value) else "'" + js_string(value).replace("'", "''") + "'"
                for value in check["values"]
            )
            body.append(f"@Check({ts_string(check['name'])}, {ts_string(check['column'] + ' IN (' + values + ')')})")
        for unique in table["uniques"]:
            writer["decorators"].add("Unique")
            columns = ", ".join(ts_string(_referenced(view, item["name"], column)) for column in unique["columns"])
            body.append(f"@Unique({ts_string(unique['name'])}, [{columns}])")
        for index in table["indexes"]:
            writer["decorators"].add("Index")
            columns = ", ".join(ts_string(_referenced(view, item["name"], column)) for column in index["columns"])
            body.append(f"@Index({ts_string(index['name'])}, [{columns}])")
        body.extend([f"@Entity({{ name: {ts_string(table['name'])} }})", f"export class {item['name']} {{"])
        members = [
            *(_column_lines(attribute, writer) for attribute in item["attributes"]),
            *(_relation_lines(navigation, item, writer) for navigation in item["navigations"]),
        ]
        body.extend(["\n\n".join("\n".join(f"  {line}" for line in lines) for lines in members), "}"])
    header = [
        f"// TypeORM entities written by Model2DB from {context.title}. Review them before using them.",
        f"import {{ {', '.join(sorted(writer['decorators']))} }} from 'typeorm'",
    ]
    return "\n".join([*header, *body, ""])


def _quote(sql: str) -> str:
    return "`" + sql.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${") + "`"


def _migration_file(physical: dict, engine: str, context) -> tuple[str, str]:
    """A migration that creates the tables with the engine's own DDL and drops them on the way back."""
    bare = re.sub(r"\W", "", context.title, flags=re.ASCII)
    class_name = f"Create{bare}Schema1735689600000"
    up, down = schema_statements(physical, engine, context.title)
    content = "\n".join(
        [
            f"// Migration written by Model2DB from {context.title}: the schema as Model2DB writes it for this engine.",
            "import type { MigrationInterface, QueryRunner } from 'typeorm'",
            "",
            f"export class {class_name} implements MigrationInterface {{",
            "  async up(queryRunner: QueryRunner): Promise<void> {",
            *(f"    await queryRunner.query({_quote(sql)})" for sql in up),
            "  }",
            "",
            "  async down(queryRunner: QueryRunner): Promise<void> {",
            *(f"    await queryRunner.query({_quote(sql)})" for sql in down),
            "  }",
            "}",
            "",
        ]
    )
    return f"migrations/1735689600000-Create{bare}Schema.ts", content


class TypeOrmOutput:
    id = "typeorm"
    label = "TypeORM"
    group = "typescript"
    engines = ("postgresql", "mysql", "mariadb", "sqlite", "sqlserver", "oracle")
    migrations = True

    def write(self, physical: dict, context) -> list[dict]:
        engine = context.settings["engine"]
        view = build_entities(physical, context.schema, "camelCase")
        files = [
            generated_file(
                f"entities/{file_base(context.title)}.entities.ts", _entities_file(view, engine, context), "typescript"
            )
        ]
        if context.settings["migrations"]:
            name, content = _migration_file(physical, engine, context)
            files.append(generated_file(name, content, "typescript"))
        return files
