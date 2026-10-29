"""SQLAlchemy column types, column settings and relationships, shared by the SQLAlchemy and SQLModel writers and
by the Alembic migration. Mirrors web/src/core/generate/orm/python/sqlalchemyTypes.ts."""

from ....js import is_number, js_string
from .python import py_identifier, py_string


def _parts(sql: str, python: str, imports: list[str], modules: list[str] | None = None) -> dict:
    return {"sql": sql, "python": python, "imports": imports, "modules": modules or []}


def _enum_length(item: dict) -> int:
    longest = max([1, *(len(js_string(value)) for value in item["values"])])
    return 20 if longest <= 20 else 50 if longest <= 50 else 255


def type_parts(column_type: dict, enums: list[dict], migration: bool, identity: bool = False) -> dict:
    """`identity`: the column is a key the database numbers; SQLite only does that for INTEGER, so a BIGINT key
    uses its INTEGER variant there."""
    kind = column_type["kind"]
    if kind == "raw":
        return _parts(f"text({py_string(column_type['sql'])})", "Any", ["text"], ["typing"])
    if kind == "json":
        return _parts("JSON", "Any", ["JSON"], ["typing"])
    if kind == "array":
        inner = type_parts(column_type["items"], enums, migration)
        return _parts(
            f"ARRAY({inner['sql']})", f"list[{inner['python']}]", ["ARRAY", *inner["imports"]], inner["modules"]
        )
    if kind == "enum":
        item = next((candidate for candidate in enums if candidate["name"] == column_type["name"]), None)
        if not item:
            return _parts("String(255)", "str", ["String"])
        numeric = all(is_number(value) for value in item["values"])
        if item["storage"] in ("lookup", "text"):
            return (
                _parts("Integer", "int", ["Integer"])
                if numeric
                else _parts(f"String({_enum_length(item)})", "str", ["String"])
            )
        # In the migration the values are written out; in the models the Python enum gives them
        source = ", ".join(py_string(js_string(value)) for value in item["values"]) if migration else item["name"]
        settings = (
            f"name={py_string(item['sqlName'])}"
            if item["storage"] == "native"
            else f"native_enum=False, create_constraint=True, length={_enum_length(item)}, "
            f"name={py_string('ck_' + item['sqlName'])}"
        )
        callable_ = "" if migration else ", values_callable=enum_values"
        return _parts(f"Enum({source}, {settings}{callable_})", item["name"], ["Enum"])
    name, bits = column_type["name"], column_type.get("bits")
    if name == "string":
        length = column_type.get("length")
        return _parts(f"String({length})", "str", ["String"]) if length else _parts("Text", "str", ["Text"])
    if name == "integer":
        if bits == 64 and identity:
            return _parts('BigInteger().with_variant(Integer(), "sqlite")', "int", ["BigInteger", "Integer"])
        if bits == 64:
            return _parts("BigInteger", "int", ["BigInteger"])
        if bits in (8, 16):
            return _parts("SmallInteger", "int", ["SmallInteger"])
        return _parts("Integer", "int", ["Integer"])
    if name == "float":
        return _parts("Float", "float", ["Float"]) if bits == 32 else _parts("Double", "float", ["Double"])
    if name == "decimal":
        precision = column_type.get("precision")
        scale = column_type.get("scale")
        return _parts(
            f"Numeric({18 if precision is None else precision}, {2 if scale is None else scale})",
            "decimal.Decimal",
            ["Numeric"],
            ["decimal"],
        )
    return {
        "boolean": lambda: _parts("Boolean", "bool", ["Boolean"]),
        "date": lambda: _parts("Date", "datetime.date", ["Date"], ["datetime"]),
        "datetime": lambda: _parts("DateTime(timezone=True)", "datetime.datetime", ["DateTime"], ["datetime"]),
        "time": lambda: _parts("Time", "datetime.time", ["Time"], ["datetime"]),
        "duration": lambda: _parts("Interval", "datetime.timedelta", ["Interval"], ["datetime"]),
        "uuid": lambda: _parts("Uuid", "uuid.UUID", ["Uuid"], ["uuid"]),
        "binary": lambda: _parts("LargeBinary", "bytes", ["LargeBinary"]),
        "any": lambda: _parts("JSON", "Any", ["JSON"], ["typing"]),
    }[name]()


