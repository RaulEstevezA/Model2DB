"""SQLAlchemy 2.0 models in the typed declarative style, and the Alembic migration that creates them. Mirrors
web/src/core/generate/orm/python/sqlalchemy.ts."""

from ...todos import todo_text
from ...types import generated_file
from ..entities import build_entities, enum_members
from .alembic import migration_file
from .python import py_identifier, py_string, python_enum
from .sqlalchemy_types import column_settings, foreign_key_call, relationship_line, type_parts


def _models_file(view: dict, context) -> str:
    imports = {"ForeignKey"}
    orm_imports = {"DeclarativeBase", "Mapped", "mapped_column"}
    modules: set[str] = set()
    body: list[str] = []

    if any(item["storage"] in ("check", "native") for item in view["enums"]):
        modules.add("enum")
        body.extend(
            [
                "",
                "",
                "def enum_values(enum_class: type[enum.Enum]) -> list[str]:",
                '    """Store the values of an enum (`paid`), not the names of its members (`PAID`)."""',
                "    return [str(member.value) for member in enum_class]",
            ]
        )
        for item in view["enums"]:
            if item["storage"] not in ("check", "native"):
                continue
            body.extend(["", "", *python_enum(item["name"], enum_members(item, context.schema))])

    body.extend(["", "", "class Base(DeclarativeBase):", "    pass"])

    for join in view["joins"]:
        imports.update(("Table", "Column"))
        columns = []
        for column in join["columns"]:
            parts = type_parts(column["type"], view["enums"], False)
            imports.update(parts["imports"])
            fk = next(
                (candidate for candidate in join["foreignKeys"] if candidate["columns"][0] == column["name"]), None
            )
            reference = ""
            if fk:
                action = f", ondelete={py_string(fk['onDelete'].upper())}" if fk.get("onDelete") else ""
                reference = f", ForeignKey({py_string(fk['table'] + '.' + fk['references'][0])}{action})"
            columns.append(f"    Column({py_string(column['name'])}, {parts['sql']}{reference}, primary_key=True),")
        body.extend(
            [
                "",
                "",
                f"{py_identifier(join['name'])} = Table(",
                f"    {py_string(join['name'])},",
                "    Base.metadata,",
                *columns,
                ")",
            ]
        )

    for item in view["classes"]:
        body.extend(["", ""])
        for todo in item["table"]["todos"]:
            body.append(f"# {todo_text(todo, item['table']['model'], 'table')}")
        body.extend([f"class {item['name']}(Base):", f"    __tablename__ = {py_string(item['table']['name'])}", ""])
        for attribute in item["attributes"]:
            column = attribute["column"]
            parts = type_parts(column["type"], view["enums"], False, column.get("generated") == "identity")
            imports.update(parts["imports"])
            modules.update(parts["modules"])
            if column.get("generated") == "uuid":
                modules.add("uuid")
            if column.get("generated") == "now":
                imports.add("func")
            python_type = f"{parts['python']} | None" if column["nullable"] else parts["python"]
            args = [
                value
                for value in [parts["sql"], foreign_key_call(attribute, ""), *column_settings(attribute, view, "")]
                if value
            ]
            # mapped_column takes the name of the column when the attribute is named differently
            if attribute["name"] != column["name"]:
                args.insert(0, py_string(column["name"]))
            body.append(
                f"    {py_identifier(attribute['name'])}: Mapped[{python_type}] = mapped_column({', '.join(args)})"
            )
        if item["navigations"]:
            orm_imports.add("relationship")
            body.append("")
            for navigation in item["navigations"]:
                body.append(f"    {relationship_line(navigation, item)}")

    header = [
        f'"""SQLAlchemy models written by Model2DB from {context.title}. Review them before using them."""',
        "",
        "from __future__ import annotations",
        "",
        *("from typing import Any" if name == "typing" else f"import {name}" for name in sorted(modules)),
        *([""] if modules else []),
        f"from sqlalchemy import {', '.join(sorted(imports))}",
        f"from sqlalchemy.orm import {', '.join(sorted(orm_imports))}",
    ]
    return "\n".join([*header, *body, ""])


class SqlAlchemyOutput:
    id = "sqlalchemy"
    label = "SQLAlchemy"
    group = "python"
    engines = ("postgresql", "mysql", "mariadb", "sqlite", "sqlserver", "oracle")
    migrations = True

    def write(self, physical: dict, context) -> list[dict]:
        view = build_entities(physical, context.schema, "snake_case")
        files = [generated_file("models.py", _models_file(view, context), "python")]
        if context.settings["migrations"]:
            files.append(
                generated_file(
                    "migrations/versions/0001_create_schema.py", migration_file(physical, view, context), "python"
                )
            )
        return files
