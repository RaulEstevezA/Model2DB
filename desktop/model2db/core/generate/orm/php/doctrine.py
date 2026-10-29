"""Doctrine ORM entities with PHP attributes, and a Doctrine Migrations class with the schema written for the
chosen engine (`addSql`, as Doctrine writes its own migrations). Mirrors web/src/core/generate/orm/php/doctrine.ts."""

from ....js import is_number, js_string
from ...sql.statements import schema_statements
from ...todos import todo_text
from ...types import generated_file
from ..entities import build_entities
from .php import backed_enum, case_name, is_backed_enum, php_string, php_type, sql_literal

NAMESPACE = "App\\Entity"


def _enum_width(item: dict) -> int:
    longest = max([1, *(len(js_string(value)) for value in item["values"])])
    return 20 if longest <= 20 else 50 if longest <= 50 else 255


def _dbal_type(column_type: dict, enums: list[dict]) -> list[str]:
    """The Doctrine DBAL type and its column settings."""
    kind = column_type["kind"]
    if kind in ("raw", "json", "array"):
        return ["type: Types::JSON"]
    if kind == "enum":
        item = next((candidate for candidate in enums if candidate["name"] == column_type["name"]), None)
        if item and all(is_number(value) for value in item["values"]):
            return ["type: Types::INTEGER"]
        settings = ["type: Types::STRING", f"length: {_enum_width(item) if item else 255}"]
        if item and is_backed_enum(item):
            settings.append(f"enumType: {item['name']}::class")
        return settings
    name, bits = column_type["name"], column_type.get("bits")
    if name == "string":
        length = column_type.get("length")
        return ["type: Types::STRING", f"length: {length}"] if length else ["type: Types::TEXT"]
    if name == "integer":
        return [
            "type: Types::BIGINT"
            if bits == 64
            else "type: Types::SMALLINT"
            if bits in (8, 16)
            else "type: Types::INTEGER"
        ]
    if name == "decimal":
        precision = column_type.get("precision")
        scale = column_type.get("scale")
        return [
            "type: Types::DECIMAL",
            f"precision: {18 if precision is None else precision}",
            f"scale: {2 if scale is None else scale}",
        ]
    if name == "duration":
        return ["type: Types::STRING", "length: 50"]
    return [
        {
            "float": "type: Types::FLOAT",
            "boolean": "type: Types::BOOLEAN",
            "date": "type: Types::DATE_IMMUTABLE",
            "datetime": "type: Types::DATETIMETZ_IMMUTABLE",
            "time": "type: Types::TIME_IMMUTABLE",
            "uuid": "type: Types::GUID",
            "binary": "type: Types::BLOB",
            "any": "type: Types::JSON",
        }[name]
    ]


def _property_type(column_type: dict, enums: list[dict]) -> str:
    """PHP type of a property: the DBAL type's PHP value."""
    if column_type["kind"] == "primitive" and column_type["name"] == "binary":
        return "mixed"
    if column_type["kind"] == "primitive" and column_type["name"] in ("time", "date", "datetime"):
        return "\\DateTimeImmutable"
    return php_type(column_type, enums)


def _literal(value, column: dict, php: str, enums: list[dict]) -> str | None:
    if value is None:
        return None
    item = (
        next((candidate for candidate in enums if candidate["name"] == column["type"]["name"]), None)
        if column["type"]["kind"] == "enum"
        else None
    )
    if item and php == item["name"]:
        stored = next(
            (candidate for candidate in item["values"] if js_string(candidate).lower() == js_string(value).lower()),
            None,
        )
        return None if stored is None else f"{item['name']}::{case_name(js_string(stored))}"
    if isinstance(value, bool):
        return js_string(value) if php == "bool" else None
    if is_number(value):
        if php in ("int", "float"):
            return js_string(value)
        return php_string(js_string(value)) if php == "string" else None
    return php_string(value) if php == "string" else None


def _member(attributes: list[str], declaration: str, name: str, type_text: str, collection: bool) -> dict:
    return {
        "attributes": attributes,
        "declaration": declaration,
        "property": {"name": name, "type": type_text, "collection": collection},
    }


