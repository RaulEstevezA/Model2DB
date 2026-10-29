"""Mirrors web/src/core/generate/sql/statements.ts."""

import re

from ...js import trim
from ...physical.order import order_tables
from .sql import generate_sql


def schema_statements(physical: dict, dialect: str, title: str) -> tuple[list[str], list[str]]:
    """The schema of an engine as separate statements, for migrations that run them one by one, and the
    statements that undo it (tables dropped after the ones that refer to them)."""
    text = "\n".join(line for line in generate_sql(physical, dialect, title).split("\n") if not line.startswith("--"))
    up = [re.sub(r";$", "", trim(statement)) for statement in re.split(r";\s*\n", text)]
    up = [statement for statement in up if statement]
    down = [f"DROP TABLE {table['name']}" for table in reversed(order_tables(physical["tables"])[0])]
    return up, down
