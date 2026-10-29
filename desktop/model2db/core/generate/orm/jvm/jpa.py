"""Jakarta Persistence entities in Java, in three flavors: plain JPA, Hibernate (its own types for JSON, arrays and
creation times) and Spring Data JPA (plus a repository per entity). The migration is a Flyway script with the
schema of the chosen engine. List and map tables are element collections of their owner, as JPA maps them.
Mirrors web/src/core/generate/orm/jvm/jpa.ts."""

import re

from ....js import is_number, js_string
from ....model.naming import to_screaming_snake_case
from ...sql.sql import generate_sql
from ...todos import todo_text
from ...types import generated_file
from ..entities import build_entities, enum_members

PACKAGE = "com.example.model"
REPOSITORY_PACKAGE = "com.example.repository"

KEYWORDS = set(
    """
    abstract assert boolean break byte case catch char class const continue default do double else enum extends final
    finally float for goto if implements import instanceof int interface long native new package private protected
    public return short static strictfp super switch synchronized this throw throws transient try void volatile while
    var record yield
    """.split()
)


def java_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def java_name(name: str) -> str:
    clean = re.sub(r"\W", "_", name, flags=re.ASCII)
    return f"{clean}Value" if clean in KEYWORDS else clean


def _enum_width(item: dict) -> int:
    longest = max([1, *(len(js_string(value)) for value in item["values"])])
    return 20 if longest <= 20 else 50 if longest <= 50 else 255


def java_type(column_type: dict, enums: list[dict]) -> tuple[str, list[str]]:
    """The Java type of a column, wrapper types so that NULL fits."""
    kind = column_type["kind"]
    if kind in ("raw", "json"):
        return "String", []
    if kind == "array":
        inner, imports = java_type(column_type["items"], enums)
        return f"List<{inner}>", ["java.util.List", *imports]
    if kind == "enum":
        item = next((candidate for candidate in enums if candidate["name"] == column_type["name"]), None)
        if item and item["storage"] in ("check", "native"):
            return item["name"], []
        return ("Integer", []) if item and all(is_number(value) for value in item["values"]) else ("String", [])
    name, bits = column_type["name"], column_type.get("bits")
    if name == "integer":
        return ("Long" if bits == 64 else "Short" if bits in (8, 16) else "Integer"), []
    if name == "float":
        return ("Float" if bits == 32 else "Double"), []
    return {
        "string": ("String", []),
        "decimal": ("BigDecimal", ["java.math.BigDecimal"]),
        "boolean": ("Boolean", []),
        "date": ("LocalDate", ["java.time.LocalDate"]),
        "datetime": ("OffsetDateTime", ["java.time.OffsetDateTime"]),
        "time": ("LocalTime", ["java.time.LocalTime"]),
        "duration": ("Duration", ["java.time.Duration"]),
        "uuid": ("UUID", ["java.util.UUID"]),
        "binary": ("byte[]", []),
        "any": ("String", []),
    }[name]


def _enum_constant(value: str) -> str:
    constant = re.sub(r"\W", "_", to_screaming_snake_case(value), flags=re.ASCII)
    return f"VALUE_{constant}" if re.match(r"^\d", constant) else constant or "EMPTY"


def _literal(value, column: dict, java: str, enums: list[dict]) -> str | None:
    if value is None:
        return None
    item = (
        next((candidate for candidate in enums if candidate["name"] == column["type"]["name"]), None)
        if column["type"]["kind"] == "enum"
        else None
    )
    if item and java == item["name"]:
        stored = next(
            (candidate for candidate in item["values"] if js_string(candidate).lower() == js_string(value).lower()),
            None,
        )
        return None if stored is None else f"{item['name']}.{_enum_constant(js_string(stored))}"
    if isinstance(value, bool):
        return js_string(value) if java == "Boolean" else None
    if is_number(value):
        text = js_string(value)
        if java == "Long":
            return f"{text}L"
        if java == "Double":
            return f"{text}.0" if float(value).is_integer() else text
        if java == "Float":
            return f"{text}f"
        if java == "Short":
            return f"(short) {text}"
        if java == "BigDecimal":
            return f"new BigDecimal({java_string(text)})"
        return text if java == "Integer" else None
    return java_string(value) if java == "String" else None


