"""Pieces of Python shared by the Python generators. Mirrors web/src/core/generate/orm/python/python.ts."""

import re

from ....js import is_number, js_string
from ....physical.order import order_tables as _order_with_cycles

KEYWORDS = set(
    """
    False None True and as assert async await break class continue def del elif else except finally for from global
    if import in is lambda nonlocal not or pass raise return try while with yield type match case
    """.split()
)


def py_identifier(name: str) -> str:
    """A valid Python name: keywords get a trailing underscore (`class_`)."""
    clean = re.sub(r"^(\d)", r"_\1", re.sub(r"[^\w]", "_", name, flags=re.ASCII))
    return f"{clean}_" if clean in KEYWORDS else clean


def py_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def python_enum(name: str, members: list[dict]) -> list[str]:
    """`class OrderStatus(enum.Enum)` with the stored values."""
    lines = [
        f"    {py_identifier(member['name'].upper())} = "
        + (js_string(member["value"]) if is_number(member["value"]) else py_string(member["value"]))
        for member in members
    ]
    return [f"class {py_identifier(name)}(enum.Enum):", *(lines or ["    pass"])]


def order_tables(tables: list[dict]) -> list[dict]:
    """Tables in creation order: each after the ones it refers to."""
    return _order_with_cycles(tables)[0]
