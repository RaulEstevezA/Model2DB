"""A Prisma schema. Prisma writes its own migrations from it (`prisma migrate dev`), so none is written here: a
hand-written one would drift from what Prisma expects. Mirrors web/src/core/generate/orm/typescript/prisma.ts."""

import re

from ....js import is_number, js_string, json_string
from ....physical.naming import pluralize
from ...todos import todo_text
from ...types import generated_file
from ..entities import build_entities, enum_members
from .typescript import camel_from_snake

PROVIDERS = {
    "postgresql": "postgresql",
    "mysql": "mysql",
    "mariadb": "mysql",
    "sqlite": "sqlite",
    "sqlserver": "sqlserver",
}

_IDENTIFIER = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


def _names_primary_keys(provider: str) -> bool:
    """Providers where Prisma can name a primary key (`@id(map: ...)`)."""
    return provider in ("postgresql", "sqlserver")


def _has_enums(provider: str) -> bool:
    """Whether the provider has enums of its own in Prisma (SQL Server does not)."""
    return provider != "sqlserver"


def _field_type(column_type: dict, provider: str, enums: list[dict]) -> tuple[str, str | None]:
    """Prisma type and native-type attribute of a column."""
    sqlite = provider == "sqlite"
    kind = column_type["kind"]
    if kind in ("raw", "json"):
        # SQL Server has no Json type in Prisma: the text of the JSON
        return ("String", "@db.NVarChar(Max)") if provider == "sqlserver" else ("Json", None)
    if kind == "array":
        inner, _ = _field_type(column_type["items"], provider, enums)
        return f"{inner}[]", None
    if kind == "enum":
        item = next((candidate for candidate in enums if candidate["name"] == column_type["name"]), None)
        if item and _has_enums(provider) and item["storage"] in ("check", "native"):
            return item["name"], None
        return ("Int", None) if item and all(is_number(value) for value in item["values"]) else ("String", None)
    name, bits = column_type["name"], column_type.get("bits")
    if name == "string":
        length = column_type.get("length")
        if length and not sqlite:
            return "String", f"@db.{'NVarChar' if provider == 'sqlserver' else 'VarChar'}({length})"
        return "String", None
    if name == "integer":
        if bits == 64:
            return "BigInt", None
        if bits in (8, 16) and not sqlite:
            return "Int", "@db.SmallInt"
        return "Int", None
    if name == "float":
        return "Float", None
    if name == "decimal":
        precision = column_type.get("precision")
        scale = column_type.get("scale")
        native = f"@db.Decimal({18 if precision is None else precision}, {2 if scale is None else scale})"
        return ("Decimal", None) if sqlite else ("Decimal", native)
    if name == "boolean":
        return "Boolean", None
    if name == "date":
        return ("DateTime", None) if sqlite else ("DateTime", "@db.Date")
    if name == "datetime":
        return ("DateTime", "@db.Timestamptz") if provider == "postgresql" else ("DateTime", None)
    if name == "time":
        return ("String", None) if sqlite else ("DateTime", "@db.Time")
    if name == "duration":
        return "String", None
    if name == "uuid":
        if provider == "postgresql":
            return "String", "@db.Uuid"
        if provider == "sqlserver":
            return "String", "@db.UniqueIdentifier"
        return "String", None
    if name == "binary":
        return "Bytes", None
    return ("String", "@db.NVarChar(Max)") if provider == "sqlserver" else ("Json", None)


def _enum_member_name(value: str) -> str:
    return value if _IDENTIFIER.match(value) else "value_" + re.sub(r"\W", "_", value, flags=re.ASCII)


def _default_value(value, column: dict, enums: list[dict], prisma_type: str) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool) or is_number(value):
        return js_string(value)
    item = (
        next((candidate for candidate in enums if candidate["name"] == column["type"]["name"]), None)
        if column["type"]["kind"] == "enum"
        else None
    )
    stored = (
        next((candidate for candidate in item["values"] if js_string(candidate).lower() == value.lower()), value)
        if item
        else value
    )
    # An enum default names the member, not the stored value
    if item and prisma_type == item["name"]:
        return _enum_member_name(js_string(stored))
    return js_string(stored) if is_number(stored) else json_string(js_string(stored))