class _ClassFile:
    def __init__(self, engine: str, context):
        self.engine = engine
        self.context = context
        self.imports: set[str] = set()
        self.persistence: set[str] = {"Entity", "Table"}
        self.hibernate: set[str] = set()
        self.lines: list[str] = []


def _element_collection(table: dict, view: dict, file: _ClassFile, field_name: str) -> list[str]:
    """Fields of a table that is not an entity: list and map tables, mapped on their owner."""
    owner_column = table["foreignKeys"][0]["columns"][0]
    second_name = table["primaryKey"][1] if len(table["primaryKey"]) > 1 else None
    value = next(column for column in table["columns"] if column["name"] not in (owner_column, second_name))
    second = next(column for column in table["columns"] if column["name"] == second_name)
    type_text, imports = java_type(value["type"], view["enums"])
    file.imports.update(imports)
    file.persistence.update(("ElementCollection", "CollectionTable", "JoinColumn", "Column"))
    lines = [
        "@ElementCollection",
        f"@CollectionTable(name = {java_string(table['name'])}, "
        f"joinColumns = @JoinColumn(name = {java_string(owner_column)}))",
    ]
    if table["kind"] == "list":
        file.persistence.add("OrderColumn")
        file.imports.update(("java.util.List", "java.util.ArrayList"))
        lines.extend(
            [
                f"@OrderColumn(name = {java_string(second['name'])})",
                f"@Column(name = {java_string(value['name'])})",
                f"private List<{type_text}> {field_name} = new ArrayList<>();",
            ]
        )
    else:
        file.persistence.add("MapKeyColumn")
        file.imports.update(("java.util.Map", "java.util.HashMap"))
        lines.extend(
            [
                f"@MapKeyColumn(name = {java_string(second['name'])})",
                f"@Column(name = {java_string(value['name'])})",
                f"private Map<String, {type_text}> {field_name} = new HashMap<>();",
            ]
        )
    return lines


def _column_annotation(column: dict, extra: list[str]) -> str:
    settings = [f"name = {java_string(column['name'])}"]
    column_type = column["type"]
    if not column["nullable"]:
        settings.append("nullable = false")
    if column_type["kind"] == "primitive" and column_type["name"] == "string" and column_type.get("length"):
        settings.append(f"length = {column_type['length']}")
    if column_type["kind"] == "primitive" and column_type["name"] == "decimal":
        precision = column_type.get("precision")
        scale = column_type.get("scale")
        settings.extend(
            [f"precision = {18 if precision is None else precision}", f"scale = {2 if scale is None else scale}"]
        )
    return f"@Column({', '.join([*settings, *extra])})"


def _field_lines(attribute: dict, view: dict, flavor: str, file: _ClassFile) -> list[str]:
    column = attribute["column"]
    column_type = column["type"]
    type_text, imports = java_type(column_type, view["enums"])
    file.imports.update(imports)
    lines = []
    file.persistence.add("Column")
    generated = column.get("generated")
    if attribute["primaryKey"]:
        file.persistence.add("Id")
        lines.append("@Id")
        if generated == "identity":
            file.persistence.update(("GeneratedValue", "GenerationType"))
            lines.append("@GeneratedValue(strategy = GenerationType.IDENTITY)")
        if generated == "uuid":
            file.persistence.update(("GeneratedValue", "GenerationType"))
            lines.append("@GeneratedValue(strategy = GenerationType.UUID)")
    enum_item = attribute.get("enum")
    # A PostgreSQL enum type does not take text as it is: Hibernate casts it when writing
    if enum_item and enum_item["storage"] == "native" and file.engine == "postgresql":
        if flavor == "jpa":
            file.context.note({"code": "enumNeedsCast", "params": {"orm": "JPA", "enum": enum_item["name"]}})
        else:
            file.hibernate.add("annotations.ColumnTransformer")
            lines.append(f"@ColumnTransformer(write = {java_string('?::' + enum_item['sqlName'])})")
    if flavor != "jpa" and (
        column_type["kind"] == "json" or (column_type["kind"] == "primitive" and column_type["name"] == "any")
    ):
        file.hibernate.update(("annotations.JdbcTypeCode", "type.SqlTypes"))
        lines.append("@JdbcTypeCode(SqlTypes.JSON)")
    if column_type["kind"] == "array":
        file.hibernate.update(("annotations.JdbcTypeCode", "type.SqlTypes"))
        lines.append("@JdbcTypeCode(SqlTypes.ARRAY)")
    if generated == "now" and flavor != "jpa":
        file.hibernate.add("annotations.CreationTimestamp")
        lines.append("@CreationTimestamp")
    enum_length = (
        [f"length = {_enum_width(enum_item)}"]
        if enum_item and enum_item["storage"] != "native" and type_text != "Integer"
        else []
    )
    # Without Hibernate, the database fills the creation time: JPA must not write it
    fill = ["insertable = false", "updatable = false"] if generated == "now" and flavor == "jpa" else []
    lines.append(_column_annotation(column, [*fill, *enum_length]))
    initializer = ""
    if column.get("defaultValue") is not None:
        value = _literal(column["defaultValue"], column, type_text, view["enums"])
        if value:
            initializer = f" = {value}"
    lines.append(f"private {type_text} {java_name(attribute['name'])}{initializer};")
    return lines


