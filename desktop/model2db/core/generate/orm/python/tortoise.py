"""Tortoise ORM models. Tortoise has no composite primary keys and creates no CHECK for enums: both are said in
the result's notes. Aerich writes the migrations from the models (`aerich init-db`), so none is written here.
Mirrors web/src/core/generate/orm/python/tortoise.ts."""

import re

from ....js import is_number, js_string
from ...todos import todo_text
from ...types import generated_file
from ..entities import build_entities, enum_members
from .python import py_identifier, py_string, python_enum

APP = "models"
ON_DELETE = {"cascade": "fields.CASCADE", "set null": "fields.SET_NULL"}


def _enum_length(item: dict) -> int:
    longest = max([1, *(len(js_string(value)) for value in item["values"])])
    return 20 if longest <= 20 else 50 if longest <= 50 else 255


def _py_value(value) -> str:
    return js_string(value) if is_number(value) else py_string(js_string(value))


def _literal(value, column: dict, enums: list[dict]) -> str:
    if value is None:
        return "None"
    if isinstance(value, bool):
        return "True" if value else "False"
    if is_number(value):
        return js_string(value)
    item = (
        next((candidate for candidate in enums if candidate["name"] == column["type"]["name"]), None)
        if column["type"]["kind"] == "enum"
        else None
    )
    stored = (
        next((candidate for candidate in item["values"] if js_string(candidate).lower() == value.lower()), None)
        if item
        else None
    )
    # Enum fields take a member of the Python enum, built from its stored value
    if item and item["storage"] in ("check", "native") and stored is not None:
        return f"{py_identifier(item['name'])}({_py_value(stored)})"
    if is_number(stored):
        return js_string(stored)
    return py_string(js_string(value if stored is None else stored))


def _field_type(column_type: dict, enums: list[dict]) -> tuple[str, list[str]]:
    """The Tortoise field class and its type arguments for a column."""
    kind = column_type["kind"]
    if kind in ("raw", "json", "array"):
        return "fields.JSONField", []
    if kind == "enum":
        item = next((candidate for candidate in enums if candidate["name"] == column_type["name"]), None)
        if not item:
            return "fields.CharField", ["max_length=255"]
        numeric = all(is_number(value) for value in item["values"])
        if item["storage"] in ("lookup", "text"):
            return ("fields.IntField", []) if numeric else ("fields.CharField", [f"max_length={_enum_length(item)}"])
        if numeric:
            return "fields.IntEnumField", [py_identifier(item["name"])]
        return "fields.CharEnumField", [py_identifier(item["name"]), f"max_length={_enum_length(item)}"]
    name, bits = column_type["name"], column_type.get("bits")
    if name == "string":
        length = column_type.get("length")
        return ("fields.CharField", [f"max_length={length}"]) if length else ("fields.TextField", [])
    if name == "integer":
        if bits == 64:
            return "fields.BigIntField", []
        if bits in (8, 16):
            return "fields.SmallIntField", []
        return "fields.IntField", []
    if name == "decimal":
        precision = column_type.get("precision")
        scale = column_type.get("scale")
        return "fields.DecimalField", [
            f"max_digits={18 if precision is None else precision}",
            f"decimal_places={2 if scale is None else scale}",
        ]
    return {
        "float": "fields.FloatField",
        "boolean": "fields.BooleanField",
        "date": "fields.DateField",
        "datetime": "fields.DatetimeField",
        "time": "fields.TimeField",
        "duration": "fields.TimeDeltaField",
        "uuid": "fields.UUIDField",
        "binary": "fields.BinaryField",
        "any": "fields.JSONField",
    }[name], []


def _many_to_one(item: dict, attribute: dict) -> dict | None:
    return next(
        (
            candidate
            for candidate in item["navigations"]
            if candidate["kind"] == "manyToOne" and candidate.get("attribute") == attribute["name"]
        ),
        None,
    )


def _field_lines(item: dict, view: dict) -> list[str]:
    lines = []
    for attribute in item["attributes"]:
        # Tortoise adds its own `id` to tables with a composite key; the parts stay ordinary fields
        line = (
            _foreign_key_line(attribute, item, view) if attribute.get("foreignKey") else _scalar_line(attribute, view)
        )
        if line:
            lines.append(f"    {line}")
    for navigation in item["navigations"]:
        join = navigation.get("join")
        # A many-to-many list is declared once, on the side that owns the join table
        if (
            navigation["kind"] != "manyToMany"
            or not join
            or join["ownerColumn"] != join["table"]["foreignKeys"][0]["columns"][0]
        ):
            continue
        settings = [
            py_string(f"{APP}.{navigation['target']}"),
            f"through={py_string(join['table']['name'])}",
            f"forward_key={py_string(join['targetColumn'])}",
            f"backward_key={py_string(join['ownerColumn'])}",
            f"related_name={py_string(navigation['inverse']) if navigation.get('inverse') else 'False'}",
            "on_delete=fields.CASCADE",
        ]
        lines.append(f"    {py_identifier(navigation['name'])} = fields.ManyToManyField({', '.join(settings)})")
    return lines


