"""Pieces of TypeScript shared by the TypeScript generators. Mirrors
web/src/core/generate/orm/typescript/typescript.ts."""

import re

from ....js import is_number, js_string

_IDENTIFIER = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")


def ts_string(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def ts_key(name: str) -> str:
    """A property key as written in an object literal: bare when it can be."""
    return name if _IDENTIFIER.match(name) else ts_string(name)


def ts_type(column_type: dict, enums: list[dict]) -> str:
    """The TypeScript type of a column's values as the drivers return them: BIGINT and DECIMAL come as text, so
    they do not lose precision."""
    kind = column_type["kind"]
    if kind in ("raw", "json"):
        return "unknown"
    if kind == "array":
        return f"{ts_type(column_type['items'], enums)}[]"
    if kind == "enum":
        item = next((candidate for candidate in enums if candidate["name"] == column_type["name"]), None)
        if item and item["storage"] in ("check", "native"):
            return item["name"]
        return "number" if item and all(is_number(value) for value in item["values"]) else "string"
    name = column_type["name"]
    if name == "integer":
        return "string" if column_type.get("bits") == 64 else "number"
    return {
        "float": "number",
        "decimal": "string",
        "boolean": "boolean",
        "date": "Date",
        "datetime": "Date",
        "binary": "Buffer",
        "any": "unknown",
    }.get(name, "string")


def ts_enum(name: str, members: list[dict]) -> list[str]:
    """`export enum OrderStatus { Paid = 'paid' }` for the enums stored as their own type or with a CHECK."""
    return [
        f"export enum {name} {{",
        *(
            f"  {ts_key(member['name'])} = "
            f"{js_string(member['value']) if is_number(member['value']) else ts_string(member['value'])},"
            for member in members
        ),
        "}",
    ]


def camel_from_snake(name: str) -> str:
    """`order_id` → `orderId`, as `name.replace(/_(\\w)/g, …)` does."""
    return re.sub(r"_(\w)", lambda match: match.group(1).upper(), name, flags=re.ASCII)
