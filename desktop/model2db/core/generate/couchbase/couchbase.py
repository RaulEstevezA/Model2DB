"""Writes SQL++ for Couchbase: one collection per stored model in the bucket's default scope, then their
indexes. Couchbase makes collections in the background, so the indexes go in a second file, run once the
first one has finished. It checks no document shape, so each collection's shape is written as a comment; it
has no unique indexes either, so those become plain ones and a note. Mirrors
web/src/core/generate/couchbase/couchbase.ts."""

from ..mongodb.mongodb import json_scalar
from ..todos import todo_text
from ..types import WriteContext, generated_file

BUCKET = "app"
SCOPE = "_default"


def _q(name: str) -> str:
    return "`" + name.replace("`", "``") + "`"


def _keyspace(collection: str) -> str:
    return f"{_q(BUCKET)}.{_q(SCOPE)}.{_q(collection)}"


class CouchbaseOutput:
    id = "couchbase"
    label = "Couchbase"
    group = "document"

    def write(self, physical: dict, context: WriteContext) -> list[dict]:
        for collection in physical["collections"]:
            for index in collection["indexes"]:
                if index["unique"] and index["columns"][0] != "_id":
                    field = f"{collection['model']}.{index['columns'][0]}"
                    context.note({"code": "uniqueInApplication", "params": {"database": "Couchbase", "field": field}})
        indexes = indexes_script(physical, context.title)
        files = [
            generated_file("1-collections.sql", collections_script(physical, context.title, indexes is not None), "sql")
        ]
        if indexes:
            files.append(generated_file("2-indexes.sql", indexes, "sql"))
        return files


def _header(title: str, what: str) -> list[str]:
    return [
        f"-- Couchbase {what} written by Model2DB from {title}. Run it with cbq or the Query Workbench.",
        "-- Review it before running it: nothing here has been run.",
        f"-- The bucket “{BUCKET}” must exist: rename it here if yours is called otherwise.",
    ]


def collections_script(schema: dict, title: str, indexes: bool) -> str:
    out = [*_header(title, "collections")]
    if indexes:
        out.append("-- Then run 2-indexes.sql, once these collections exist.")
    for collection in schema["collections"]:
        out.append("")
        out.extend(f"-- {todo_text(todo, collection['model'], 'collection')}" for todo in collection["todos"])
        out.extend(_shape_comment(collection))
        out.append(f"CREATE COLLECTION {_keyspace(collection['name'])} IF NOT EXISTS;")
    return "\n".join(out) + "\n"


def indexes_script(schema: dict, title: str) -> str | None:
    """The indexes, or None when there are none: every document is found by its key already."""
    out = [*_header(title, "indexes"), "-- Run it after 1-collections.sql."]
    count = 0
    for collection in schema["collections"]:
        indexes = [index for index in collection["indexes"] if index["columns"][0] != "_id"]
        if indexes:
            out.extend(["", f"-- “{collection['name']}”"])
        for index in indexes:
            if index["unique"]:
                out.append(
                    f"-- Couchbase has no unique indexes: check that “{index['columns'][0]}” is unique before saving."
                )
            keys = ", ".join(_index_key(column, collection["validator"]) for column in index["columns"])
            out.append(f"CREATE INDEX {_q(index['name'])} IF NOT EXISTS ON {_keyspace(collection['name'])}({keys});")
            count += 1
    return "\n".join(out) + "\n" if count > 0 else None


def _index_key(column: str, validator: dict) -> str:
    """A path for an index; one that goes through a list indexes every item (`DISTINCT ARRAY ... END`)."""
    parts = column.split(".")
    schema = validator
    for i, part in enumerate(parts):
        schema = (schema or {}).get("properties", {}).get(part)
        if schema and _is_array(schema):
            listed = ".".join(_q(name) for name in parts[: i + 1])
            rest = parts[i + 1 :]
            item = "item." + ".".join(_q(name) for name in rest) if rest else "item"
            return f"DISTINCT ARRAY {item} FOR item IN {listed} END"
    return ".".join(_q(name) for name in parts)


def _types(schema: dict) -> list[str]:
    bson = schema.get("bsonType")
    if bson is None:
        return []
    return bson if isinstance(bson, list) else [bson]


def _is_array(schema: dict) -> bool:
    return "array" in _types(schema)


JSON_TYPES = {
    "string": "text",
    "int": "number",
    "long": "number",
    "double": "number",
    "decimal": "number",
    "bool": "true or false",
    "date": "date (ISO 8601 text)",
    "objectId": "key of a document",
    "binData": "base64 text",
}


def _shape_comment(collection: dict) -> list[str]:
    """The fields of the collection's documents, as comments."""
    properties = collection["validator"].get("properties") or {}
    id_schema = properties.get("_id") or {}
    key = (
        "a UUID made by the application"
        if "objectId" in _types(id_schema)
        else "the value of the model's key field, written as text"
    )
    lines = [f"-- Each document of “{collection['name']}” is stored under a key: {key}. Its fields:"]

    def write(schema: dict, indent: str) -> None:
        required = set(schema.get("required") or [])
        for name, field in (schema.get("properties") or {}).items():
            if name == "_id" and indent == "--   ":
                continue
            lines.append(f"{indent}{name}{'' if name in required else '?'}: {_describe(field)}")
            inner = field.get("items") if _is_array(field) else field
            if inner is not None and inner.get("properties") is not None:
                write(inner, f"{indent}  ")

    write(collection["validator"], "--   ")
    return lines


def _describe(schema: dict) -> str:
    if "enum" in schema:
        return " | ".join(json_scalar(value) for value in schema["enum"])
    names = _types(schema)
    nullable = "null" in names
    main = [name for name in names if name != "null"]
    if not main:
        text = "any value"
    elif main[0] == "array":
        items = schema.get("items")
        text = f"list of {_plural(_describe(items))}" if items is not None else "list"
    elif main[0] == "object":
        text = "object" if schema.get("properties") is not None else "object with any fields"
    else:
        text = " or ".join(JSON_TYPES.get(name, name) for name in main)
    return f"{text} or null" if nullable else text


def _plural(text: str) -> str:
    return "objects" if text == "object" else text