def py_literal(value, column: dict, enums: list[dict]) -> str:
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
    return py_string(js_string(value if stored is None else stored))


def column_settings(attribute: dict, view: dict, prefix: str) -> list[str]:
    """Keyword arguments of `mapped_column` / `sa.Column` that both files share."""
    column = attribute["column"]
    column_type = column["type"]
    settings: list[str] = []
    if attribute["primaryKey"] or attribute["compositeKey"]:
        settings.append("primary_key=True")
    if (
        attribute["primaryKey"]
        and column_type["kind"] == "primitive"
        and column_type["name"] == "integer"
        and column.get("generated") != "identity"
    ):
        settings.append("autoincrement=False")
    if attribute["unique"]:
        settings.append("unique=True")
    if attribute["indexed"]:
        settings.append("index=True")
    if column.get("generated") == "uuid":
        settings.append("default=uuid.uuid4")
    if column.get("generated") == "now":
        settings.append(f"server_default={prefix}func.now()")
    if column.get("defaultValue") is not None:
        settings.append(f"default={py_literal(column['defaultValue'], column, view['enums'])}")
    return settings


def foreign_key_call(attribute: dict, prefix: str) -> str | None:
    fk = attribute.get("foreignKey")
    if not fk:
        return None
    action = f", ondelete={py_string(fk['onDelete'].upper())}" if fk.get("onDelete") else ""
    return f"{prefix}ForeignKey({py_string(fk['table'] + '.' + fk['references'][0])}{action})"


def relationship_parts(navigation: dict, owner: dict) -> dict:
    """The settings of a relationship, as keyword arguments of SQLAlchemy's `relationship()` (both writers pass
    them on: SQLAlchemy directly, SQLModel inside `sa_relationship_kwargs`): `backPopulates`, `foreignKeys`
    (which column holds the key), `remoteSide` (the side holding the key, for a model that refers to itself)
    and `cascade`."""
    parts = {"backPopulates": navigation["inverse"]} if navigation.get("inverse") else {}
    if navigation["kind"] == "manyToOne":
        parts["foreignKeys"] = f"{owner['name']}.{navigation['attribute']}"
        if navigation["target"] == owner["name"]:
            parts["remoteSide"] = f"{owner['name']}.{primary_attribute(owner)}"
    if navigation["kind"] == "oneToMany":
        parts["foreignKeys"] = f"{navigation['target']}.{navigation['attribute']}"
        if navigation["cascade"]:
            parts["cascade"] = "all, delete-orphan"
    return parts


def relationship_line(navigation: dict, owner: dict) -> str:
    name = py_identifier(navigation["name"])
    parts = relationship_parts(navigation, owner)
    settings = [
        f"secondary={py_identifier(navigation['join']['table']['name'])}" if navigation["kind"] == "manyToMany" else "",
        f"back_populates={py_string(parts['backPopulates'])}" if parts.get("backPopulates") else "",
        f"remote_side={py_string(parts['remoteSide'])}" if parts.get("remoteSide") else "",
        f"foreign_keys={py_string(parts['foreignKeys'])}" if parts.get("foreignKeys") else "",
        f"cascade={py_string(parts['cascade'])}" if parts.get("cascade") else "",
    ]
    if navigation["kind"] == "manyToOne":
        type_text = f"{navigation['target']} | None" if navigation["nullable"] else navigation["target"]
    else:
        type_text = f"list[{navigation['target']}]"
    return f"{name}: Mapped[{type_text}] = relationship({', '.join(item for item in settings if item)})"


def primary_attribute(item: dict) -> str:
    return next((attribute["name"] for attribute in item["attributes"] if attribute["primaryKey"]), "id")
