"""The three Python writers for MongoDB: PyMongo (validators and indexes, no classes), MongoEngine and Beanie
(classes for stored and embedded documents). Mirrors web/src/core/generate/odm/python/mongo.ts."""

from ...orm.python.python import py_identifier, py_string
from ...todos import todo_text
from ...types import generated_file
from ..documents import build_document_view
from .python_types import python_literal, python_str_enum, python_value_type


def _header(title: str, library: str, then: str) -> list[str]:
    return [f'"""{library} written by Model2DB from {title}. {then}"""', ""]


def _module_imports(modules: set[str]) -> list[str]:
    return [f"import {name}" for name in sorted(modules) if name != "typing"]


def _index_keys(index: dict) -> str:
    return ", ".join(f"({py_string(column)}, ASCENDING)" for column in index["columns"])


# ---------- PyMongo ----------


def _pymongo_file(physical: dict, context) -> str:
    out = [
        *_header(context.title, "PyMongo collections", "Run create_collections(db) once on an empty database."),
        "from pymongo import ASCENDING",
        "from pymongo.database import Database",
        "",
    ]
    out.extend(["# The $jsonSchema validator of each collection", "VALIDATORS = {"])
    for collection in physical["collections"]:
        out.append(f"    {py_string(collection['name'])}: {python_literal(collection['validator'], '    ')},")
    out.extend(["}", "", "# (fields, name, unique) of each collection", "INDEXES = {"])
    for collection in physical["collections"]:
        indexes = ", ".join(
            f"([{_index_keys(index)}], {py_string(index['name'])}, {'True' if index['unique'] else 'False'})"
            for index in collection["indexes"]
        )
        out.append(f"    {py_string(collection['name'])}: [{indexes}],")
    out.extend(["}", "", ""])
    for collection in physical["collections"]:
        for todo in collection["todos"]:
            out.append(f"# {todo_text(todo, collection['model'], 'collection')}")
    out.extend(
        [
            "def create_collections(db: Database) -> None:",
            '    """Creates each collection with its validator, then its indexes."""',
            "    for name, validator in VALIDATORS.items():",
            '        db.create_collection(name, validator={"$jsonSchema": validator})',
            "        for keys, index_name, unique in INDEXES[name]:",
            "            db[name].create_index(keys, name=index_name, unique=unique)",
            "",
        ]
    )
    return "\n".join(out)


class PyMongoOutput:
    id = "pymongo"
    label = "PyMongo"
    group = "python"

    def write(self, physical: dict, context) -> list[dict]:
        return [generated_file("collections.py", _pymongo_file(physical, context), "python")]


# ---------- MongoEngine ----------


def _mongoengine_value(field: dict, modules: set[str]) -> str:
    type_ref = field["type"]
    if type_ref["kind"] == "enum":
        return f"me.EnumField({py_identifier(type_ref['name'])})"
    if type_ref["kind"] != "primitive":
        return "me.DynamicField()"
    name = type_ref["name"]
    if name == "integer":
        return "me.LongField()" if type_ref.get("bits") == 64 else "me.IntField()"
    if name == "uuid":
        modules.add("uuid")
        return "me.UUIDField(binary=False)"
    return {
        "string": "me.StringField()",
        "time": "me.StringField()",
        "duration": "me.StringField()",
        "float": "me.FloatField()",
        "decimal": "me.Decimal128Field()",
        "boolean": "me.BooleanField()",
        "date": "me.DateTimeField()",
        "datetime": "me.DateTimeField()",
        "binary": "me.BinaryField()",
        "any": "me.DynamicField()",
    }[name]


def _mongoengine_field(field: dict, owner: dict, modules: set[str]) -> str:
    """The MongoEngine field of a document field, with its settings (`required`, `db_field`, `unique`)."""
    kind = field["kind"]
    if kind == "embedded":
        call = f"me.EmbeddedDocumentField({py_string(field['target'])})"
    elif kind == "reference":
        call = f"me.ReferenceField({py_string(field['target'])})"
    elif kind == "map":
        call = f"me.DictField({_mongoengine_value(field, modules)})"
    elif kind == "free":
        call = "me.DynamicField()"
    else:
        call = _mongoengine_value(field, modules)
    if field["many"]:
        call = f"me.ListField({call})"
    settings = []
    if field["id"]:
        settings.append("primary_key=True")
    else:
        if field["required"] and not field["many"]:
            settings.append("required=True")
        if field["stored"] != field["field"]["name"]:
            settings.append(f"db_field={py_string(field['stored'])}")
        if field["unique"] and owner.get("collection"):
            settings.append("unique=True")
    if not settings:
        return call
    if call.endswith("()"):
        return f"{call[:-1]}{', '.join(settings)})"
    return f"{call[:-1]}, {', '.join(settings)})"


def _attribute_of(item: dict, stored: str) -> str:
    """MongoEngine names fields by attribute in its indexes: `author_id` → `authorId`, `a.b` by its first part."""
    first, *rest = stored.split(".")
    field = next((candidate for candidate in item["fields"] if candidate["stored"] == first), None)
    return ".".join([field["field"]["name"] if field else first, *rest])


def _ordered(view: dict) -> list[dict]:
    """Embedded documents first: they are referred to by class name, but reading order helps."""
    return [
        *(item for item in view["classes"] if not item.get("collection")),
        *(item for item in view["classes"] if item.get("collection")),
    ]


