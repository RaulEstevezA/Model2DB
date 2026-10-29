"""Pieces of PHP shared by the PHP generators. Mirrors web/src/core/generate/orm/php/php.ts."""

import re

from ....js import is_number, js_string
from ....model.naming import to_pascal_case


def php_string(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def is_backed_enum(item: dict) -> bool:
    """Enums written as PHP backed enums: text values, stored with a CHECK or the database's enum type."""
    return item["storage"] in ("check", "native") and all(isinstance(value, str) for value in item["values"])


def php_type(column_type: dict, enums: list[dict]) -> str:
    """The PHP type of a column's values. Decimals are strings, as PDO returns them."""
    kind = column_type["kind"]
    if kind in ("raw", "json", "array"):
        return "array"
    if kind == "enum":
        item = next((candidate for candidate in enums if candidate["name"] == column_type["name"]), None)
        if item and is_backed_enum(item):
            return item["name"]
        return "int" if item and all(is_number(value) for value in item["values"]) else "string"
    return {
        "integer": "int",
        "float": "float",
        "boolean": "bool",
        "date": "\\DateTimeImmutable",
        "datetime": "\\DateTimeImmutable",
        "any": "mixed",
    }.get(column_type["name"], "string")


def case_name(value: str) -> str:
    name = re.sub(r"\W", "", to_pascal_case(value), flags=re.ASCII)
    return f"Value{name}" if re.match(r"^\d", name) or name == "" else name


def backed_enum(namespace: str, name: str, values: list) -> str:
    """`enum OrderStatus: string { case Paid = 'paid'; }`"""
    return "\n".join(
        [
            "<?php",
            "",
            f"namespace {namespace};",
            "",
            f"enum {name}: string",
            "{",
            *(f"    case {case_name(js_string(value))} = {php_string(js_string(value))};" for value in values),
            "}",
            "",
        ]
    )


def sql_literal(sql: str, indent: str) -> str:
    """A PHP string literal of an SQL statement, as a nowdoc so nothing inside is interpolated."""
    body = "\n".join(f"{indent}{line}" for line in sql.split("\n"))
    return f"<<<'SQL'\n{body}\n{indent}SQL"
