"""Django models (5.2 or later, for composite primary keys) and the initial migration. The migration is written
for an app labelled `app`: rename it to yours in both files. Mirrors web/src/core/generate/orm/python/django.ts."""

import re

from ....js import is_number, js_string
from ...todos import todo_text
from ...types import generated_file
from ..entities import build_entities, enum_members
from .python import order_tables, py_identifier, py_string

APP = "app"
ON_DELETE = {"cascade": "models.CASCADE", "set null": "models.SET_NULL"}
NO_RELATED_NAME = 'related_name="+"'


def _enum_length(item: dict) -> int:
    longest = max([1, *(len(js_string(value)) for value in item["values"])])
    return 20 if longest <= 20 else 50 if longest <= 50 else 255


def _py_value(value) -> str:
    """A stored enum value as Python writes it: numbers as they are, texts quoted."""
    return js_string(value) if is_number(value) else py_string(js_string(value))


def _literal(value, column: dict, enums: list[dict]) -> str:
    if value is None:
        return "None"
    if isinstance(value, bool):
        return "True" if value else "False"
    if is_number(value):
        return js_string(value)
    item = (
        next((candidate for candidate in enums if candidate["name"] == column["type"]["name"]), None)
        if column["type"]["kind"] == "enum"
        else None
    )
    stored = (
        next((candidate for candidate in item["values"] if js_string(candidate).lower() == value.lower()), None)
        if item
        else None
    )
    if is_number(stored):
        return js_string(stored)
    return py_string(js_string(value if stored is None else stored))


def _field(name: str, expression, many_to_many: bool = False) -> dict:
    """`expression(cls)`: the field, with the target class as it must be written in each file."""
    return {"name": name, "manyToMany": many_to_many, "expression": expression}


def _field_type(column_type: dict, enums: list[dict], migration: bool, labels: dict | None = None) -> tuple[str, list]:
    """The Django field class and its type arguments for a column."""
    labels = labels or {}
    kind = column_type["kind"]
    if kind in ("raw", "json"):
        return "models.JSONField", []
    if kind == "array":
        inner_name, inner_args = _field_type(column_type["items"], enums, migration, labels)
        return "ArrayField", [f"{inner_name}({', '.join(inner_args)})"]
    if kind == "enum":
        item = next((candidate for candidate in enums if candidate["name"] == column_type["name"]), None)
        if not item:
            return "models.CharField", ["max_length=255"]
        numeric = all(is_number(value) for value in item["values"])
        if migration:
            pairs = ", ".join(
                f"({_py_value(value)}, "
                f"{py_string(labels.get(item['name'] + '.' + js_string(value), js_string(value)))})"
                for value in item["values"]
            )
            choices = f"choices=[{pairs}]"
        else:
            choices = f"choices={py_identifier(item['name'])}.choices"
        if numeric:
            return "models.IntegerField", [choices]
        return "models.CharField", [f"max_length={_enum_length(item)}", choices]
    name, bits = column_type["name"], column_type.get("bits")
    if name == "string":
        length = column_type.get("length")
        return ("models.CharField", [f"max_length={length}"]) if length else ("models.TextField", [])
    if name == "integer":
        if bits == 64:
            return "models.BigIntegerField", []
        if bits in (8, 16):
            return "models.SmallIntegerField", []
        return "models.IntegerField", []
    if name == "decimal":
        precision = column_type.get("precision")
        scale = column_type.get("scale")
        return "models.DecimalField", [
            f"max_digits={18 if precision is None else precision}",
            f"decimal_places={2 if scale is None else scale}",
        ]
    return {
        "float": "models.FloatField",
        "boolean": "models.BooleanField",
        "date": "models.DateField",
        "datetime": "models.DateTimeField",
        "time": "models.TimeField",
        "duration": "models.DurationField",
        "uuid": "models.UUIDField",
        "binary": "models.BinaryField",
        "any": "models.JSONField",
    }[name], []