def _relation_lines(navigation: dict, item: dict, view: dict, list_tables: dict, file: _ClassFile) -> list[str]:
    name = java_name(navigation["name"])
    kind = navigation["kind"]
    if kind == "manyToOne":
        attribute = next(candidate for candidate in item["attributes"] if candidate["name"] == navigation["attribute"])
        fk = attribute["foreignKey"]
        file.persistence.update(("ManyToOne", "FetchType", "JoinColumn", "ForeignKey"))
        target = next(candidate for candidate in view["classes"] if candidate["name"] == navigation["target"])
        reference = next(
            (
                candidate
                for candidate in target["attributes"]
                if not candidate["primaryKey"] and candidate["column"]["name"] == fk["references"][0]
            ),
            None,
        )
        settings = [
            f"name = {java_string(attribute['column']['name'])}",
            *([f"referencedColumnName = {java_string(fk['references'][0])}"] if reference else []),
            *([] if attribute["column"]["nullable"] else ["nullable = false"]),
            f"foreignKey = @ForeignKey(name = {java_string(fk['name'])})",
        ]
        return [
            f"@ManyToOne(fetch = FetchType.LAZY{'' if navigation['nullable'] else ', optional = false'})",
            f"@JoinColumn({', '.join(settings)})",
            f"private {navigation['target']} {name};",
        ]
    if kind == "oneToMany":
        table = list_tables.get(f"{item['name']}.{navigation['name']}")
        if table:
            return _element_collection(table, view, file, name)
        file.persistence.add("OneToMany")
        file.imports.update(("java.util.List", "java.util.ArrayList"))
        if navigation["cascade"]:
            file.persistence.add("CascadeType")
        settings = [
            f"mappedBy = {java_string(navigation['inverse'])}",
            *(["cascade = CascadeType.ALL", "orphanRemoval = true"] if navigation["cascade"] else []),
        ]
        return [
            f"@OneToMany({', '.join(settings)})",
            f"private List<{navigation['target']}> {name} = new ArrayList<>();",
        ]
    file.persistence.add("ManyToMany")
    file.imports.update(("java.util.Set", "java.util.HashSet"))
    join = navigation["join"]
    owner = join["ownerColumn"] == join["table"]["foreignKeys"][0]["columns"][0]
    if not owner:
        return [
            f"@ManyToMany(mappedBy = {java_string(navigation['inverse'])})",
            f"private Set<{navigation['target']}> {name} = new HashSet<>();",
        ]
    file.persistence.update(("JoinTable", "JoinColumn"))
    return [
        "@ManyToMany",
        f"@JoinTable(name = {java_string(join['table']['name'])}, "
        f"joinColumns = @JoinColumn(name = {java_string(join['ownerColumn'])}), "
        f"inverseJoinColumns = @JoinColumn(name = {java_string(join['targetColumn'])}))",
        f"private Set<{navigation['target']}> {name} = new HashSet<>();",
    ]


