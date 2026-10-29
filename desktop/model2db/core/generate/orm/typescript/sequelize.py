"""Sequelize 6 models in TypeScript (`Model.init`), and a migration for sequelize-cli that runs the schema written
for the chosen engine. Mirrors web/src/core/generate/orm/typescript/sequelize.ts."""

from ....js import is_number, js_string
from ...sql.statements import schema_statements
from ...todos import todo_text
from ...types import file_base, generated_file
from ..entities import build_entities, enum_members
from .typescript import ts_enum, ts_key, ts_string, ts_type


def _enum_width(item: dict) -> int:
    longest = max([1, *(len(js_string(value)) for value in item["values"])])
    return 20 if longest <= 20 else 50 if longest <= 50 else 255


def _data_type(column_type: dict, engine: str, enums: list[dict]) -> str:
    kind = column_type["kind"]
    json_type = "DataTypes.JSONB" if engine == "postgresql" else "DataTypes.JSON"
    if kind in ("raw", "json"):
        return json_type
    if kind == "array":
        return f"DataTypes.ARRAY({_data_type(column_type['items'], engine, enums)})"
    if kind == "enum":
        item = next((candidate for candidate in enums if candidate["name"] == column_type["name"]), None)
        if not item:
            return "DataTypes.STRING"
        if all(is_number(value) for value in item["values"]):
            return "DataTypes.INTEGER"
        if item["storage"] == "native" and engine in ("postgresql", "mysql", "mariadb"):
            return f"DataTypes.ENUM({', '.join(ts_string(js_string(value)) for value in item['values'])})"
        return f"DataTypes.STRING({_enum_width(item)})"
    name, bits = column_type["name"], column_type.get("bits")
    if name == "string":
        length = column_type.get("length")
        return f"DataTypes.STRING({length})" if length else "DataTypes.TEXT"
    if name == "integer":
        if bits == 64:
            return "DataTypes.BIGINT"
        if bits in (8, 16):
            return "DataTypes.SMALLINT"
        return "DataTypes.INTEGER"
    if name == "float":
        return "DataTypes.FLOAT" if bits == 32 else "DataTypes.DOUBLE"
    if name == "decimal":
        precision = column_type.get("precision")
        scale = column_type.get("scale")
        return f"DataTypes.DECIMAL({18 if precision is None else precision}, {2 if scale is None else scale})"
    return {
        "boolean": "DataTypes.BOOLEAN",
        "date": "DataTypes.DATEONLY",
        "datetime": "DataTypes.DATE",
        "time": "DataTypes.TIME",
        "duration": "DataTypes.STRING(50)",
        "uuid": "DataTypes.UUID",
        "binary": "DataTypes.BLOB",
        "any": json_type,
    }[name]


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


def _declarations(item: dict, view: dict) -> list[str]:
    """`declare` lines of the class: the attributes and the associations, with what can be left out when creating."""
    lines = []
    for attribute in item["attributes"]:
        column = attribute["column"]
        type_text = ts_type(column["type"], view["enums"])
        if column["nullable"]:
            type_text = f"{type_text} | null"
        optional = column.get("generated") or column["nullable"] or column.get("defaultValue") is not None
        lines.append(
            f"  declare {ts_key(attribute['name'])}: {f'CreationOptional<{type_text}>' if optional else type_text}"
        )
    for navigation in item["navigations"]:
        if navigation["kind"] == "manyToOne":
            type_text = f"{navigation['target']}{' | null' if navigation['nullable'] else ''}"
        else:
            type_text = f"{navigation['target']}[]"
        lines.append(f"  declare {ts_key(navigation['name'])}?: NonAttribute<{type_text}>")
    return lines


def _attribute_line(attribute: dict, view: dict, engine: str) -> str:
    column = attribute["column"]
    settings = [f"type: {_data_type(column['type'], engine, view['enums'])}", f"field: {ts_string(column['name'])}"]
    if attribute["primaryKey"] or attribute["compositeKey"]:
        settings.append("primaryKey: true")
    if column.get("generated") == "identity":
        settings.append("autoIncrement: true")
    settings.append(f"allowNull: {'true' if column['nullable'] else 'false'}")
    if column.get("generated") == "uuid":
        settings.append("defaultValue: DataTypes.UUIDV4")
    if column.get("generated") == "now":
        settings.append("defaultValue: DataTypes.NOW")
    if column.get("defaultValue") is not None:
        value = _literal(column["defaultValue"], column, view["enums"])
        if value is not None:
            settings.append(f"defaultValue: {value}")
    enum_item = attribute.get("enum")
    if enum_item and enum_item["storage"] == "check":
        values = ", ".join(
            js_string(value) if is_number(value) else ts_string(js_string(value)) for value in enum_item["values"]
        )
        settings.append(f"validate: {{ isIn: [[{values}]] }}")
    return f"      {ts_key(attribute['name'])}: {{ {', '.join(settings)} }},"