def _scalar_line(attribute: dict, view: dict) -> str:
    column = attribute["column"]
    type_name, type_args = _field_type(column["type"], view["enums"])
    # TextField cannot be a key, unique or indexed in Tortoise: a bounded text can
    if type_name == "fields.TextField" and (attribute["primaryKey"] or attribute["unique"] or attribute["indexed"]):
        type_name, type_args = "fields.CharField", ["max_length=255"]
    settings = [*type_args]
    if attribute["primaryKey"]:
        settings.append("primary_key=True")
        # Tortoise numbers integer keys itself unless told not to
        if (
            column["type"]["kind"] == "primitive"
            and column["type"]["name"] == "integer"
            and column.get("generated") != "identity"
        ):
            settings.append("generated=False")
    if column["nullable"]:
        settings.append("null=True")
    if attribute["unique"]:
        settings.append("unique=True")
    if attribute["indexed"] and not attribute["unique"]:
        settings.append("db_index=True")
    if column.get("generated") == "now":
        settings.append("auto_now_add=True")
    if column.get("defaultValue") is not None:
        settings.append(f"default={_literal(column['defaultValue'], column, view['enums'])}")
    if attribute["name"] != column["name"]:
        settings.append(f"source_field={py_string(column['name'])}")
    return f"{py_identifier(attribute['name'])} = {type_name}({', '.join(settings)})"


def _foreign_key_line(attribute: dict, item: dict, view: dict) -> str | None:
    fk = attribute["foreignKey"]
    target = next((candidate for candidate in view["classes"] if candidate["table"]["name"] == fk["table"]), None)
    if not target:
        return None
    navigation = _many_to_one(item, attribute)
    # Tortoise names the attribute after the related object and adds `_id` for the column
    name = navigation["name"] if navigation else re.sub(r"_id$", "", attribute["name"])
    inverse = navigation.get("inverse") if navigation else None
    settings = [
        py_string(f"{APP}.{target['name']}"),
        f"related_name={py_string(inverse) if inverse else 'False'}",
        f"on_delete={ON_DELETE[fk['onDelete']] if fk.get('onDelete') else 'fields.RESTRICT'}",
    ]
    if attribute["column"]["nullable"]:
        settings.append("null=True")
    if attribute["primaryKey"]:
        settings.append("primary_key=True")
    if attribute["unique"]:
        settings.append("unique=True")
    if attribute["indexed"] and not attribute["unique"]:
        settings.append("db_index=True")
    if f"{name}_id" != attribute["column"]["name"]:
        settings.append(f"source_field={py_string(attribute['column']['name'])}")
    return f"{py_identifier(name)} = fields.ForeignKeyField({', '.join(settings)})"


def _models_file(view: dict, context) -> str:
    body: list[str] = []
    enums = [item for item in view["enums"] if item["storage"] in ("check", "native")]
    for item in enums:
        members = enum_members(item, context.schema)
        numeric = all(is_number(member["value"]) for member in members)
        lines = python_enum(item["name"], members)
        lines[0] = lines[0].replace("(enum.Enum)", "(enum.IntEnum)" if numeric else "(str, enum.Enum)", 1)
        body.extend(["", "", *lines])
        context.note({"code": "enumCheckedInCode", "params": {"enum": item["name"], "orm": "Tortoise ORM"}})
    for item in view["classes"]:
        table = item["table"]
        body.extend(["", ""])
        for todo in table["todos"]:
            body.append(f"# {todo_text(todo, table['model'], 'table')}")
        body.extend(
            [
                f"class {item['name']}(Model):",
                *_field_lines(item, view),
                "",
                "    class Meta:",
                f"        table = {py_string(table['name'])}",
            ]
        )
        if len(table["primaryKey"]) > 1:
            names = []
            for column in table["primaryKey"]:
                attribute = next(candidate for candidate in item["attributes"] if candidate["column"]["name"] == column)
                navigation = _many_to_one(item, attribute)
                if navigation:
                    names.append(navigation["name"])
                else:
                    names.append(
                        re.sub(r"_id$", "", attribute["name"]) if attribute.get("foreignKey") else attribute["name"]
                    )
            body.append(f"        unique_together = (({', '.join(py_string(name) for name in names)}),)")
            context.note(
                {
                    "code": "compositeKeyAsId",
                    "params": {
                        "orm": "Tortoise ORM",
                        "table": table["name"],
                        "columns": ", ".join(table["primaryKey"]),
                    },
                }
            )
    header = [
        f'"""Tortoise ORM models written by Model2DB from {context.title}. Register them as the "{APP}" app.',
        "",
        "Create the tables with Aerich (`aerich init-db`) or `Tortoise.generate_schemas()`. "
        "Review them before using them.",
        '"""',
        "",
        *(["import enum", ""] if enums else []),
        "from tortoise import fields",
        "from tortoise.models import Model",
    ]
    return "\n".join([*header, *body, ""])


class TortoiseOutput:
    id = "tortoise"
    label = "Tortoise ORM"
    group = "python"
    engines = ("postgresql", "mysql", "mariadb", "sqlite", "sqlserver", "oracle")

    def write(self, physical: dict, context) -> list[dict]:
        view = build_entities(physical, context.schema, "snake_case")
        return [generated_file("models.py", _models_file(view, context), "python")]
