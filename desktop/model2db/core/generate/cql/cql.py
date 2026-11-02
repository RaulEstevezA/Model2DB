"""CQL for Cassandra and ScyllaDB: a keyspace, the user-defined types (each after the types it uses), the tables and
their secondary indexes. Both read the same CQL; Cassandra 5 indexes with SAI. Mirrors
web/src/core/generate/cql/cql.ts."""

import re

from ..todos import todo_text
from ..types import WriteContext, file_base, generated_file

KEYSPACE = "app"

# Words CQL reserves: a name that is one of them, or has capitals, is quoted
RESERVED = set(
    (
        "add allow alter and apply asc authorize batch begin by columnfamily create delete desc describe drop "
        "entries execute from full grant if in index infinity insert into is keyspace limit materialized modify nan "
        "norecursive not null of on or order primary rename replace revoke schema select set table to token "
        "truncate unlogged update use using view where with"
    ).split(" ")
)

BUILT_IN = {
    *("text", "int", "bigint", "smallint", "tinyint", "float", "double", "decimal", "boolean"),
    *("date", "timestamp", "time", "duration", "uuid", "blob"),
}

_PLAIN = re.compile(r"^[a-z_][a-z0-9_]*$")
_TYPE_NAME = re.compile(r"(?:(?<=<)|(?<=, ))([a-z_][a-z0-9_]*)(?=>|,)")


def cql_name(name: str) -> str:
    if _PLAIN.match(name) and name not in RESERVED:
        return name
    return '"' + name.replace('"', '""') + '"'


def _cql_type(column_type: str) -> str:
    """Quotes the names inside a CQL type: `frozen<order>` → `frozen<"order">`."""
    return _TYPE_NAME.sub(lambda match: match[0] if match[0] in BUILT_IN else cql_name(match[0]), column_type)


def _primary_key(table: dict) -> str:
    partition = ", ".join(cql_name(name) for name in table["partitionKey"])
    clustering = [cql_name(name) for name in table["clusteringKey"]]
    if clustering:
        return f"PRIMARY KEY (({partition}), {', '.join(clustering)})"
    return f"PRIMARY KEY ({partition})"


def generate_cql(schema: dict, engine: str, title: str) -> str:
    name = "Cassandra" if engine == "cassandra" else "ScyllaDB"
    out = [
        f"-- {name} schema written by Model2DB from {title}. Run it with cqlsh -f.",
        "-- Review it before running it: nothing here has been run.",
        f"-- The keyspace “{KEYSPACE}” keeps one copy of each row: raise its replication factor for a cluster.",
        "",
        f"CREATE KEYSPACE IF NOT EXISTS {KEYSPACE} WITH replication = "
        "{'class': 'NetworkTopologyStrategy', 'replication_factor': 1};",
        f"USE {KEYSPACE};",
    ]
    for udt in schema["types"]:
        out.extend(["", f"CREATE TYPE IF NOT EXISTS {cql_name(udt['name'])} ("])
        out.append(",\n".join(f"  {cql_name(field['name'])} {_cql_type(field['type'])}" for field in udt["fields"]))
        out.append(");")
    for table in schema["tables"]:
        out.append("")
        out.extend(f"-- {todo_text(todo, table['model'], 'table')}" for todo in table["todos"])
        lines = [
            f"CREATE TABLE IF NOT EXISTS {cql_name(table['name'])} (",
            *(f"  {cql_name(column['name'])} {_cql_type(column['type'])}," for column in table["columns"]),
            f"  {_primary_key(table)}",
            ");",
        ]
        # A table needs its key: until it is chosen, the table is written as a comment
        keyless = not table["partitionKey"]
        out.extend([f"-- {line}" for line in lines] if keyless else lines)
        for index in table["indexes"]:
            statement = (
                f"CREATE INDEX IF NOT EXISTS {cql_name(index['name'])} ON {cql_name(table['name'])} "
                f"({cql_name(index['column'])})"
            )
            using = " USING 'sai'" if engine == "cassandra" else ""
            out.append(f"{'-- ' if keyless else ''}{statement}{using};")
    return "\n".join(out) + "\n"


class _CqlOutput:
    group = "widecolumn"

    def __init__(self, engine: str, label: str):
        self.id = engine
        self.label = label

    def write(self, physical: dict, context: WriteContext) -> list[dict]:
        content = generate_cql(physical, self.id, context.title)
        return [generated_file(f"{file_base(context.title)}-{self.id}.cql", content, "sql")]


CassandraOutput = _CqlOutput("cassandra", "Cassandra")
ScyllaOutput = _CqlOutput("scylladb", "ScyllaDB")
