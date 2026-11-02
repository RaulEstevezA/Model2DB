"""The plain SQL schema as a Flyway or Liquibase migration, for projects that run their schema with one of
them and no ORM. The SQL is the same the engine's own output writes. Mirrors
web/src/core/generate/sql/migrationTools.ts."""

import re

from ..types import WriteContext, file_base, generated_file
from .sql import DIALECT_NAMES, generate_sql

ENGINES = ("postgresql", "mysql", "mariadb", "sqlite", "sqlserver", "oracle")

# A JDBC URL to fill in: both tools connect through JDBC
JDBC_URLS = {
    "postgresql": "jdbc:postgresql://localhost:5432/app",
    "mysql": "jdbc:mysql://localhost:3306/app",
    "mariadb": "jdbc:mariadb://localhost:3306/app",
    "sqlite": "jdbc:sqlite:app.db",
    "sqlserver": "jdbc:sqlserver://localhost:1433;databaseName=app;encrypt=false",
    "oracle": "jdbc:oracle:thin:@//localhost:1521/FREEPDB1",
}


class FlywayOutput:
    id = "flyway"
    label = "Flyway"
    group = "relational"
    engines = ENGINES

    def write(self, physical: dict, context: WriteContext) -> list[dict]:
        engine = context.settings["engine"]
        settings = [
            f"# Flyway settings written by Model2DB from {context.title}. "
            "Fill in the connection, then run: flyway migrate",
            "# The password is read from the FLYWAY_PASSWORD environment variable.",
            "[environments.default]",
            f'url = "{JDBC_URLS[engine]}"',
            *([] if engine == "sqlite" else ['user = "app"']),
            "",
            "[flyway]",
            'environment = "default"',
            'locations = ["filesystem:db/migration"]',
            "",
        ]
        return [
            generated_file("flyway.toml", "\n".join(settings), "text"),
            generated_file(
                f"db/migration/V1__create_{file_base(context.title)}_schema.sql",
                generate_sql(physical, engine, context.title, migration=True),
                "sql",
            ),
        ]


class LiquibaseOutput:
    id = "liquibase"
    label = "Liquibase"
    group = "relational"
    engines = ENGINES

    def write(self, physical: dict, context: WriteContext) -> list[dict]:
        engine = context.settings["engine"]
        changes = f"changes/001-create-{file_base(context.title).replace('_', '-')}-schema.sql"
        settings = [
            f"# Liquibase settings written by Model2DB from {context.title}. "
            "Fill in the connection, then run: liquibase update",
            "# The password is read from the LIQUIBASE_COMMAND_PASSWORD environment variable.",
            "changeLogFile=db/changelog/db.changelog-master.yaml",
            f"url={JDBC_URLS[engine]}",
            *([] if engine == "sqlite" else ["username=app"]),
            "",
        ]
        master = [
            "databaseChangeLog:",
            "  - include:",
            f"      file: {changes}",
            "      relativeToChangelogFile: true",
            "",
        ]
        sql = generate_sql(physical, engine, context.title, migration=True)
        return [
            generated_file("liquibase.properties", "\n".join(settings), "text"),
            generated_file("db/changelog/db.changelog-master.yaml", "\n".join(master), "yaml"),
            generated_file(f"db/changelog/{changes}", _formatted_sql(sql, engine, context.title), "sql"),
        ]


def _statements(sql: str) -> list[dict]:
    """The statements of a schema script, each with the comments written just before it."""
    result: list[dict] = []
    comments: list[str] = []
    lines: list[str] = []
    # The first two lines are the script's header
    for line in sql.split("\n")[2:]:
        if not lines and line.startswith("--"):
            comments.append(line)
        elif line.strip() != "" or lines:
            lines.append(line)
        if lines and line.rstrip().endswith(";"):
            result.append({"comments": comments, "text": "\n".join(lines)})
            comments = []
            lines = []
    return result


def _formatted_sql(sql: str, engine: str, title: str) -> str:
    """One changeset per table with its indexes and rows, per enum type and per foreign key added afterwards,
    each with the statement that undoes it, so `liquibase rollback` works."""
    changesets: list[dict] = []
    ids: set[str] = set()
    for statement in _statements(sql):
        started = _change_of(statement["text"], engine)
        if started or not changesets:
            change = started or {"id": "schema", "rollback": "empty"}
            change_id = change["id"]
            n = 2
            while change_id in ids:
                change_id = f"{change['id']}-{n}"
                n += 1
            ids.add(change_id)
            changesets.append({"id": change_id, "rollback": change["rollback"], "lines": []})
        changesets[-1]["lines"].extend([*statement["comments"], statement["text"]])
    out = [
        "--liquibase formatted sql",
        "",
        f"-- {DIALECT_NAMES[engine]} schema written by Model2DB from {title}.",
        "-- Review it before running it: nothing here has been run.",
    ]
    for change in changesets:
        out.extend(["", f"--changeset model2db:{change['id']}", *change["lines"], f"--rollback {change['rollback']}"])
    return "\n".join(out) + "\n"


def _change_of(text: str, engine: str) -> dict | None:
    """The changeset a statement starts and how to undo it; None for statements that belong to the previous
    one (the indexes and rows of a table)."""

    def name(pattern: str) -> str:
        found = re.search(pattern, text)
        return found.group(1) if found else ""

    def plain(quoted: str) -> str:
        return re.sub(r'["`\[\]]', "", quoted)

    if text.startswith("CREATE TABLE "):
        table = name(r"^CREATE TABLE (\S+)")
        return {"id": f"create-table-{plain(table)}", "rollback": f"DROP TABLE {table};"}
    if text.startswith("CREATE TYPE "):
        type_name = name(r"^CREATE TYPE (\S+)")
        return {"id": f"create-type-{plain(type_name)}", "rollback": f"DROP TYPE {type_name};"}
    if text.startswith("ALTER TABLE "):
        table = name(r"^ALTER TABLE (\S+)")
        constraint = name(r"ADD CONSTRAINT (\S+)")
        drop = "DROP FOREIGN KEY" if engine in ("mysql", "mariadb") else "DROP CONSTRAINT"
        return {"id": f"add-{plain(constraint)}", "rollback": f"ALTER TABLE {table} {drop} {constraint};"}
    return None