def _table_annotation(table: dict, file: _ClassFile) -> str:
    settings = [f"name = {java_string(table['name'])}"]
    if table["uniques"]:
        file.persistence.add("UniqueConstraint")
        uniques = ", ".join(
            f"@UniqueConstraint(name = {java_string(unique['name'])}, "
            f"columnNames = {{ {', '.join(java_string(column) for column in unique['columns'])} }})"
            for unique in table["uniques"]
        )
        settings.append(f"uniqueConstraints = {{ {uniques} }}")
    if table["indexes"]:
        file.persistence.add("Index")
        indexes = ", ".join(
            f"@Index(name = {java_string(index['name'])}, columnList = {java_string(', '.join(index['columns']))}"
            f"{', unique = true' if index['unique'] else ''})"
            for index in table["indexes"]
        )
        settings.append(f"indexes = {{ {indexes} }}")
    if table["checks"]:
        file.persistence.add("CheckConstraint")
        checks = []
        for check in table["checks"]:
            values = ", ".join(
                js_string(value) if is_number(value) else "'" + js_string(value).replace("'", "''") + "'"
                for value in check["values"]
            )
            constraint = java_string(f"{check['column']} IN ({values})")
            checks.append(f"@CheckConstraint(name = {java_string(check['name'])}, constraint = {constraint})")
        settings.append(f"check = {{ {', '.join(checks)} }}")
    return f"@Table({', '.join(settings)})"


def _render(file: _ClassFile, package_name: str) -> str:
    imports = [
        *(f"import jakarta.persistence.{name};" for name in sorted(file.persistence)),
        *(f"import org.hibernate.{name};" for name in sorted(file.hibernate)),
        *(f"import {name};" for name in sorted(file.imports)),
    ]
    return "\n".join([f"package {package_name};", "", *imports, *([""] if imports else []), *file.lines, ""])


def _entity_file(item: dict, view: dict, flavor: str, list_tables: dict, context) -> str:
    file = _ClassFile(context.settings["engine"], context)
    members: list[list[str]] = []
    navigated = {navigation.get("attribute") for navigation in item["navigations"] if navigation["kind"] == "manyToOne"}
    for attribute in item["attributes"]:
        # A key column with its navigation is mapped by the navigation's @JoinColumn
        if attribute["name"] in navigated and not attribute["primaryKey"]:
            continue
        members.append(_field_lines(attribute, view, flavor, file))
    for navigation in item["navigations"]:
        members.append(_relation_lines(navigation, item, view, list_tables, file))
    file.lines.extend(
        [
            f"/** Entity written by Model2DB from {context.title}. Review it before using it. */",
            *(f"// {todo_text(todo, item['table']['model'], 'table')}" for todo in item["table"]["todos"]),
            "@Entity",
            _table_annotation(item["table"], file),
            f"public class {item['name']} {{",
            "\n\n".join("\n".join(f"    {line}" for line in lines) for lines in members),
        ]
    )
    # Getters and setters keep the fields private, as JPA providers and Spring expect
    accessors = []
    for lines in members:
        declaration = re.sub(r" = .*;$", ";", lines[-1])
        match = re.match(r"^private (.+) (\w+);$", declaration, flags=re.ASCII)
        if not match:
            continue
        type_text, name = match.group(1), match.group(2)
        capital = name[:1].upper() + name[1:]
        accessors.append(f"    public {type_text} get{capital}() {{\n        return {name};\n    }}")
        accessors.append(f"    public void set{capital}({type_text} {name}) {{\n        this.{name} = {name};\n    }}")
    file.lines.extend(["", "\n\n".join(accessors), "}"])
    return _render(file, PACKAGE)


def _enum_file(item: dict, context) -> str:
    members = enum_members(item, context.schema)
    constants = [
        f"    {_enum_constant(js_string(member['value']))}({java_string(js_string(member['value']))})"
        for member in members
    ]
    name = item["name"]
    listed = ",\n".join(constants)
    return "\n".join(
        [
            f"package {PACKAGE};",
            "",
            f"/** The values of {name} as the database stores them. */",
            f"public enum {name} {{",
            f"{listed};",
            "",
            "    private final String value;",
            "",
            f"    {name}(String value) {{",
            "        this.value = value;",
            "    }",
            "",
            "    public String getValue() {",
            "        return value;",
            "    }",
            "}",
            "",
        ]
    )


