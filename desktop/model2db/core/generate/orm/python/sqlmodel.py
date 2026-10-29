"""SQLModel table models. Every column is written with `sa_column`, so it states exactly the type, keys and
constraints of the design; the migration is the same Alembic revision as for SQLAlchemy. Mirrors
web/src/core/generate/orm/python/sqlmodel.ts."""

import re

from ...todos import todo_text
from ...types import generated_file
from ..entities import build_entities, enum_members
from .alembic import migration_file
from .python import py_identifier, py_string, python_enum
from .sqlalchemy_types import column_settings, foreign_key_call, relationship_parts, type_parts


def _field_line(attribute: dict, view: dict, imports: dict) -> str:
    """`name: type = Field(..., sa_column=Column(...))` for one column."""
    column = attribute["column"]
    generated = column.get("generated")
    parts = type_parts(column["type"], view["enums"], False, generated == "identity")
    imports["sqlalchemy"].update(parts["imports"])
    imports["modules"].update(parts["modules"])
    if generated == "now":
        imports["sqlalchemy"].add("func")
    args = [
        *([py_string(column["name"])] if attribute["name"] != column["name"] else []),
        parts["sql"],
        foreign_key_call(attribute, ""),
        # The database default stays in the column; the instance gets it from the Field below
        *(setting for setting in column_settings(attribute, view, "") if not setting.startswith("default=uuid")),
        *(
            []
            if attribute["primaryKey"] or attribute["compositeKey"]
            else [f"nullable={'True' if column['nullable'] else 'False'}"]
        ),
    ]
    args = [arg for arg in args if arg]
    # Table models are not validated when built: a value the database fills can start as None
    filled_by_database = generated in ("identity", "now")
    default_arg = ""
    if generated == "uuid":
        imports["modules"].add("uuid")
        default_arg = "default_factory=uuid.uuid4, "
    elif column["nullable"] or filled_by_database:
        default_arg = "default=None, "
    elif column.get("defaultValue") is not None:
        literal = next(
            (setting for setting in column_settings(attribute, view, "") if setting.startswith("default=")), None
        )
        if literal:
            default_arg = f"{literal}, "
    python_type = f"{parts['python']} | None" if column["nullable"] or filled_by_database else parts["python"]
    name = py_identifier(attribute["name"])
    return f"{name}: {python_type} = Field({default_arg}sa_column=Column({', '.join(args)}))"


def _relationship_line(navigation: dict, owner: dict, links: dict[int, str]) -> str:
    parts = relationship_parts(navigation, owner)
    kwargs = [
        f'"foreign_keys": {py_string(parts["foreignKeys"])}' if parts.get("foreignKeys") else "",
        f'"remote_side": {py_string(parts["remoteSide"])}' if parts.get("remoteSide") else "",
        f'"cascade": {py_string(parts["cascade"])}' if parts.get("cascade") else "",
    ]
    kwargs = [item for item in kwargs if item]
    settings = [
        f"back_populates={py_string(parts['backPopulates'])}" if parts.get("backPopulates") else "",
        f"link_model={links.get(id(navigation['join']['table']))}" if navigation["kind"] == "manyToMany" else "",
        f"sa_relationship_kwargs={{{', '.join(kwargs)}}}" if kwargs else "",
    ]
    target = py_string(navigation["target"])
    type_text = f"Optional[{target}]" if navigation["kind"] == "manyToOne" else f"list[{target}]"
    arguments = ", ".join(item for item in settings if item)
    return f"{py_identifier(navigation['name'])}: {type_text} = Relationship({arguments})"


def link_name(join: dict, view: dict) -> str:
    """The class of a join table: the two keys, which together are its primary key."""
    first, second = join["foreignKeys"][0], join["foreignKeys"][1]
    owner = next((item["name"] for item in view["classes"] if item["table"]["name"] == first["table"]), "Owner")
    other = next((item["name"] for item in view["classes"] if item["table"]["name"] == second["table"]), "Other")
    if other == owner:
        other = re.sub(r"^.", lambda match: match.group(0).upper(), py_identifier(join.get("field") or "link"))
    return f"{owner}{other}Link"