def _mongoengine_file(view: dict, context) -> str:
    modules: set[str] = set()
    body: list[str] = []
    for item in view["enums"]:
        body.extend(["", "", *python_str_enum(item)])
    if view["enums"]:
        modules.add("enum")
    for item in _ordered(view):
        body.extend(["", ""])
        for todo in item["todos"]:
            body.append(f"# {todo_text(todo, item['name'], 'collection')}")
        body.append(
            f"class {py_identifier(item['name'])}(me.{'Document' if item.get('collection') else 'EmbeddedDocument'}):"
        )
        for field in item["fields"]:
            body.append(f"    {py_identifier(field['field']['name'])} = {_mongoengine_field(field, item, modules)}")
        collection = item.get("collection")
        if collection:
            indexes = [
                f'{{"fields": [{", ".join(py_string(_attribute_of(item, column)) for column in index["columns"])}], '
                f'"name": {py_string(index["name"])}}}'
                for index in collection["indexes"]
                if not index["unique"]
            ]
            listed = f', "indexes": [{", ".join(indexes)}]' if indexes else ""
            body.extend(["", f'    meta = {{"collection": {py_string(collection["name"])}{listed}}}'])
        elif not item["fields"]:
            body.append("    pass")
    return "\n".join(
        [
            *_header(context.title, "MongoEngine documents", "Review them before using them."),
            *_module_imports(modules),
            *([""] if modules else []),
            "import mongoengine as me",
            *body,
            "",
        ]
    )


class MongoEngineOutput:
    id = "mongoengine"
    label = "MongoEngine"
    group = "python"

    def write(self, physical: dict, context) -> list[dict]:
        view = build_document_view(context.schema, context.design, physical, context.settings["naming"])
        return [generated_file("documents.py", _mongoengine_file(view, context), "python")]


# ---------- Beanie ----------


def _beanie_type(field: dict, modules: set[str]) -> str:
    kind = field["kind"]
    if kind == "embedded":
        type_text = py_identifier(field["target"])
    elif kind == "reference":
        type_text = f"Link[{py_identifier(field['target'])}]"
    elif kind == "free":
        modules.add("typing")
        type_text = "Any"
    else:
        value, needs = python_value_type(field["type"])
        modules.update(needs)
        type_text = f"dict[str, {value}]" if kind == "map" else value
    if field["many"]:
        type_text = f"list[{type_text}]"
    return type_text


def _beanie_file(view: dict, context) -> str:
    modules: set[str] = set()
    body: list[str] = []
    uses_link = False
    uses_field = False
    for item in view["enums"]:
        body.extend(["", "", *python_str_enum(item)])
    if view["enums"]:
        modules.add("enum")
    for item in _ordered(view):
        body.extend(["", ""])
        for todo in item["todos"]:
            body.append(f"# {todo_text(todo, item['name'], 'collection')}")
        body.append(f"class {py_identifier(item['name'])}({'Document' if item.get('collection') else 'BaseModel'}):")
        for field in item["fields"]:
            if field["kind"] == "reference":
                uses_link = True
            type_text = _beanie_type(field, modules)
            settings = []
            if field["id"]:
                body.append(f'    id: {type_text} = Field(alias="_id")')
                uses_field = True
                continue
            if field["many"]:
                settings.append("default_factory=list")
            elif not field["required"] or field["nullable"]:
                type_text = f"{type_text} | None"
                settings.append("default=None")
            if field["stored"] != field["field"]["name"]:
                settings.append(f"alias={py_string(field['stored'])}")
            if settings:
                uses_field = True
            # A class may be declared further down: the whole annotation goes in quotes
            if field["kind"] in ("embedded", "reference"):
                type_text = py_string(type_text)
            default = f" = Field({', '.join(settings)})" if settings else ""
            body.append(f"    {py_identifier(field['field']['name'])}: {type_text}{default}")
        collection = item.get("collection")
        if collection:
            indexes = [
                f"IndexModel([{_index_keys(index)}], name={py_string(index['name'])}"
                f"{', unique=True' if index['unique'] else ''})"
                for index in collection["indexes"]
            ]
            body.extend(["", "    class Settings:", f"        name = {py_string(collection['name'])}"])
            if indexes:
                body.append(f"        indexes = [{', '.join(indexes)}]")
        elif not item["fields"]:
            body.append("    pass")
    beanie = ["Document", *(["Link"] if uses_link else [])]
    pydantic = ["BaseModel", *(["Field"] if uses_field else [])]
    uses_indexes = any(item.get("collection") and item["collection"]["indexes"] for item in view["classes"])
    return "\n".join(
        [
            *_header(
                context.title,
                "Beanie documents",
                "Pass the Document classes to init_beanie(). Review them before using them.",
            ),
            *_module_imports(modules),
            *(["from typing import Any"] if "typing" in modules else []),
            *([""] if modules else []),
            f"from beanie import {', '.join(beanie)}",
            f"from pydantic import {', '.join(pydantic)}",
            *(["from pymongo import ASCENDING, IndexModel"] if uses_indexes else []),
            *body,
            "",
        ]
    )


class BeanieOutput:
    id = "beanie"
    label = "Beanie"
    group = "python"

    def write(self, physical: dict, context) -> list[dict]:
        view = build_document_view(context.schema, context.design, physical, context.settings["naming"])
        return [generated_file("documents.py", _beanie_file(view, context), "python")]