def _converter_file(item: dict) -> str:
    """Stores the enum's values (`paid`) rather than the constants' names (`PAID`)."""
    name = item["name"]
    return "\n".join(
        [
            f"package {PACKAGE};",
            "",
            "import jakarta.persistence.AttributeConverter;",
            "import jakarta.persistence.Converter;",
            "",
            "@Converter(autoApply = true)",
            f"public class {name}Converter implements AttributeConverter<{name}, String> {{",
            "    @Override",
            f"    public String convertToDatabaseColumn({name} value) {{",
            "        return value == null ? null : value.getValue();",
            "    }",
            "",
            "    @Override",
            f"    public {name} convertToEntityAttribute(String value) {{",
            "        if (value == null) return null;",
            f"        for ({name} candidate : {name}.values()) "
            "if (candidate.getValue().equals(value)) return candidate;",
            f'        throw new IllegalArgumentException("Unknown {name}: " + value);',
            "    }",
            "}",
            "",
        ]
    )


def _repository_file(item: dict, view: dict) -> str | None:
    key = next((attribute for attribute in item["attributes"] if attribute["primaryKey"]), None)
    if not key:
        return None
    type_text, imports = java_type(key["column"]["type"], view["enums"])
    return "\n".join(
        [
            f"package {REPOSITORY_PACKAGE};",
            "",
            f"import {PACKAGE}.{item['name']};",
            "import org.springframework.data.jpa.repository.JpaRepository;",
            *(f"import {name};" for name in imports),
            "",
            f"public interface {item['name']}Repository extends JpaRepository<{item['name']}, {type_text}> {{}}",
            "",
        ]
    )


def _path(name: str, package: str = PACKAGE) -> str:
    return f"src/main/java/{package.replace('.', '/')}/{name}.java"


class JpaOutput:
    group = "jvm"
    engines = ("postgresql", "mysql", "mariadb", "sqlite", "sqlserver", "oracle")
    migrations = True

    def __init__(self, output_id: str, label: str, flavor: str):
        self.id = output_id
        self.label = label
        self.flavor = flavor

    def write(self, physical: dict, context) -> list[dict]:
        view = build_entities(physical, context.schema, "camelCase")
        # List and map tables are element collections of their owner, not entities
        list_tables: dict[str, dict] = {}
        for item in view["classes"]:
            if item["table"]["kind"] not in ("list", "map"):
                continue

            def lists(navigation: dict, item=item) -> bool:
                return navigation["kind"] == "oneToMany" and navigation["target"] == item["name"]

            owner = next(
                (
                    candidate
                    for candidate in view["classes"]
                    if any(lists(navigation) for navigation in candidate["navigations"])
                ),
                None,
            )
            navigation = (
                next((candidate for candidate in owner["navigations"] if lists(candidate)), None) if owner else None
            )
            if owner and navigation:
                list_tables[f"{owner['name']}.{navigation['name']}"] = item["table"]
        entities = [item for item in view["classes"] if item["table"]["kind"] not in ("list", "map")]
        files = []
        for item in view["enums"]:
            if item["storage"] not in ("check", "native"):
                continue
            if any(is_number(value) for value in item["values"]):
                continue
            files.append(generated_file(_path(item["name"]), _enum_file(item, context), "java"))
            files.append(generated_file(_path(f"{item['name']}Converter"), _converter_file(item), "java"))
        for item in entities:
            files.append(
                generated_file(_path(item["name"]), _entity_file(item, view, self.flavor, list_tables, context), "java")
            )
        if self.flavor == "spring":
            for item in entities:
                content = _repository_file(item, view)
                if content:
                    files.append(
                        generated_file(_path(f"{item['name']}Repository", REPOSITORY_PACKAGE), content, "java")
                    )
        if context.settings["migrations"]:
            files.append(
                generated_file(
                    "src/main/resources/db/migration/V1__create_schema.sql",
                    generate_sql(physical, context.settings["engine"], context.title),
                    "sql",
                )
            )
        return files


def jpa_outputs() -> tuple[JpaOutput, JpaOutput, JpaOutput]:
    return (
        JpaOutput("jpa", "JPA (Jakarta Persistence)", "jpa"),
        JpaOutput("hibernate", "Hibernate", "hibernate"),
        JpaOutput("spring-data-jpa", "Spring Data JPA", "spring"),
    )
