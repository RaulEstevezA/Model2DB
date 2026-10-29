"""Proposes a persistence design for a model schema. Mirrors web/src/core/design/propose.ts."""

from ..model.naming import name_words
from ..model.schema import all_fields
from .analysis import analyze, has_key, is_parent_only, key_field, keyable, shape_of
from .decision import decision, reason
from .hints import declares_key, declares_unique
from .targets.document import STRATEGY as DOCUMENT
from .targets.relational import STRATEGY as RELATIONAL

# One strategy per kind of database. Adding a kind means adding its strategy here
STRATEGIES = {"relational": RELATIONAL, "document": DOCUMENT}


def propose_design(schema: dict, target: str) -> dict:
    strategy = STRATEGIES[target]
    context = analyze(schema)
    enums = [strategy["enum"](item["name"]) for item in schema["enums"]]
    return {
        "target": target,
        "models": [_propose_model(context, model, strategy) for model in schema["models"]],
        "enums": [item for item in enums if item is not None],
    }


def _propose_model(context: dict, model: dict, strategy: dict) -> dict:
    fields = all_fields(context["schema"], model)
    return {
        "model": model["name"],
        "include": not is_parent_only(context, model["name"]),
        "key": _propose_key(model, fields, strategy),
        "fields": [_propose_field(context, model, fields, field, strategy) for field in fields],
    }


def _propose_key(model: dict, fields: list[dict], strategy: dict) -> dict:
    declared = [field for field in fields if declares_key(field)]
    options = [{"kind": "field", "field": field["name"]} for field in fields if keyable(field) or field in declared]
    options += strategy["surrogate_keys"]
    if len(declared) > 1:
        names = ", ".join(field["name"] for field in declared)
        return decision(
            {"kind": "field", "field": declared[0]["name"]},
            "conflict",
            [reason("keyCandidates", {"fields": names})],
            options,
        )
    found = key_field(model, fields)
    if found:
        name = found["field"]["name"]
        confidence = "exact" if found["declared"] else "high"
        code = "keyDeclared" if found["declared"] else "keyNamed"
        return decision({"kind": "field", "field": name}, confidence, [reason(code, {"field": name})], options)
    return strategy["key_without_field"](model, fields, options)


def _propose_field(context: dict, model: dict, fields: list[dict], field: dict, strategy: dict) -> dict:
    design = {"field": field["name"], "include": True}
    shape = shape_of(context, field["type"])
    if shape:
        design["relation"] = strategy["relation"](context, model, field, shape)
        return design
    foreign_key = _propose_foreign_key(context, model, fields, field) if strategy["foreign_keys"] else None
    if foreign_key:
        design["foreignKey"] = foreign_key
    unique = _propose_unique(model, fields, field)
    if unique:
        design["unique"] = unique
    return design


def _propose_unique(model: dict, fields: list[dict], field: dict) -> dict | None:
    if field["type"]["kind"] != "primitive":
        return None
    key = key_field(model, fields)
    if key and key["field"]["name"] == field["name"]:
        return None
    if declares_unique(field):
        return decision(True, "exact", [reason("uniqueDeclared")], [True, False])
    words = name_words(field["name"])
    if words and words[-1] in ("email", "username", "slug", "sku", "isbn", "login", "handle") and len(words) <= 2:
        return decision(True, "review", [reason("uniqueNamed", {"field": field["name"]})], [True, False])
    return None


def _propose_foreign_key(context: dict, model: dict, fields: list[dict], field: dict) -> dict | None:
    if not keyable({**field, "nullable": False}):
        return None
    words = name_words(field["name"])
    if len(words) < 2 or words[-1] != "id":
        return None
    key = key_field(model, fields)
    if key and key["field"]["name"] == field["name"]:
        return None
    stem = "".join(words[:-1])
    target = next((item for item in context["schema"]["models"] if "".join(name_words(item["name"])) == stem), None)
    if not target or not has_key(context, target["name"]):
        return None
    if any(other["type"]["kind"] == "model" and other["type"]["name"] == target["name"] for other in fields):
        return None
    return decision(
        target["name"], "high", [reason("foreignKeyNamed", {"model": target["name"]})], [target["name"], None]
    )
