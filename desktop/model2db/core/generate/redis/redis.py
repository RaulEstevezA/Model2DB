"""Redis: a description of the keys (Markdown), and the search indexes as commands for redis-cli, which takes no
comments. Redis has no schema to create: the description is what the application follows. Mirrors
web/src/core/generate/redis/redis.ts."""

from ..todos import todo_text
from ..types import WriteContext, file_base, generated_file


class RedisOutput:
    id = "redis"
    label = "Redis"
    group = "keyvalue"

    def write(self, physical: dict, context: WriteContext) -> list[dict]:
        base = file_base(context.title)
        search = search_commands(physical)
        search_file = f"{base}-redis-search.redis"
        files = [
            generated_file(
                f"{base}-redis.md", describe_keys(physical, context.title, search_file if search else None), "markdown"
            )
        ]
        if search:
            files.append(generated_file(search_file, search, "text"))
        return files


def _key(entry: dict) -> str:
    return f"{entry['prefix']}:<key>"


def _holds(item: dict) -> str:
    if item.get("values") is not None:
        return "text: " + ", ".join(f"`{_text(value)}`" for value in item["values"])
    holds = item["holds"]
    if holds == "key":
        return f"key of a `{item['refers']}` (`{item['refers']}:<key>`)"
    return {
        "number": "number",
        "boolean": "`true` or `false`",
        "date": "date (ISO 8601 text)",
        "json": "JSON text",
        "text": "text",
    }[holds]


def _text(value) -> str:
    """String(value) of JavaScript, for enum values."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _structure_text(entry: dict, structure: dict) -> str:
    if structure["type"] == "set":
        what = f"set of the keys of each `{structure['refers']}`"
    elif structure["type"] == "list":
        what = f"list, each item {_holds(structure)}"
    else:
        what = f"hash, each value {_holds(structure)}"
    return f"- `{_key(entry)}:{structure['suffix']}`: {what} (from `{structure['source']}`)"


def describe_keys(schema: dict, title: str, search_file: str | None) -> str:
    out = [
        f"# Redis keys for {title}",
        "",
        "Written by Model2DB. Review it before using it: nothing here has been run.",
        "Redis keeps every value as text; the application writes and reads them as described here.",
    ]
    for entry in schema["entries"]:
        out.extend(["", f"## `{_key(entry)}`: a hash for each {entry['model']}", ""])
        for todo in entry["todos"]:
            out.extend([f"> {todo_text(todo, entry['model'], 'hash')}", ""])
        if entry["keyField"]:
            out.append(f"The key is the value of `{entry['keyField']}`.")
        elif entry["newKey"] == "counter":
            out.append(f"New keys: `INCR {entry['prefix']}:next_key` gives the next number.")
        elif entry["newKey"] == "uuid":
            out.append("New keys: a UUID made by the application.")
        if entry["fields"]:
            out.extend(["", "| Field | Holds |", "| --- | --- |"])
            for field in entry["fields"]:
                missing = "; may be missing" if field["nullable"] else ""
                out.append(f"| `{field['name']}` | {_holds(field)}{missing} |")
        if entry["structures"]:
            out.extend(["", "Under the same key:", ""])
            out.extend(_structure_text(entry, structure) for structure in entry["structures"])
    if search_file:
        out.extend(
            [
                "",
                "## Search",
                "",
                f"`{search_file}` creates a search index for each hash, on the fields other keys point to and the "
                f"ones chosen to be indexed. Run it with `redis-cli < {search_file}` on Redis 8, or Redis Stack.",
            ]
        )
    return "\n".join(out) + "\n"


def search_commands(schema: dict) -> str | None:
    """`FT.CREATE` for every hash with fields to search, or None when there are none."""
    lines = [
        f"FT.CREATE idx:{entry['prefix']} ON HASH PREFIX 1 {entry['prefix']}: SCHEMA "
        + " ".join(f"{field['field']} {field['type']}" for field in entry["search"])
        for entry in schema["entries"]
        if entry["search"]
    ]
    return "\n".join(lines) + "\n" if lines else None