def _owner_of(view: dict, attribute: dict) -> dict | None:
    return next(
        (item for item in view["classes"] if any(candidate is attribute for candidate in item["attributes"])), None
    )


def _attribute_name(item: dict, column: str) -> str:
    return next(
        (attribute["name"] for attribute in item["attributes"] if attribute["column"]["name"] == column), column
    )


def _reference_attribute(view: dict, target: str, column: str) -> str:
    item = next((candidate for candidate in view["classes"] if candidate["name"] == target), None)
    return _attribute_name(item, column) if item else column


def _relation_name(owner: str, field: str) -> str:
    return f"{owner}_{field}"


def _scalar_line(attribute: dict, view: dict, provider: str, context) -> str:
    column = attribute["column"]
    type_text, native = _field_type(column["type"], provider, view["enums"])
    if column["type"]["kind"] == "enum" and type_text not in ("String", "Int"):
        item = next((candidate for candidate in view["enums"] if candidate["name"] == column["type"]["name"]), None)
        if item and item["storage"] == "check":
            context.note({"code": "ormEnumType", "params": {"orm": "Prisma", "enum": item["name"]}})
    parts = [f"{attribute['name']} {type_text}{'?' if column['nullable'] else ''}"]
    owner = _owner_of(view, attribute)
    if attribute["primaryKey"]:
        table_name = owner["table"]["name"] if owner else ""
        parts.append(f"@id(map: {json_string('pk_' + table_name)})" if _names_primary_keys(provider) else "@id")
    generated = column.get("generated")
    if generated == "identity":
        parts.append("@default(autoincrement())")
    if generated == "uuid":
        parts.append("@default(uuid())")
    if generated == "now":
        parts.append("@default(now())")
    if column.get("defaultValue") is not None:
        value = _default_value(column["defaultValue"], column, view["enums"], type_text)
        if value is not None:
            parts.append(f"@default({value})")
    if attribute["unique"]:
        table = owner["table"] if owner else None
        unique = (
            next(
                (
                    entry["name"]
                    for entry in table["uniques"]
                    if len(entry["columns"]) == 1 and entry["columns"][0] == column["name"]
                ),
                None,
            )
            if table
            else None
        )
        parts.append(f"@unique(map: {json_string(unique)})" if unique else "@unique")
    if attribute["name"] != column["name"]:
        parts.append(f"@map({json_string(column['name'])})")
    if native:
        parts.append(native)
    return " ".join(parts)


def _model_block(item: dict, view: dict, provider: str, context, back_fields: dict[str, list[str]]) -> dict:
    """The block of one table: its columns, relation fields and attributes (`@@id`, `@@index`, `@@map`)."""
    lines = [_scalar_line(attribute, view, provider, context) for attribute in item["attributes"]]
    attributes = []
    table = item["table"]
    for navigation in item["navigations"]:
        if navigation["kind"] != "manyToOne":
            continue
        fk = next(attribute for attribute in item["attributes"] if attribute["name"] == navigation["attribute"])[
            "foreignKey"
        ]
        relation = _relation_name(item["name"], navigation["name"])
        on_delete = fk.get("onDelete")
        actions = (
            ", onDelete: Cascade"
            if on_delete == "cascade"
            else ", onDelete: SetNull"
            if on_delete == "set null"
            else ""
        )
        reference = _reference_attribute(view, navigation["target"], fk["references"][0])
        optional = "?" if navigation["nullable"] else ""
        lines.append(
            f"{navigation['name']} {navigation['target']}{optional} @relation({json_string(relation)}, "
            f"fields: [{navigation['attribute']}], references: [{reference}]{actions})"
        )
    # Every relation needs its other side in Prisma; it is named after the design's list when there is one
    lines.extend(back_fields.get(item["name"], []))
    if len(table["primaryKey"]) > 1:
        keys = ", ".join(_attribute_name(item, column) for column in table["primaryKey"])
        name = f", map: {json_string('pk_' + table['name'])}" if _names_primary_keys(provider) else ""
        attributes.append(f"@@id([{keys}]{name})")
    for index in table["indexes"]:
        if len(index["columns"]) == 1:
            attribute = next(
                (candidate for candidate in item["attributes"] if candidate["column"]["name"] == index["columns"][0]),
                None,
            )
            if attribute and attribute["unique"]:
                continue
        keys = ", ".join(_attribute_name(item, column) for column in index["columns"])
        attributes.append(f"@@index([{keys}], map: {json_string(index['name'])})")
    attributes.append(f"@@map({json_string(table['name'])})")
    return {"name": item["name"], "lines": lines, "attributes": attributes}


