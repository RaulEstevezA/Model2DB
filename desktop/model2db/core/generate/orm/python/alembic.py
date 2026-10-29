"""The Alembic revision that creates every table, and drops them on downgrade. Mirrors
web/src/core/generate/orm/python/alembic.ts."""

import re

from ...todos import todo_text
from .python import order_tables, py_string
from .sqlalchemy_types import column_settings, type_parts

_SKIPPED = ("primary_key", "unique", "index", "default=")


def migration_file(physical: dict, view: dict, context) -> str:
    tables = order_tables(physical["tables"])
    lines: list[str] = []
    for table in tables:
        columns = []
        for column in table["columns"]:
            attribute = _attribute_of(view, table, column)
            parts = type_parts(column["type"], view["enums"], True, column.get("generated") == "identity")
            sql = re.sub(r"\b([A-Z]\w*)\(", r"sa.\1(", parts["sql"], flags=re.ASCII)
            sql = re.sub(r"^([A-Z]\w*)$", r"sa.\1", sql, flags=re.ASCII)
            settings = [sql]
            # Positional, so before the keyword arguments
            if column.get("generated") == "identity":
                settings.append("sa.Identity()")
            settings.append(f"nullable={'True' if column['nullable'] else 'False'}")
            if attribute:
                settings.extend(
                    item for item in column_settings(attribute, view, "sa.") if not item.startswith(_SKIPPED)
                )
            columns.append(f"        sa.Column({py_string(column['name'])}, {', '.join(settings)}),")
        constraints = []
        if table["primaryKey"]:
            keys = ", ".join(py_string(name) for name in table["primaryKey"])
            constraints.append(f"        sa.PrimaryKeyConstraint({keys}, name={py_string('pk_' + table['name'])}),")
        for unique in table["uniques"]:
            keys = ", ".join(py_string(name) for name in unique["columns"])
            constraints.append(f"        sa.UniqueConstraint({keys}, name={py_string(unique['name'])}),")
        for fk in table["foreignKeys"]:
            local = ", ".join(py_string(name) for name in fk["columns"])
            remote = ", ".join(py_string(f"{fk['table']}.{name}") for name in fk["references"])
            action = f", ondelete={py_string(fk['onDelete'].upper())}" if fk.get("onDelete") else ""
            constraints.append(
                f"        sa.ForeignKeyConstraint([{local}], [{remote}], name={py_string(fk['name'])}{action}),"
            )
        for todo in table["todos"]:
            lines.append(f"    # {todo_text(todo, table['model'], 'table')}")
        lines.extend(["    op.create_table(", f"        {py_string(table['name'])},", *columns, *constraints, "    )"])
        for index in table["indexes"]:
            keys = ", ".join(py_string(name) for name in index["columns"])
            unique = "True" if index["unique"] else "False"
            name, table_name = py_string(index["name"]), py_string(table["name"])
            lines.append(f"    op.create_index({name}, {table_name}, [{keys}], unique={unique})")
    drops = [f"    op.drop_table({py_string(table['name'])})" for table in reversed(tables)]
    for item in view["enums"]:
        if item["storage"] == "native":
            drops.append(f"    sa.Enum(name={py_string(item['sqlName'])}).drop(op.get_bind(), checkfirst=True)")
    return "\n".join(
        [
            f'"""Create the {context.title} schema.',
            "",
            "Written by Model2DB. Review it before running `alembic upgrade head`.",
            "",
            "Revision ID: 0001",
            "Revises:",
            '"""',
            "",
            "import sqlalchemy as sa",
            "from alembic import op",
            "",
            'revision = "0001"',
            "down_revision = None",
            "branch_labels = None",
            "depends_on = None",
            "",
            "",
            "def upgrade() -> None:",
            *(lines or ["    pass"]),
            "",
            "",
            "def downgrade() -> None:",
            *(drops or ["    pass"]),
            "",
        ]
    )


def _attribute_of(view: dict, table: dict, column: dict) -> dict | None:
    item = next((entry for entry in view["classes"] if entry["table"] is table), None)
    if not item:
        return None
    return next((attribute for attribute in item["attributes"] if attribute["column"] is column), None)