def _column_member(attribute: dict, view: dict) -> dict:
    column = attribute["column"]
    generated = column.get("generated")
    attributes = []
    if attribute["primaryKey"] or attribute["compositeKey"]:
        attributes.append("#[ORM\\Id]")
    if attribute["primaryKey"] and generated == "identity":
        attributes.append("#[ORM\\GeneratedValue(strategy: 'IDENTITY')]")
    settings = [f"name: {php_string(column['name'])}", *_dbal_type(column["type"], view["enums"])]
    if column["nullable"]:
        settings.append("nullable: true")
    if generated == "now":
        settings.append("options: ['default' => 'CURRENT_TIMESTAMP']")
    attributes.append(f"#[ORM\\Column({', '.join(settings)})]")
    type_text = _property_type(column["type"], view["enums"])
    nullable = bool(column["nullable"] or (attribute["primaryKey"] and generated) or generated == "now")
    initial = " = null" if nullable and type_text != "mixed" else ""
    if column.get("defaultValue") is not None:
        value = _literal(column["defaultValue"], column, type_text, view["enums"])
        if value:
            initial = f" = {value}"
    declared = "mixed" if type_text == "mixed" else f"{'?' if nullable else ''}{type_text}"
    return _member(attributes, f"private {declared} ${attribute['name']}{initial};", attribute["name"], declared, False)


def _relation_member(navigation: dict, item: dict, view: dict) -> dict:
    target = next(candidate for candidate in view["classes"] if candidate["name"] == navigation["target"])
    kind = navigation["kind"]
    inversed = f", inversedBy: {php_string(navigation['inverse'])}" if navigation.get("inverse") else ""
    if kind == "manyToOne":
        attribute = next(candidate for candidate in item["attributes"] if candidate["name"] == navigation["attribute"])
        fk = attribute["foreignKey"]
        attributes = []
        if attribute["compositeKey"] or attribute["primaryKey"]:
            attributes.append("#[ORM\\Id]")
        on_delete = f", onDelete: {php_string(fk['onDelete'].upper())}" if fk.get("onDelete") else ""
        attributes.extend(
            [
                f"#[ORM\\ManyToOne(targetEntity: {target['name']}::class{inversed})]",
                f"#[ORM\\JoinColumn(name: {php_string(attribute['column']['name'])}, "
                f"referencedColumnName: {php_string(fk['references'][0])}, "
                f"nullable: {'true' if navigation['nullable'] else 'false'}{on_delete})]",
            ]
        )
        type_text = f"{'?' if navigation['nullable'] else ''}{target['name']}"
        declaration = f"private {type_text} ${navigation['name']}{' = null' if navigation['nullable'] else ''};"
        return _member(attributes, declaration, navigation["name"], type_text, False)
    declaration = f"private Collection ${navigation['name']};"
    if kind == "oneToMany":
        cascade = ", cascade: ['persist', 'remove'], orphanRemoval: true" if navigation["cascade"] else ""
        attributes = [
            f"#[ORM\\OneToMany(targetEntity: {target['name']}::class, "
            f"mappedBy: {php_string(navigation['inverse'])}{cascade})]"
        ]
        return _member(attributes, declaration, navigation["name"], "Collection", True)
    join = navigation["join"]
    owner = join["ownerColumn"] == join["table"]["foreignKeys"][0]["columns"][0]
    first, second = join["table"]["foreignKeys"][0], join["table"]["foreignKeys"][1]
    if owner:
        attributes = [
            f"#[ORM\\ManyToMany(targetEntity: {target['name']}::class{inversed})]",
            f"#[ORM\\JoinTable(name: {php_string(join['table']['name'])})]",
            f"#[ORM\\JoinColumn(name: {php_string(first['columns'][0])}, "
            f"referencedColumnName: {php_string(first['references'][0])}, onDelete: 'CASCADE')]",
            f"#[ORM\\InverseJoinColumn(name: {php_string(second['columns'][0])}, "
            f"referencedColumnName: {php_string(second['references'][0])}, onDelete: 'CASCADE')]",
        ]
    else:
        attributes = [
            f"#[ORM\\ManyToMany(targetEntity: {target['name']}::class, mappedBy: {php_string(navigation['inverse'])})]"
        ]
    return _member(attributes, declaration, navigation["name"], "Collection", True)


