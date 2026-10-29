"""Python pieces shared by the document writers. Mirrors web/src/core/generate/odm/python/pythonTypes.ts."""

from ....js import coalesce, is_number, js_string
from ...orm.python.python import py_identifier, py_string


def python_value_type(type_ref: dict) -> tuple[str, list[str]]:
    """The Python type of a value (`datetime.datetime`, `decimal.Decimal`), and the modules it needs."""
    if type_ref["kind"] == "enum":
        return py_identifier(type_ref["name"]), []
    if type_ref["kind"] != "primitive":
        return "Any", ["typing"]
    return {
        "string": ("str", []),
        "integer": ("int", []),
        "float": ("float", []),
        "decimal": ("decimal.Decimal", ["decimal"]),
        "boolean": ("bool", []),
        "date": ("datetime.datetime", ["datetime"]),
        "datetime": ("datetime.datetime", ["datetime"]),
        "uuid": ("uuid.UUID", ["uuid"]),
        "binary": ("bytes", []),
        "time": ("str", []),
        "duration": ("str", []),
        "any": ("Any", ["typing"]),
    }[type_ref["name"]]


def python_literal(value, indent: str = "") -> str:
    """A JSON value as a Python literal: `true` → `True`, `null` → `None`."""
    if value is None:
        return "None"
    if value is True:
        return "True"
    if value is False:
        return "False"
    if is_number(value):
        return js_string(value)
    if isinstance(value, str):
        return py_string(value)
    if isinstance(value, list):
        if all(not isinstance(item, (dict, list)) for item in value):
            return f"[{', '.join(python_literal(item) for item in value)}]"
        items = "\n".join(f"{indent}    {python_literal(item, indent + '    ')}," for item in value)
        return f"[\n{items}\n{indent}]"
    if not value:
        return "{}"
    entries = "\n".join(
        f"{indent}    {py_string(key)}: {python_literal(item, indent + '    ')}," for key, item in value.items()
    )
    return f"{{\n{entries}\n{indent}}}"


def python_str_enum(item: dict) -> list[str]:
    """`class OrderStatus(str, enum.Enum)` with the stored values."""
    numeric = all(is_number(value.get("value")) for value in item["values"])
    lines = [f"class {py_identifier(item['name'])}({'enum.IntEnum' if numeric else 'str, enum.Enum'}):"]
    for value in item["values"]:
        stored = coalesce(value.get("value"), value["name"])
        literal = js_string(stored) if is_number(stored) else py_string(stored)
        lines.append(f"    {py_identifier(js_string(value['name']).upper())} = {literal}")
    return lines
