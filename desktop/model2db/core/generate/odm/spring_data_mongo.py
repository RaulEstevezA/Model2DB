"""Spring Data MongoDB documents, the classes embedded in them and a repository per collection. References keep
only the other document's id (`@DocumentReference`). Enum constants are the stored values, which is what Spring
Data writes. Mirrors web/src/core/generate/odm/springDataMongo.ts."""

import re

from ...js import coalesce, js_string
from ..orm.jvm.jpa import java_string
from ..todos import todo_text
from ..types import generated_file
from .documents import build_document_view

PACKAGE = "com.example.document"
REPOSITORY_PACKAGE = "com.example.repository"
_JAVA_IDENTIFIER = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")


def _enum_writable(field: dict) -> bool:
    """An enum whose stored values can be Java constants is written as an enum; otherwise as text."""
    item = field.get("enum")
    return item is not None and all(
        _JAVA_IDENTIFIER.match(js_string(coalesce(value.get("value"), value["name"]))) for value in item["values"]
    )


def _value_type(field: dict, imports: set[str]) -> str:
    type_ref = field["type"]
    if type_ref["kind"] == "enum":
        return type_ref["name"] if _enum_writable(field) else "String"
    if type_ref["kind"] != "primitive":
        return "Object"
    name = type_ref["name"]
    if name == "integer":
        return "Long" if type_ref.get("bits") == 64 else "Integer"
    needs = {
        "decimal": ("java.math.BigDecimal", "BigDecimal"),
        "date": ("java.time.LocalDate", "LocalDate"),
        "datetime": ("java.time.Instant", "Instant"),
        "uuid": ("java.util.UUID", "UUID"),
    }
    if name in needs:
        imports.add(needs[name][0])
        return needs[name][1]
    return {
        "string": "String",
        "time": "String",
        "duration": "String",
        "float": "Double",
        "boolean": "Boolean",
        "binary": "byte[]",
        "any": "Object",
    }[name]


def _member(field: dict, imports: set[str], annotations: set[str]) -> dict:
    kind = field["kind"]
    if kind in ("embedded", "reference"):
        type_text = field["target"]
    elif kind == "free":
        type_text = "Object"
    else:
        type_text = _value_type(field, imports)
        if kind == "map":
            imports.add("java.util.Map")
            type_text = f"Map<String, {type_text}>"
    initial = ""
    if field["many"]:
        imports.update(("java.util.List", "java.util.ArrayList"))
        type_text = f"List<{type_text}>"
        initial = " = new ArrayList<>()"
    listed = []
    if field["id"]:
        annotations.add("org.springframework.data.annotation.Id")
        listed.append("@Id")
    elif field["stored"] != field["field"]["name"]:
        annotations.add("org.springframework.data.mongodb.core.mapping.Field")
        listed.append(f"@Field({java_string(field['stored'])})")
    if kind == "reference":
        annotations.add("org.springframework.data.mongodb.core.mapping.DocumentReference")
        listed.append("@DocumentReference(lazy = true)")
    return {"annotations": listed, "type": type_text, "name": field["field"]["name"], "initial": initial}


def _class_file(item: dict, context) -> str:
    imports: set[str] = set()
    annotations: set[str] = set()
    members = [_member(field, imports, annotations) for field in item["fields"]]
    if item["objectId"]:
        annotations.add("org.springframework.data.annotation.Id")
        members.insert(0, {"annotations": ["@Id"], "type": "String", "name": "id", "initial": ""})
    head = []
    collection = item.get("collection")
    if collection:
        annotations.add("org.springframework.data.mongodb.core.mapping.Document")
        head.append(f"@Document(collection = {java_string(collection['name'])})")
        if collection["indexes"]:
            annotations.update(
                (
                    "org.springframework.data.mongodb.core.index.CompoundIndex",
                    "org.springframework.data.mongodb.core.index.CompoundIndexes",
                )
            )
            indexes = []
            for index in collection["indexes"]:
                definition = "{" + ", ".join(f"'{column}': 1" for column in index["columns"]) + "}"
                unique = ", unique = true" if index["unique"] else ""
                indexes.append(
                    f"@CompoundIndex(name = {java_string(index['name'])}, def = {java_string(definition)}{unique})"
                )
            head.append(f"@CompoundIndexes({{ {', '.join(indexes)} }})")
    fields = [
        "\n".join(
            [
                *(f"    {line}" for line in entry["annotations"]),
                f"    private {entry['type']} {entry['name']}{entry['initial']};",
            ]
        )
        for entry in members
    ]
    accessors = []
    for entry in members:
        name, type_text = entry["name"], entry["type"]
        capital = name[:1].upper() + name[1:]
        accessors.append(
            f"    public {type_text} get{capital}() {{\n        return {name};\n    }}\n\n"
            f"    public void set{capital}({type_text} {name}) {{\n        this.{name} = {name};\n    }}"
        )
    all_imports = [*sorted(annotations), *sorted(imports)]
    kind = "Document" if collection else "Embedded value"
    return "\n".join(
        [
            f"package {PACKAGE};",
            "",
            *(f"import {name};" for name in all_imports),
            *([""] if all_imports else []),
            f"/** {kind} written by Model2DB from {context.title}. Review it before using it. */",
            *(f"// {todo_text(todo, item['name'], 'collection')}" for todo in item["todos"]),
            *head,
            f"public class {item['name']} {{",
            "\n\n".join(fields),
            *(["", "\n\n".join(accessors)] if accessors else []),
            "}",
            "",
        ]
    )


def _enum_file(name: str, values: list) -> str:
    constants = ",\n    ".join(js_string(value) for value in values)
    return "\n".join([f"package {PACKAGE};", "", f"public enum {name} {{", f"    {constants}", "}", ""])


def _repository_file(item: dict) -> str:
    imports: set[str] = set()
    found = next((field for field in item["fields"] if field["id"]), None)
    id_type = _value_type(found, imports) if found else "String"
    return "\n".join(
        [
            f"package {REPOSITORY_PACKAGE};",
            "",
            f"import {PACKAGE}.{item['name']};",
            "import org.springframework.data.mongodb.repository.MongoRepository;",
            *(f"import {name};" for name in imports),
            "",
            f"public interface {item['name']}Repository extends MongoRepository<{item['name']}, {id_type}> {{}}",
            "",
        ]
    )


def _path(name: str, package: str = PACKAGE) -> str:
    return f"src/main/java/{package.replace('.', '/')}/{name}.java"


class SpringDataMongoOutput:
    id = "spring-data-mongodb"
    label = "Spring Data MongoDB"
    group = "jvm"

    def write(self, physical: dict, context) -> list[dict]:
        view = build_document_view(context.schema, context.design, physical, context.settings["naming"])
        files = []
        for item in view["enums"]:
            values = [coalesce(value.get("value"), value["name"]) for value in item["values"]]
            if all(_JAVA_IDENTIFIER.match(js_string(value)) for value in values):
                files.append(generated_file(_path(item["name"]), _enum_file(item["name"], values), "java"))
        for item in view["classes"]:
            files.append(generated_file(_path(item["name"]), _class_file(item, context), "java"))
        for item in view["classes"]:
            if item.get("collection"):
                files.append(
                    generated_file(
                        _path(f"{item['name']}Repository", REPOSITORY_PACKAGE), _repository_file(item), "java"
                    )
                )
        return files
