"""Mongoose schemas and models in TypeScript: a schema per embedded model (`_id: false`), a model per collection,
references by the referenced document's `_id`. Mirrors web/src/core/generate/odm/mongoose.ts."""

import re

from ...js import coalesce, is_number, js_string
from ..orm.typescript.typescript import ts_string
from ..todos import todo_text
from ..types import file_base, generated_file
from .documents import build_document_view

_IDENTIFIER = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")


def _schema_type(type_ref: dict) -> str:
    if type_ref["kind"] == "enum":
        return "String"
    if type_ref["kind"] != "primitive":
        return "Schema.Types.Mixed"
    return {
        "integer": "Number",
        "float": "Number",
        "decimal": "Schema.Types.Decimal128",
        "boolean": "Boolean",
        "date": "Date",
        "datetime": "Date",
        "uuid": "Schema.Types.UUID",
        "binary": "Buffer",
        "any": "Schema.Types.Mixed",
    }.get(type_ref["name"], "String")


def _schema_variable(name: str) -> str:
    return f"{name[:1].lower()}{name[1:]}Schema"


def _id_type(view: dict, target: str) -> str:
    """The type of the `_id` other documents store to refer to a class."""
    item = next((candidate for candidate in view["classes"] if candidate["name"] == target), None)
    found = next((field for field in item["fields"] if field["id"]), None) if item else None
    return _schema_type(found["type"]) if found else "Schema.Types.ObjectId"


def _field_definition(field: dict, view: dict) -> str:
    kind = field["kind"]
    if kind == "embedded":
        definition = _schema_variable(field["target"])
    elif kind == "reference":
        definition = f"{{ type: {_id_type(view, field['target'])}, ref: {ts_string(field['target'])} }}"
    elif kind == "map":
        definition = f"{{ type: Map, of: {_schema_type(field['type'])} }}"
    elif kind == "free":
        definition = "Schema.Types.Mixed"
    else:
        definition = _schema_type(field["type"])
    if field["many"]:
        definition = f"[{definition}]"
    plain = not field["many"] and kind in ("value", "embedded")
    if not plain:
        return definition
    settings = []
    if field["required"] and not field["id"]:
        settings.append("required: true")
    if field.get("enum"):
        values = []
        for value in field["enum"]["values"]:
            stored = coalesce(value.get("value"), value["name"])
            values.append(js_string(value["value"]) if is_number(stored) else ts_string(js_string(stored)))
        settings.append(f"enum: [{', '.join(values)}]")
    if field["nullable"]:
        settings.append("default: null")
    return f"{{ type: {definition}, {', '.join(settings)} }}" if settings else definition


def _schema_block(item: dict, view: dict) -> list[str]:
    variable = _schema_variable(item["name"])
    lines = [f"const {variable} = new Schema(", "  {"]
    for field in item["fields"]:
        key = "_id" if field["id"] else field["stored"]
        lines.append(f"    {key if _IDENTIFIER.match(key) else ts_string(key)}: {_field_definition(field, view)},")
    collection = item.get("collection")
    options = [f"collection: {ts_string(collection['name'])}", "versionKey: false"] if collection else ["_id: false"]
    lines.extend(["  },", f"  {{ {', '.join(options)} }},", ")"])
    for index in collection["indexes"] if collection else []:
        keys = ", ".join(f"{ts_string(column)}: 1" for column in index["columns"])
        unique = ", unique: true" if index["unique"] else ""
        lines.append(f"{variable}.index({{ {keys} }}, {{ name: {ts_string(index['name'])}{unique} }})")
    return lines


def _declaration_order(view: dict) -> list[dict]:
    """Schemas in an order where each comes after the embedded schemas it uses as values."""
    done: set[str] = set()
    result: list[dict] = []

    def visit(item: dict, path: set[str]) -> None:
        if item["name"] in done or item["name"] in path:
            return
        path.add(item["name"])
        for field in item["fields"]:
            target = (
                next((candidate for candidate in view["classes"] if candidate["name"] == field.get("target")), None)
                if field["kind"] == "embedded"
                else None
            )
            if target:
                visit(target, path)
        done.add(item["name"])
        result.append(item)

    for item in view["classes"]:
        visit(item, set())
    return result


def _models_file(view: dict, context) -> str:
    body: list[str] = []
    for item in _declaration_order(view):
        body.append("")
        for todo in item["todos"]:
            body.append(f"// {todo_text(todo, item['name'], 'collection')}")
        body.extend(_schema_block(item, view))
    body.append("")
    for item in view["classes"]:
        if item.get("collection"):
            body.append(
                f"export const {item['name']} = model({ts_string(item['name'])}, {_schema_variable(item['name'])})"
            )
    return "\n".join(
        [
            f"// Mongoose schemas written by Model2DB from {context.title}. Review them before using them.",
            "import { Schema, model } from 'mongoose'",
            *body,
            "",
        ]
    )


class MongooseOutput:
    id = "mongoose"
    label = "Mongoose"
    group = "typescript"

    def write(self, physical: dict, context) -> list[dict]:
        view = build_document_view(context.schema, context.design, physical, context.settings["naming"])
        return [
            generated_file(f"models/{file_base(context.title)}.models.ts", _models_file(view, context), "typescript")
        ]