def _association_lines(item: dict, view: dict) -> list[str]:
    lines = []

    def find_class(name: str) -> dict:
        return next(candidate for candidate in view["classes"] if candidate["name"] == name)

    def key(name: str, column: str) -> str:
        return next(
            (
                candidate["name"]
                for candidate in find_class(name)["attributes"]
                if candidate["column"]["name"] == column
            ),
            column,
        )

    for navigation in item["navigations"]:
        kind = navigation["kind"]
        name = ts_string(navigation["name"])
        if kind == "manyToOne":
            attribute = next(
                candidate for candidate in item["attributes"] if candidate["name"] == navigation["attribute"]
            )
            fk = attribute["foreignKey"]
            target_key = key(navigation["target"], fk["references"][0])
            on_delete = f", onDelete: {ts_string(fk['onDelete'].upper())}" if fk.get("onDelete") else ""
            lines.append(
                f"  {item['name']}.belongsTo({navigation['target']}, {{ as: {name}, "
                f"foreignKey: {ts_string(attribute['name'])}, targetKey: {ts_string(target_key)}{on_delete} }})"
            )
        elif kind == "oneToMany":
            target = find_class(navigation["target"])
            attribute = next(
                candidate for candidate in target["attributes"] if candidate["name"] == navigation["attribute"]
            )
            lines.append(
                f"  {item['name']}.hasMany({navigation['target']}, {{ as: {name}, "
                f"foreignKey: {ts_string(attribute['name'])} }})"
            )
        else:
            join = navigation["join"]
            first, second = join["table"]["foreignKeys"][0], join["table"]["foreignKeys"][1]
            owner_fk = first if join["ownerColumn"] == first["columns"][0] else second
            target_fk = second if owner_fk is first else first
            lines.append(
                f"  {item['name']}.belongsToMany({navigation['target']}, {{ as: {name}, "
                f"through: {ts_string(join['table']['name'])}, foreignKey: {ts_string(join['ownerColumn'])}, "
                f"otherKey: {ts_string(join['targetColumn'])}, "
                f"sourceKey: {ts_string(key(item['name'], owner_fk['references'][0]))}, "
                f"targetKey: {ts_string(key(navigation['target'], target_fk['references'][0]))}, timestamps: false }})"
            )
    return lines


def _models_file(view: dict, engine: str, context) -> str:
    body: list[str] = []
    for item in view["enums"]:
        if item["storage"] in ("check", "native"):
            body.extend(["", *ts_enum(item["name"], enum_members(item, context.schema))])
    for item in view["classes"]:
        body.append("")
        for todo in item["table"]["todos"]:
            body.append(f"// {todo_text(todo, item['table']['model'], 'table')}")
        name = item["name"]
        body.extend(
            [
                f"export class {name} extends Model<InferAttributes<{name}>, InferCreationAttributes<{name}>> {{",
                *_declarations(item, view),
                "}",
            ]
        )
    body.extend(
        [
            "",
            "/** Defines every model and its associations on a Sequelize instance. */",
            "export function initModels(sequelize: Sequelize): void {",
        ]
    )
    for item in view["classes"]:
        table = item["table"]
        indexes = [
            f"{{ name: {ts_string(index['name'])}, unique: {'true' if index['unique'] else 'false'}, "
            f"fields: [{', '.join(ts_string(column) for column in index['columns'])}] }}"
            for index in table["indexes"]
        ]
        uniques = [
            f"{{ name: {ts_string(unique['name'])}, unique: true, "
            f"fields: [{', '.join(ts_string(column) for column in unique['columns'])}] }}"
            for unique in table["uniques"]
        ]
        listed = [*uniques, *indexes]
        extra = f", indexes: [{', '.join(listed)}]" if listed else ""
        body.extend(
            [
                f"  {item['name']}.init(",
                "    {",
                *(_attribute_line(attribute, view, engine) for attribute in item["attributes"]),
                "    },",
                f"    {{ sequelize, tableName: {ts_string(table['name'])}, timestamps: false{extra} }},",
                "  )",
            ]
        )
    for item in view["classes"]:
        body.extend(_association_lines(item, view))
    body.append("}")
    uses_non_attribute = any(item["navigations"] for item in view["classes"])
    header = [
        f"// Sequelize models written by Model2DB from {context.title}. Review them before using them.",
        "import { DataTypes, Model, Sequelize, type CreationOptional, type InferAttributes, "
        f"type InferCreationAttributes{', type NonAttribute' if uses_non_attribute else ''} }} from 'sequelize'",
    ]
    return "\n".join([*header, *body, ""])


def _quote(sql: str) -> str:
    return "`" + sql.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${") + "`"


def _migration_file(physical: dict, engine: str, context) -> str:
    """A sequelize-cli migration that creates the tables with the engine's own DDL and drops them on the way back."""
    up, down = schema_statements(physical, engine, context.title)
    return "\n".join(
        [
            f"// Migration written by Model2DB from {context.title}: the schema as Model2DB writes it for this engine.",
            "'use strict'",
            "",
            "const UP = [",
            *(f"  {_quote(sql)}," for sql in up),
            "]",
            "",
            "const DOWN = [",
            *(f"  {_quote(sql)}," for sql in down),
            "]",
            "",
            "/** @type {import('sequelize-cli').Migration} */",
            "module.exports = {",
            "  async up(queryInterface) {",
            "    for (const sql of UP) await queryInterface.sequelize.query(sql)",
            "  },",
            "  async down(queryInterface) {",
            "    for (const sql of DOWN) await queryInterface.sequelize.query(sql)",
            "  },",
            "}",
            "",
        ]
    )


class SequelizeOutput:
    id = "sequelize"
    label = "Sequelize"
    group = "typescript"
    engines = ("postgresql", "mysql", "mariadb", "sqlite", "sqlserver", "oracle")
    migrations = True

    def write(self, physical: dict, context) -> list[dict]:
        engine = context.settings["engine"]
        view = build_entities(physical, context.schema, "camelCase")
        base = file_base(context.title)
        files = [generated_file(f"models/{base}.models.ts", _models_file(view, engine, context), "typescript")]
        if context.settings["migrations"]:
            files.append(
                generated_file(
                    f"migrations/20250101000000-create-{base.replace('_', '-')}-schema.js",
                    _migration_file(physical, engine, context),
                    "javascript",
                )
            )
        return files