def _fields_of(item: dict, view: dict, migration: bool, labels: dict | None = None) -> list[dict]:
    """The fields of a class: plain columns, foreign keys (named after their navigation) and many-to-many lists."""
    fields: list[dict] = []
    for attribute in item["attributes"]:
        column = attribute["column"]
        navigation = next(
            (
                candidate
                for candidate in item["navigations"]
                if candidate["kind"] == "manyToOne" and candidate.get("attribute") == attribute["name"]
            ),
            None,
        )
        fk = attribute.get("foreignKey")
        target = (
            next((candidate for candidate in view["classes"] if candidate["table"]["name"] == fk["table"]), None)
            if fk
            else None
        )
        common: list[str] = []
        if attribute["primaryKey"]:
            common.append("primary_key=True")
            if migration:
                common.append("serialize=False")
        if column["nullable"]:
            common.extend(["null=True", "blank=True"])
        if attribute["unique"]:
            common.append("unique=True")
        if column.get("defaultValue") is not None:
            common.append(f"default={_literal(column['defaultValue'], column, view['enums'])}")
        if fk and target:
            # Django names the attribute after the related object and adds `_id` for the column
            name = navigation["name"] if navigation else re.sub(r"_id$", "", attribute["name"])
            related = (
                f"related_name={py_string(navigation['inverse'])}"
                if navigation and navigation.get("inverse")
                else NO_RELATED_NAME
            )
            on_delete = ON_DELETE[fk["onDelete"]] if fk.get("onDelete") else "models.PROTECT"
            column_name = [] if f"{name}_id" == column["name"] else [f"db_column={py_string(column['name'])}"]
            settings = [*column_name, *(setting for setting in common if not setting.startswith("default="))]

            def expression(cls, target=target, on_delete=on_delete, related=related, settings=settings):
                arguments = [cls(target["name"]), f"on_delete={on_delete}", related, *settings]
                return f"models.ForeignKey({', '.join(arguments)})"

            fields.append(_field(name, expression))
            continue
        type_name, type_args = _field_type(column["type"], view["enums"], migration, labels)
        if attribute["primaryKey"] and column.get("generated") == "identity":
            big = column["type"]["kind"] == "primitive" and column["type"].get("bits") == 64
            type_name, type_args = ("models.BigAutoField" if big else "models.AutoField"), []
        extra = [*type_args, *common]
        if column.get("generated") == "uuid":
            extra.append("default=uuid.uuid4")
        if column.get("generated") == "now":
            extra.append("auto_now_add=True")
        if attribute["indexed"] and not attribute["unique"]:
            extra.append("db_index=True")
        if attribute["name"] != column["name"]:
            extra.append(f"db_column={py_string(column['name'])}")
        text = f"{type_name}({', '.join(extra)})"
        fields.append(_field(attribute["name"], lambda cls, text=text: text))
    for navigation in item["navigations"]:
        join = navigation.get("join")
        if (
            navigation["kind"] != "manyToMany"
            or not join
            or join["ownerColumn"] != join["table"]["foreignKeys"][0]["columns"][0]
        ):
            continue
        through = through_name(join["table"], view)
        related = f"related_name={py_string(navigation['inverse'])}" if navigation.get("inverse") else NO_RELATED_NAME

        def expression(cls, navigation=navigation, through=through, related=related):
            return (
                f"models.ManyToManyField({', '.join([cls(navigation['target']), f'through={cls(through)}', related])})"
            )

        fields.append(_field(navigation["name"], expression, True))
    return fields


def through_name(join: dict, view: dict) -> str:
    first, second = join["foreignKeys"][0], join["foreignKeys"][1]
    owner = next((item["name"] for item in view["classes"] if item["table"]["name"] == first["table"]), "Owner")
    other = next((item["name"] for item in view["classes"] if item["table"]["name"] == second["table"]), "Other")
    if other == owner:
        other = re.sub(r"^.", lambda match: match.group(0).upper(), py_identifier(join.get("field") or "link"))
    return f"{owner}{other}Link"


def _through_fields(join: dict, view: dict) -> list[dict]:
    """The class written for a join table: two foreign keys that are together the primary key."""
    fields = []
    for fk in join["foreignKeys"]:
        target = next(item for item in view["classes"] if item["table"]["name"] == fk["table"])
        name = re.sub(r"_id$", "", fk["columns"][0])
        column_name = [] if f"{name}_id" == fk["columns"][0] else [f"db_column={py_string(fk['columns'][0])}"]

        def expression(cls, target=target, column_name=column_name):
            settings = [cls(target["name"]), "on_delete=models.CASCADE", NO_RELATED_NAME, *column_name]
            return f"models.ForeignKey({', '.join(settings)})"

        fields.append(_field(name, expression))
    return fields


def _meta_lines(table: dict) -> list[str]:
    lines = [f"db_table = {py_string(table['name'])}"]
    constraints = []
    for check in table["checks"]:
        values = ", ".join(js_string(value) if is_number(value) else py_string(value) for value in check["values"])
        constraints.append(
            f"models.CheckConstraint(condition=models.Q({check['column']}__in=[{values}]), "
            f"name={py_string(check['name'])})"
        )
    for index in table["indexes"]:
        if len(index["columns"]) > 1:
            columns = ", ".join(py_string(column) for column in index["columns"])
            constraints.append(f"models.Index(fields=[{columns}], name={py_string(index['name'])})")
    if constraints:
        lines.append(f"constraints = [{', '.join(constraints)}]")
    return lines


def _composite_key(table: dict, fields: list[dict], item: dict | None, migration: bool = False) -> str | None:
    if len(table["primaryKey"]) < 2:
        return None
    names = []
    for column in table["primaryKey"]:
        attribute = (
            next((candidate for candidate in item["attributes"] if candidate["column"]["name"] == column), None)
            if item
            else None
        )
        field = next(
            (
                candidate
                for candidate in fields
                if (attribute is not None and candidate["name"] == attribute["name"])
                or f"{candidate['name']}_id" == column
            ),
            None,
        )
        names.append(field["name"] if field else column)
    # The migration states what Django fills in for a composite key
    settings = ", blank=True, editable=False, primary_key=True, serialize=False" if migration else ""
    return f"models.CompositePrimaryKey({', '.join(py_string(name) for name in names)}{settings})"