def _models_file(view: dict, context) -> str:
    imports = {"sqlalchemy": {"Column"}, "modules": set()}
    body: list[str] = []
    if any(item["storage"] in ("check", "native") for item in view["enums"]):
        imports["modules"].add("enum")
        body.extend(
            [
                "",
                "",
                "def enum_values(enum_class: type[enum.Enum]) -> list[str]:",
                '    """Store the values of an enum (`paid`), not the names of its members (`PAID`)."""',
                "    return [str(member.value) for member in enum_class]",
            ]
        )
        for item in view["enums"]:
            if item["storage"] in ("check", "native"):
                body.extend(["", "", *python_enum(item["name"], enum_members(item, context.schema))])

    # Link models first: the relationships refer to them by class
    links: dict[int, str] = {}
    for join in view["joins"]:
        name = link_name(join, view)
        links[id(join)] = name
        body.extend(
            ["", "", f"class {name}(SQLModel, table=True):", f"    __tablename__ = {py_string(join['name'])}", ""]
        )
        for column in join["columns"]:
            parts = type_parts(column["type"], view["enums"], False, column.get("generated") == "identity")
            imports["sqlalchemy"].update(parts["imports"])
            fk = next(candidate for candidate in join["foreignKeys"] if candidate["columns"][0] == column["name"])
            action = f", ondelete={py_string(fk['onDelete'].upper())}" if fk.get("onDelete") else ""
            reference = f"ForeignKey({py_string(fk['table'] + '.' + fk['references'][0])}{action})"
            body.append(
                f"    {py_identifier(column['name'])}: {parts['python']} = "
                f"Field(sa_column=Column({parts['sql']}, {reference}, primary_key=True))"
            )

    uses_relationships = False
    for item in view["classes"]:
        body.extend(["", ""])
        for todo in item["table"]["todos"]:
            body.append(f"# {todo_text(todo, item['table']['model'], 'table')}")
        body.extend(
            [
                f"class {item['name']}(SQLModel, table=True):",
                f"    __tablename__ = {py_string(item['table']['name'])}",
                "",
            ]
        )
        for attribute in item["attributes"]:
            if attribute.get("foreignKey"):
                imports["sqlalchemy"].add("ForeignKey")
            body.append(f"    {_field_line(attribute, view, imports)}")
        if item["navigations"]:
            uses_relationships = True
            body.append("")
            for navigation in item["navigations"]:
                body.append(f"    {_relationship_line(navigation, item, links)}")
    if links:
        imports["sqlalchemy"].add("ForeignKey")

    typing = [*(["Optional"] if uses_relationships else []), *(["Any"] if "typing" in imports["modules"] else [])]
    header = [
        f'"""SQLModel models written by Model2DB from {context.title}. Review them before using them."""',
        "",
        *(f"import {name}" for name in sorted(imports["modules"]) if name != "typing"),
        *([f"from typing import {', '.join(sorted(typing))}"] if typing else []),
        "",
        f"from sqlalchemy import {', '.join(sorted(imports['sqlalchemy']))}",
        f"from sqlmodel import Field, {'Relationship, ' if uses_relationships else ''}SQLModel",
    ]
    return "\n".join([*header, *body, ""])


class SqlModelOutput:
    id = "sqlmodel"
    label = "SQLModel"
    group = "python"
    engines = ("postgresql", "mysql", "mariadb", "sqlite", "sqlserver", "oracle")
    migrations = True

    def write(self, physical: dict, context) -> list[dict]:
        view = build_entities(physical, context.schema, "snake_case")
        files = [generated_file("models.py", _models_file(view, context), "python")]
        if context.settings["migrations"]:
            files.append(
                generated_file(
                    "migrations/versions/0001_create_schema.py", migration_file(physical, view, context), "python"
                )
            )
        return files
