"""Writes a mongosh script that creates each collection with its `$jsonSchema` validator and indexes. Mirrors
web/src/core/generate/mongodb/mongodb.ts."""

import re

from ...js import is_number, json_string, number_text
from ..todos import todo_text

_IDENTIFIER = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")


def json_scalar(value) -> str:
    """JSON.stringify of a value that is not an object or a list."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if is_number(value):
        return number_text(value)
    return json_string(value)


def _key(key: str) -> str:
    return key if _IDENTIFIER.match(key) else json_string(key)


def to_js(value, indent: str) -> str:
    """JSON with the keys of a JavaScript object literal: unquoted when they are plain names."""
    if isinstance(value, list):
        if all(not isinstance(item, (dict, list)) for item in value):
            return f"[{', '.join(json_scalar(item) for item in value)}]"
        items = ",\n".join(f"{indent}  {to_js(item, indent + '  ')}" for item in value)
        return f"[\n{items},\n{indent}]"
    if isinstance(value, dict):
        if not value:
            return "{}"
        lines = ",\n".join(f"{indent}  {_key(key)}: {to_js(item, indent + '  ')}" for key, item in value.items())
        return f"{{\n{lines},\n{indent}}}"
    return json_scalar(value)


def generate_mongo(schema: dict, title: str | None = None) -> str:
    out = [
        f"// MongoDB collections written by Model2DB{f' from {title}' if title else ''}. Run it with mongosh.",
        "// Review it before running it: nothing here has been run.",
    ]
    for collection in schema["collections"]:
        out.append("")
        for todo in collection["todos"]:
            out.append(f"// {todo_text(todo, collection['model'], 'collection')}")
        name = json_string(collection["name"])
        out.extend(
            [
                f"db.createCollection({name}, {{",
                f"  validator: {{ $jsonSchema: {to_js(collection['validator'], '  ')} }},",
                "})",
            ]
        )
        for index in collection["indexes"]:
            keys = "{ " + ", ".join(f"{_key(column)}: 1" for column in index["columns"]) + " }"
            settings = f"{{ name: {json_string(index['name'])}{', unique: true' if index['unique'] else ''} }}"
            out.append(f"db.getCollection({name}).createIndex({keys}, {settings})")
    return "\n".join(out) + "\n"