def _join_block(join: dict, view: dict, provider: str, link_name: str, owner: dict, other: dict) -> dict:
    """The class of a join table, so the many-to-many relation keeps the design's table and columns."""
    first, second = join["foreignKeys"][0], join["foreignKeys"][1]
    lines: list[str] = []
    names: list[str] = []
    for fk, target, side in ((first, owner, "owner"), (second, other, "other")):
        column = next(candidate for candidate in join["columns"] if candidate["name"] == fk["columns"][0])
        attribute = camel_from_snake(column["name"])
        # `tag_code` referring to `code` → `tag`: the column without the key it holds
        reference_column = fk["references"][0]
        stem = (
            column["name"][: -len(reference_column) - 1]
            if column["name"].endswith(f"_{reference_column}")
            else f"{side}_ref"
        )
        navigation = camel_from_snake(stem)
        reference = next(
            candidate for candidate in target["attributes"] if candidate["column"]["name"] == reference_column
        )
        type_text, native = _field_type(column["type"], provider, view["enums"])
        names.append(attribute)
        mapped = f" @map({json_string(column['name'])})" if attribute != column["name"] else ""
        lines.append(f"{attribute} {type_text}{mapped}{f' {native}' if native else ''}")
        lines.append(
            f"{navigation} {target['name']} @relation({json_string(link_name + '_' + navigation)}, "
            f"fields: [{attribute}], references: [{reference['name']}], onDelete: Cascade)"
        )
    name = f", map: {json_string('pk_' + join['name'])}" if _names_primary_keys(provider) else ""
    return {
        "name": link_name,
        "lines": lines,
        "attributes": [f"@@id([{', '.join(names)}]{name})", f"@@map({json_string(join['name'])})"],
    }


def _render(block: dict) -> list[str]:
    width = max(len(line.split(" ")[0]) for line in block["lines"])
    aligned = []
    for line in block["lines"]:
        name, *rest = line.split(" ")
        aligned.append(f"  {name.ljust(width)} {' '.join(rest)}")
    return [
        f"model {block['name']} {{",
        *aligned,
        *(["", *(f"  {line}" for line in block["attributes"])] if block["attributes"] else []),
        "}",
    ]


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:]