def _models_file(view: dict, context) -> str:
    modules: set[str] = set()
    body: list[str] = []
    for item in view["enums"]:
        members = enum_members(item, context.schema)
        numeric = all(is_number(member["value"]) for member in members)
        body.extend(
            ["", "", f"class {py_identifier(item['name'])}(models.{'IntegerChoices' if numeric else 'TextChoices'}):"]
        )
        for member in members:
            body.append(
                f"    {py_identifier(member['name'].upper())} = "
                f"{_py_value(member['value'])}, {py_string(member['name'])}"
            )
        if not members:
            body.append("    pass")

    def write(name: str, table: dict, fields: list[dict], item: dict | None) -> None:
        body.extend(["", ""])
        for todo in table["todos"]:
            body.append(f"# {todo_text(todo, table['model'], 'table')}")
        body.append(f"class {name}(models.Model):")
        composite = _composite_key(table, fields, item)
        if composite:
            body.append(f"    pk = {composite}")
        for field in fields:
            expression = field["expression"](py_string)
            if "uuid.uuid4" in expression:
                modules.add("uuid")
            if expression.startswith("ArrayField"):
                modules.add("array")
            body.append(f"    {py_identifier(field['name'])} = {expression}")
        body.extend(["", "    class Meta:", *(f"        {line}" for line in _meta_lines(table))])

    for item in view["classes"]:
        write(item["name"], item["table"], _fields_of(item, view, False), item)
    for join in view["joins"]:
        write(through_name(join, view), join, _through_fields(join, view), None)
    header = [
        f'"""Django models written by Model2DB from {context.title}. Review them before using them."""',
        "",
        *(["import uuid", ""] if "uuid" in modules else []),
        *(["from django.contrib.postgres.fields import ArrayField"] if "array" in modules else []),
        "from django.db import models",
    ]
    return "\n".join([*header, *body, ""])


def _migration_file(physical: dict, view: dict, context) -> str:
    def cls(name: str) -> str:
        return py_string(f"{APP}.{name}")

    operations: list[str] = []
    later: list[str] = []
    # The label of each choice is the member's name, as in the models' Choices classes
    labels = {
        f"{item['name']}.{js_string(member['value'])}": member["name"]
        for item in view["enums"]
        for member in enum_members(item, context.schema)
    }
    uses_uuid = False
    uses_array = False
    for table in order_tables(physical["tables"]):
        item = next((candidate for candidate in view["classes"] if candidate["table"] is table), None)
        name = item["name"] if item else through_name(table, view)
        fields = _fields_of(item, view, True, labels) if item else _through_fields(table, view)
        lines: list[str] = []
        for field in fields:
            expression = field["expression"](cls)
            if "uuid.uuid4" in expression:
                uses_uuid = True
            if expression.startswith("ArrayField"):
                uses_array = True
            if field["manyToMany"]:
                later.extend(
                    [
                        "        migrations.AddField(",
                        f"            model_name={py_string(name.lower())},",
                        f"            name={py_string(field['name'])},",
                        f"            field={expression},",
                        "        ),",
                    ]
                )
            else:
                lines.append(f"                ({py_string(field['name'])}, {expression}),")
        composite = _composite_key(table, fields, item, True)
        if composite:
            lines.insert(0, f'                ("pk", {composite}),')
        for todo in table["todos"]:
            operations.append(f"        # {todo_text(todo, table['model'], 'table')}")
        options = []
        for line in _meta_lines(table):
            key, *value = line.split(" = ")
            options.append(f"{py_string(key)}: {' = '.join(value)}")
        operations.extend(
            [
                "        migrations.CreateModel(",
                f"            name={py_string(name)},",
                "            fields=[",
                *lines,
                "            ],",
                f"            options={{{', '.join(options)}}},",
                "        ),",
            ]
        )
    return "\n".join(
        [
            f'"""Initial migration written by Model2DB from {context.title}, for the app labelled "{APP}".',
            "",
            "Rename the app label to yours, then run `python manage.py migrate`.",
            '"""',
            "",
            *(["import uuid", ""] if uses_uuid else []),
            *(["from django.contrib.postgres.fields import ArrayField"] if uses_array else []),
            "from django.db import migrations, models",
            "",
            "",
            "class Migration(migrations.Migration):",
            "    initial = True",
            "",
            "    dependencies = []",
            "",
            "    operations = [",
            *operations,
            *later,
            "    ]",
            "",
        ]
    )


class DjangoOutput:
    id = "django"
    label = "Django ORM"
    group = "python"
    engines = ("postgresql", "mysql", "mariadb", "sqlite", "oracle")
    migrations = True

    def write(self, physical: dict, context) -> list[dict]:
        view = build_entities(physical, context.schema, "snake_case")
        files = [generated_file("models.py", _models_file(view, context), "python")]
        if context.settings["migrations"]:
            files.append(
                generated_file("migrations/0001_initial.py", _migration_file(physical, view, context), "python")
            )
        return files
