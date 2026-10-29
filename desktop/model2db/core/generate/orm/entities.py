"""The tables of a relational schema seen as ORM classes: one class per table (join tables become many-to-many
relations), one attribute per column and the navigations between classes. Every ORM generator writes from this
view, so they all name and relate things the same way. Mirrors web/src/core/generate/orm/entities.ts.

An attribute has `name` (in the language's convention), `column`, `primaryKey`, `compositeKey`, `foreignKey`
(when the column alone has one), `unique`, `indexed` and `enum`. A navigation has `name`, `kind` (`manyToOne`,
`oneToMany` or `manyToMany`), `target`, `inverse`, `attribute`, `nullable`, `join` (`table`, `ownerColumn`,
`targetColumn`) and `cascade`. Missing keys are the undefined ones of the web version."""

from ...design.analysis import singular_field
from ...js import coalesce
from ...model.naming import convert_case, name_words, to_pascal_case
from ...model.schema import find_enum
from ...physical.naming import pluralize


def _class_name(table: dict) -> str:
    """Class name of a table: the model for entities, model + field for lists (`OrderTag`), the enum for lookup
    tables (`OrderStatusOption`)."""
    if table["kind"] == "entity":
        return to_pascal_case(table["model"])
    if table["kind"] == "lookup":
        return f"{to_pascal_case(table['model'])}Option"
    if table["kind"] == "list":
        return to_pascal_case(table["model"]) + to_pascal_case(singular_field(table.get("field") or "value"))
    return to_pascal_case(table["model"]) + to_pascal_case(table.get("field") or "entry") + "Entry"


def _without_id(name: str) -> str:
    """`customer_id` → `customer`: the navigation next to a key column."""
    words = name_words(name)
    return "_".join(words[:-1]) if len(words) > 1 and words[-1] == "id" else f"{name}_ref"


def build_entities(physical: dict, schema: dict, convention: str) -> dict:
    def convert(text: str) -> str:
        return convert_case(text, convention)

    tables = [table for table in physical["tables"] if table["kind"] != "join"]
    names = {table["name"]: _class_name(table) for table in tables}
    classes = []
    for table in tables:
        attributes = []
        for column in table["columns"]:
            foreign_key = next(
                (fk for fk in table["foreignKeys"] if len(fk["columns"]) == 1 and fk["columns"][0] == column["name"]),
                None,
            )
            enum_item = (
                next((item for item in physical["enums"] if item["name"] == column["type"]["name"]), None)
                if column["type"]["kind"] == "enum"
                else None
            )
            attribute = {
                "name": convert(column["name"]),
                "column": column,
                "primaryKey": len(table["primaryKey"]) == 1 and table["primaryKey"][0] == column["name"],
                "compositeKey": len(table["primaryKey"]) > 1 and column["name"] in table["primaryKey"],
            }
            if foreign_key:
                attribute["foreignKey"] = foreign_key
            attribute["unique"] = any(
                len(unique["columns"]) == 1 and unique["columns"][0] == column["name"] for unique in table["uniques"]
            )
            attribute["indexed"] = any(
                len(index["columns"]) == 1 and index["columns"][0] == column["name"] for index in table["indexes"]
            )
            if enum_item:
                attribute["enum"] = enum_item
            attributes.append(attribute)
        classes.append({"name": names[table["name"]], "table": table, "attributes": attributes, "navigations": []})
    by_table = {item["table"]["name"]: item for item in classes}
    used = {item["name"]: {attribute["name"] for attribute in item["attributes"]} for item in classes}

    def free(owner: str, name: str) -> str:
        taken = used[owner]
        candidate = name
        i = 2
        while candidate in taken:
            candidate = f"{name}{i}"
            i += 1
        taken.add(candidate)
        return candidate

    for item in classes:
        for fk in item["table"]["foreignKeys"]:
            target = by_table.get(fk["table"])
            if not target or target["table"]["kind"] == "lookup":
                continue
            attribute = next(
                candidate for candidate in item["attributes"] if candidate["column"]["name"] == fk["columns"][0]
            )
            many = free(item["name"], convert(coalesce(fk.get("field"), _without_id(fk["columns"][0]))))
            back = free(target["name"], convert(fk["inverse"])) if fk.get("inverse") else None
            navigation = {"name": many, "kind": "manyToOne", "target": target["name"]}
            if back:
                navigation["inverse"] = back
            navigation.update(
                {
                    "attribute": attribute["name"],
                    "nullable": attribute["column"]["nullable"],
                    "cascade": False,
                }
            )
            item["navigations"].append(navigation)
            if back:
                target["navigations"].append(
                    {
                        "name": back,
                        "kind": "oneToMany",
                        "target": item["name"],
                        "inverse": many,
                        "attribute": attribute["name"],
                        "nullable": False,
                        "cascade": fk.get("onDelete") == "cascade",
                    }
                )

    joins = [table for table in physical["tables"] if table["kind"] == "join"]
    for join in joins:
        first = join["foreignKeys"][0] if len(join["foreignKeys"]) > 0 else None
        second = join["foreignKeys"][1] if len(join["foreignKeys"]) > 1 else None
        owner = by_table.get(first["table"]) if first else None
        other = by_table.get(second["table"]) if second else None
        if not owner or not other:
            continue
        name = free(owner["name"], convert(join.get("field") or pluralize(other["name"].lower())))
        mirror = free(other["name"], convert(join["mirror"])) if join.get("mirror") else None
        spec = {"table": join, "ownerColumn": first["columns"][0], "targetColumn": second["columns"][0]}
        navigation = {"name": name, "kind": "manyToMany", "target": other["name"]}
        if mirror:
            navigation["inverse"] = mirror
        navigation.update({"nullable": False, "join": spec, "cascade": False})
        owner["navigations"].append(navigation)
        if mirror:
            other["navigations"].append(
                {
                    "name": mirror,
                    "kind": "manyToMany",
                    "target": owner["name"],
                    "inverse": name,
                    "nullable": False,
                    "join": {"table": join, "ownerColumn": spec["targetColumn"], "targetColumn": spec["ownerColumn"]},
                    "cascade": False,
                }
            )

    return {
        "classes": classes,
        "joins": joins,
        "enums": [item for item in physical["enums"] if find_enum(schema, item["name"])],
    }


def enum_members(item: dict, schema: dict) -> list[dict]:
    """Members of an enum in a language: name and stored value (`PAID = 'paid'`)."""
    definition = find_enum(schema, item["name"])
    return [
        {"name": value["name"], "value": coalesce(value.get("value"), value["name"])}
        for value in (definition["values"] if definition else [])
    ]