def _schema_file(view: dict, provider: str, context) -> str:
    out = [
        f"// Prisma schema written by Model2DB from {context.title}. "
        "Review it, then run `npx prisma migrate dev --name init`.",
        "",
        "datasource db {",
        f"  provider = {json_string(provider)}",
        '  url      = env("DATABASE_URL")',
        "}",
        "",
        "generator client {",
        '  provider = "prisma-client-js"',
        "}",
    ]
    for item in view["enums"]:
        if not _has_enums(provider) or item["storage"] not in ("check", "native"):
            continue
        if any(is_number(value) for value in item["values"]):
            continue
        out.extend(["", f"enum {item['name']} {{"])
        for member in enum_members(item, context.schema):
            stored = js_string(member["value"])
            name = _enum_member_name(stored)
            out.append(f"  {name}{f' @map({json_string(stored)})' if name != stored else ''}")
        out.extend([f"  @@map({json_string(item['sqlName'])})", "}"])

    # The other side of every relation, and the link models of the join tables
    back_fields: dict[str, list[str]] = {}

    def add_back(model: str, line: str) -> None:
        back_fields[model] = [*back_fields.get(model, []), line]

    used = {
        item["name"]: {
            *(attribute["name"] for attribute in item["attributes"]),
            *(navigation["name"] for navigation in item["navigations"]),
        }
        for item in view["classes"]
    }

    def free(model: str, name: str) -> str:
        taken = used[model]
        candidate = name
        i = 2
        while candidate in taken:
            candidate = f"{name}{i}"
            i += 1
        taken.add(candidate)
        return candidate

    for item in view["classes"]:
        for navigation in item["navigations"]:
            if navigation["kind"] != "manyToOne":
                continue
            # The design's list when there is one; otherwise the plural of the model, told apart if it repeats
            plural = pluralize(_lower_first(item["name"]))
            suffix = f"As{navigation['name'][:1].upper()}{navigation['name'][1:]}"
            target = navigation["target"]
            name = navigation.get("inverse") or free(target, f"{plural}{suffix}" if plural in used[target] else plural)
            relation = json_string(_relation_name(item["name"], navigation["name"]))
            add_back(target, f"{name} {item['name']}[] @relation({relation})")
    links = []
    for join in view["joins"]:
        first, second = join["foreignKeys"][0], join["foreignKeys"][1]
        owner = next((item for item in view["classes"] if item["table"]["name"] == first["table"]), None)
        other = next((item for item in view["classes"] if item["table"]["name"] == second["table"]), None)
        if not owner or not other:
            continue
        link_name = f"{owner['name']}{'Link' if other['name'] == owner['name'] else other['name']}Link"
        block = _join_block(join, view, provider, link_name, owner, other)
        links.append(block)
        # Each side lists the link rows; the navigation is named after the design's list
        owner_list = next(
            (
                navigation
                for navigation in owner["navigations"]
                if navigation["kind"] == "manyToMany" and navigation.get("join") and navigation["join"]["table"] is join
            ),
            None,
        )
        other_list = next(
            (
                navigation
                for navigation in other["navigations"]
                if navigation["kind"] == "manyToMany"
                and navigation.get("join")
                and navigation["join"]["table"] is join
                and navigation is not owner_list
            ),
            None,
        )
        owner_side = block["lines"][1].split(" ")[0]
        other_side = block["lines"][3].split(" ")[0]
        default_list = f"{_lower_first(link_name)}s"
        owner_name = owner_list["name"] if owner_list else free(owner["name"], default_list)
        add_back(owner["name"], f"{owner_name} {link_name}[] @relation({json_string(link_name + '_' + owner_side)})")
        other_name = other_list["name"] if other_list else free(other["name"], default_list)
        add_back(other["name"], f"{other_name} {link_name}[] @relation({json_string(link_name + '_' + other_side)})")

    for item in view["classes"]:
        out.append("")
        for todo in item["table"]["todos"]:
            out.append(f"// {todo_text(todo, item['table']['model'], 'table')}")
        out.extend(_render(_model_block(item, view, provider, context, back_fields)))
    for block in links:
        out.extend(["", *_render(block)])
    return "\n".join(out) + "\n"


class PrismaOutput:
    id = "prisma"
    label = "Prisma"
    group = "typescript"
    engines = ("postgresql", "mysql", "mariadb", "sqlite", "sqlserver")

    def write(self, physical: dict, context) -> list[dict]:
        provider = PROVIDERS.get(context.settings["engine"], "postgresql")
        view = build_entities(physical, context.schema, "camelCase")
        return [generated_file("prisma/schema.prisma", _schema_file(view, provider, context), "prisma")]