def _entity_file(item: dict, view: dict, context) -> str:
    navigated = {navigation.get("attribute") for navigation in item["navigations"] if navigation["kind"] == "manyToOne"}
    # A key column with its navigation is mapped by the navigation's JoinColumn
    members = [
        _column_member(attribute, view) for attribute in item["attributes"] if attribute["name"] not in navigated
    ]
    members.extend(_relation_member(navigation, item, view) for navigation in item["navigations"])
    table = item["table"]
    class_attributes = ["#[ORM\\Entity]", f"#[ORM\\Table(name: {php_string(table['name'])})]"]
    for index in table["indexes"]:
        columns = ", ".join(php_string(column) for column in index["columns"])
        class_attributes.append(f"#[ORM\\Index(name: {php_string(index['name'])}, columns: [{columns}])]")
    for unique in table["uniques"]:
        columns = ", ".join(php_string(column) for column in unique["columns"])
        class_attributes.append(f"#[ORM\\UniqueConstraint(name: {php_string(unique['name'])}, columns: [{columns}])]")
    collections = [member for member in members if member["property"]["collection"]]
    uses = ["Doctrine\\DBAL\\Types\\Types", "Doctrine\\ORM\\Mapping as ORM"]
    if collections:
        uses = ["Doctrine\\Common\\Collections\\ArrayCollection", "Doctrine\\Common\\Collections\\Collection", *uses]
    for attribute in item["attributes"]:
        enum_item = attribute.get("enum")
        if enum_item and is_backed_enum(enum_item):
            uses.append(f"App\\Enum\\{enum_item['name']}")
    body: list[str] = []
    for member in members:
        body.extend([*(f"    {line}" for line in member["attributes"]), f"    {member['declaration']}", ""])
    if collections:
        body.extend(
            [
                "    public function __construct()",
                "    {",
                *(f"        $this->{member['property']['name']} = new ArrayCollection();" for member in collections),
                "    }",
                "",
            ]
        )
    for member in members:
        name, type_text = member["property"]["name"], member["property"]["type"]
        capital = name[:1].upper() + name[1:]
        body.extend(
            [f"    public function get{capital}(): {type_text}", "    {", f"        return $this->{name};", "    }", ""]
        )
        if not member["property"]["collection"]:
            body.extend(
                [
                    f"    public function set{capital}({type_text} ${name}): static",
                    "    {",
                    f"        $this->{name} = ${name};",
                    "",
                    "        return $this;",
                    "    }",
                    "",
                ]
            )
    if body:
        body.pop()
    return "\n".join(
        [
            "<?php",
            "",
            f"namespace {NAMESPACE};",
            "",
            *(f"use {name};" for name in sorted(set(uses))),
            "",
            f"/** Entity written by Model2DB from {context.title}. Review it before using it. */",
            *(f"// {todo_text(todo, table['model'], 'table')}" for todo in table["todos"]),
            *class_attributes,
            f"class {item['name']}",
            "{",
            *body,
            "}",
            "",
        ]
    )


def _migration_file(physical: dict, context) -> str:
    up, down = schema_statements(physical, context.settings["engine"], context.title)
    return "\n".join(
        [
            "<?php",
            "",
            "declare(strict_types=1);",
            "",
            "namespace DoctrineMigrations;",
            "",
            "use Doctrine\\DBAL\\Schema\\Schema;",
            "use Doctrine\\Migrations\\AbstractMigration;",
            "",
            f"/** Migration written by Model2DB from {context.title}: "
            "the schema as Model2DB writes it for this engine. */",
            "final class Version20250101000000 extends AbstractMigration",
            "{",
            "    public function getDescription(): string",
            "    {",
            f"        return {php_string(f'Create the {context.title} schema')};",
            "    }",
            "",
            "    public function up(Schema $schema): void",
            "    {",
            *(f"        $this->addSql({sql_literal(sql, '            ')});" for sql in up),
            "    }",
            "",
            "    public function down(Schema $schema): void",
            "    {",
            *(f"        $this->addSql({php_string(sql)});" for sql in down),
            "    }",
            "}",
            "",
        ]
    )


class DoctrineOutput:
    id = "doctrine"
    label = "Doctrine ORM"
    group = "php"
    engines = ("mysql", "mariadb", "postgresql", "sqlite", "sqlserver", "oracle")
    migrations = True

    def write(self, physical: dict, context) -> list[dict]:
        view = build_entities(physical, context.schema, "camelCase")
        files = []
        for item in view["enums"]:
            if is_backed_enum(item):
                files.append(
                    generated_file(
                        f"src/Enum/{item['name']}.php", backed_enum("App\\Enum", item["name"], item["values"]), "php"
                    )
                )
        for item in view["classes"]:
            files.append(generated_file(f"src/Entity/{item['name']}.php", _entity_file(item, view, context), "php"))
        if context.settings["migrations"]:
            files.append(
                generated_file("migrations/Version20250101000000.php", _migration_file(physical, context), "php")
            )
        return files
