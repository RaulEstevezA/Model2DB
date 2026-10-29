"""Entity Framework Core: entity classes and a DbContext that configures every table, column type, key, index,
check and relation with the Fluent API. The column types are the ones the SQL output writes for the chosen engine.
EF Core writes its migrations from the model (`dotnet ef migrations add`), with a snapshot a hand-written migration
would lack, so none is written here. Mirrors web/src/core/generate/orm/csharp/efcore.ts."""

import re

from ....js import is_number, js_string
from ....model.naming import to_pascal_case
from ...sql.sql import sql_column_type
from ...todos import todo_text
from ...types import generated_file
from ..entities import build_entities, enum_members

NAMESPACE = "Example.Data"

PROVIDERS = {
    "sqlserver": "Microsoft.EntityFrameworkCore.SqlServer",
    "postgresql": "Npgsql.EntityFrameworkCore.PostgreSQL",
    "mysql": "Pomelo.EntityFrameworkCore.MySql",
    "mariadb": "Pomelo.EntityFrameworkCore.MySql",
    "sqlite": "Microsoft.EntityFrameworkCore.Sqlite",
    "oracle": "Oracle.EntityFrameworkCore",
}

KEYWORDS = set(
    """
    abstract as base bool break byte case catch char checked class const continue decimal default delegate do double
    else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal
    is lock long namespace new null object operator out override params private protected public readonly ref return
    sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked
    unsafe ushort using virtual void volatile while
    """.split()
)


def cs_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _property_name(name: str, owner: str) -> str:
    """Property name: PascalCase, never the class's own name (C# forbids it)."""
    pascal = to_pascal_case(name) or "Value"
    safe = f"@{pascal}" if pascal in KEYWORDS else pascal
    return f"{safe}Value" if safe == owner else safe


def _clr_type(column_type: dict, enums: list[dict]) -> tuple[str, bool]:
    """The C# type of a column, and whether it is a reference type."""
    kind = column_type["kind"]
    if kind in ("raw", "json"):
        return "string", True
    if kind == "array":
        inner, _ = _clr_type(column_type["items"], enums)
        return f"List<{inner}>", True
    if kind == "enum":
        item = next((candidate for candidate in enums if candidate["name"] == column_type["name"]), None)
        if item and item["storage"] in ("check", "native") and not any(is_number(value) for value in item["values"]):
            return item["name"], False
        if item and all(is_number(value) for value in item["values"]):
            return "int", False
        return "string", True
    name, bits = column_type["name"], column_type.get("bits")
    if name == "integer":
        return ("long" if bits == 64 else "short" if bits in (8, 16) else "int"), False
    if name == "float":
        return ("float" if bits == 32 else "double"), False
    return {
        "string": ("string", True),
        "decimal": ("decimal", False),
        "boolean": ("bool", False),
        "date": ("DateOnly", False),
        "datetime": ("DateTimeOffset", False),
        "time": ("TimeOnly", False),
        "duration": ("TimeSpan", False),
        "uuid": ("Guid", False),
        "binary": ("byte[]", True),
        "any": ("string", True),
    }[name]


def _enum_member_name(value: str) -> str:
    pascal = re.sub(r"\W", "", to_pascal_case(value), flags=re.ASCII)
    return f"Value{pascal}" if re.match(r"^\d", pascal) or pascal == "" else pascal


def _literal(value, column: dict, clr: str, enums: list[dict]) -> str | None:
    if value is None:
        return None
    item = (
        next((candidate for candidate in enums if candidate["name"] == column["type"]["name"]), None)
        if column["type"]["kind"] == "enum"
        else None
    )
    if item and clr == item["name"]:
        stored = next(
            (candidate for candidate in item["values"] if js_string(candidate).lower() == js_string(value).lower()),
            None,
        )
        return None if stored is None else f"{item['name']}.{_enum_member_name(js_string(stored))}"
    if isinstance(value, bool):
        return js_string(value) if clr == "bool" else None
    if is_number(value):
        text = js_string(value)
        if clr == "decimal":
            return f"{text}m"
        if clr == "float":
            return f"{text}f"
        if clr == "long":
            return f"{text}L"
        if clr == "double":
            return f"{text}.0" if float(value).is_integer() else text
        return text if clr in ("int", "short") else None
    return cs_string(value) if clr == "string" else None


def _enum_block(item: dict, context) -> list[str]:
    """The C# enums and how their members are stored (`Paid` ⇄ `paid`)."""
    members = enum_members(item, context.schema)
    values = [js_string(member["value"]) for member in members]
    names = [_enum_member_name(value) for value in values]
    name = item["name"]
    return [
        f"public enum {name}",
        "{",
        *(f"    {member}," for member in names),
        "}",
        "",
        f'/// <summary>The values of <see cref="{name}"/> as the database stores them.</summary>',
        f"public static class {name}Values",
        "{",
        f"    public static string ToValue({name} value) => value switch",
        "    {",
        *(f"        {name}.{names[i]} => {cs_string(value)}," for i, value in enumerate(values)),
        "        _ => throw new ArgumentOutOfRangeException(nameof(value)),",
        "    };",
        "",
        f"    public static {name} FromValue(string value) => value switch",
        "    {",
        *(f"        {cs_string(value)} => {name}.{names[i]}," for i, value in enumerate(values)),
        "        _ => throw new ArgumentOutOfRangeException(nameof(value)),",
        "    };",
        "}",
    ]


def _entity_block(item: dict, view: dict) -> list[str]:
    lines = [f"// {todo_text(todo, item['table']['model'], 'table')}" for todo in item["table"]["todos"]]
    lines.extend([f"public class {item['name']}", "{"])
    for attribute in item["attributes"]:
        column = attribute["column"]
        clr, reference = _clr_type(column["type"], view["enums"])
        nullable = "?" if column["nullable"] else ""
        initializer = " = null!;" if reference and not column["nullable"] else ""
        if column.get("defaultValue") is not None:
            value = _literal(column["defaultValue"], column, clr, view["enums"])
            if value:
                initializer = f" = {value};"
        lines.append(
            f"    public {clr}{nullable} {_property_name(attribute['name'], item['name'])} {{ get; set; }}{initializer}"
        )
    for navigation in item["navigations"]:
        name = _property_name(navigation["name"], item["name"])
        if navigation["kind"] == "manyToOne":
            mark, initializer = ("?", "") if navigation["nullable"] else ("", " = null!;")
            lines.append(f"    public {navigation['target']}{mark} {name} {{ get; set; }}{initializer}")
        else:
            lines.append(f"    public List<{navigation['target']}> {name} {{ get; set; }} = new();")
    lines.append("}")
    return lines


def _configuration(item: dict, view: dict, engine: str) -> list[str]:
    owner = item["name"]
    table = item["table"]

    def by_column(column: str) -> dict:
        return next(attribute for attribute in item["attributes"] if attribute["column"]["name"] == column)

    def members(columns: list[str]) -> str:
        return ", ".join(f"e.{_property_name(by_column(column)['name'], owner)}" for column in columns)

    checks = []
    for check in table["checks"]:
        values = ", ".join(
            js_string(value) if is_number(value) else "'" + js_string(value).replace("'", "''") + "'"
            for value in check["values"]
        )
        checks.append(
            f"t.HasCheckConstraint({cs_string(check['name'])}, {cs_string(check['column'] + ' IN (' + values + ')')})"
        )
    lines = [f"modelBuilder.Entity<{owner}>(entity =>", "{"]
    if checks:
        lines.append(f"    entity.ToTable({cs_string(table['name'])}, t => {{ {'; '.join(checks)}; }});")
    else:
        lines.append(f"    entity.ToTable({cs_string(table['name'])});")
    key = [_property_name(by_column(column)["name"], owner) for column in table["primaryKey"]]
    key_name = cs_string("pk_" + table["name"])
    if len(key) == 1:
        lines.append(f"    entity.HasKey(e => e.{key[0]}).HasName({key_name});")
    elif len(key) > 1:
        lines.append(f"    entity.HasKey(e => new {{ {', '.join(f'e.{name}' for name in key)} }}).HasName({key_name});")
    else:
        lines.append("    entity.HasNoKey();")
    for attribute in item["attributes"]:
        column = attribute["column"]
        settings = [
            f".HasColumnName({cs_string(column['name'])})",
            f".HasColumnType({cs_string(sql_column_type(column['type'], engine, view['enums']))})",
        ]
        if not column["nullable"]:
            settings.append(".IsRequired()")
        generated = column.get("generated")
        if attribute["primaryKey"]:
            settings.append(".ValueGeneratedOnAdd()" if generated in ("identity", "uuid") else ".ValueGeneratedNever()")
        if generated == "now":
            settings.append('.HasDefaultValueSql("CURRENT_TIMESTAMP")')
        clr, _ = _clr_type(column["type"], view["enums"])
        if column.get("defaultValue") is not None:
            value = _literal(column["defaultValue"], column, clr, view["enums"])
            if value:
                settings.append(f".HasDefaultValue({value})")
        enum_item = attribute.get("enum")
        if enum_item and clr == enum_item["name"]:
            name = enum_item["name"]
            settings.append(f".HasConversion(v => {name}Values.ToValue(v), v => {name}Values.FromValue(v))")
        lines.append(f"    entity.Property(e => e.{_property_name(attribute['name'], owner)}){''.join(settings)};")
    for unique in table["uniques"]:
        lines.append(
            f"    entity.HasIndex(e => new {{ {members(unique['columns'])} }}).IsUnique()"
            f".HasDatabaseName({cs_string(unique['name'])});"
        )
    for index in table["indexes"]:
        lines.append(
            f"    entity.HasIndex(e => new {{ {members(index['columns'])} }}){'.IsUnique()' if index['unique'] else ''}"
            f".HasDatabaseName({cs_string(index['name'])});"
        )
    for navigation in item["navigations"]:
        target = next((candidate for candidate in view["classes"] if candidate["name"] == navigation["target"]), None)
        if navigation["kind"] == "manyToOne":
            attribute = next(
                candidate for candidate in item["attributes"] if candidate["name"] == navigation["attribute"]
            )
            fk = attribute["foreignKey"]
            with_many = (
                f".WithMany(p => p.{_property_name(navigation['inverse'], target['name'])})"
                if navigation.get("inverse")
                else ".WithMany()"
            )
            reference = next(
                candidate for candidate in target["attributes"] if candidate["column"]["name"] == fk["references"][0]
            )
            principal = (
                ""
                if reference["primaryKey"]
                else f".HasPrincipalKey(p => p.{_property_name(reference['name'], target['name'])})"
            )
            on_delete = {"cascade": "Cascade", "set null": "SetNull"}.get(fk.get("onDelete"), "Restrict")
            lines.append(
                f"    entity.HasOne(e => e.{_property_name(navigation['name'], owner)}){with_many}"
                f".HasForeignKey(e => e.{_property_name(attribute['name'], owner)}){principal}"
                f".HasConstraintName({cs_string(fk['name'])}).OnDelete(DeleteBehavior.{on_delete});"
            )
        join = navigation.get("join")
        if (
            navigation["kind"] == "manyToMany"
            and join
            and join["ownerColumn"] == join["table"]["foreignKeys"][0]["columns"][0]
        ):
            with_many = (
                f".WithMany(p => p.{_property_name(navigation['inverse'], target['name'])})"
                if navigation.get("inverse")
                else ".WithMany()"
            )
            first, second = join["table"]["foreignKeys"][0], join["table"]["foreignKeys"][1]
            join_name = cs_string(join["table"]["name"])
            lines.extend(
                [
                    f"    entity.HasMany(e => e.{_property_name(navigation['name'], owner)}){with_many}"
                    ".UsingEntity<Dictionary<string, object>>(",
                    f"        {join_name},",
                    f"        r => r.HasOne<{target['name']}>().WithMany()"
                    f".HasForeignKey({cs_string(second['columns'][0])})"
                    f".HasConstraintName({cs_string(second['name'])}).OnDelete(DeleteBehavior.Cascade),",
                    f"        l => l.HasOne<{owner}>().WithMany().HasForeignKey({cs_string(first['columns'][0])})"
                    f".HasConstraintName({cs_string(first['name'])}).OnDelete(DeleteBehavior.Cascade),",
                    f"        j => {{ j.ToTable({join_name}); j.HasKey({cs_string(first['columns'][0])}, "
                    f"{cs_string(second['columns'][0])}).HasName({cs_string('pk_' + join['table']['name'])}); }});",
                ]
            )
    lines.append("});")
    return lines


def _context_name(title: str) -> str:
    return f"{to_pascal_case(title)}DbContext"


def _models_file(view: dict, context) -> str:
    body: list[str] = []
    for item in view["enums"]:
        if item["storage"] in ("check", "native") and not any(is_number(value) for value in item["values"]):
            body.extend(["", *_enum_block(item, context)])
    for item in view["classes"]:
        body.extend(["", *_entity_block(item, view)])
    return "\n".join(
        [
            f"// Entities written by Model2DB from {context.title}. Review them before using them.",
            "using System;",
            "using System.Collections.Generic;",
            "",
            f"namespace {NAMESPACE};",
            *body,
            "",
        ]
    )


def _context_file(view: dict, engine: str, context) -> str:
    name = _context_name(context.title)
    sets = [
        f"    public DbSet<{item['name']}> {_property_name(item['table']['name'], name)} => Set<{item['name']}>();"
        for item in view["classes"]
    ]
    config = [
        line
        for item in view["classes"]
        for line in ["", *(f"        {entry}" for entry in _configuration(item, view, engine))]
    ]
    return "\n".join(
        [
            f"// DbContext written by Model2DB from {context.title}, for {PROVIDERS[engine]}.",
            "// Create the database with `dotnet ef migrations add InitialCreate` and `dotnet ef database update`.",
            "using System.Collections.Generic;",
            "using Microsoft.EntityFrameworkCore;",
            "",
            f"namespace {NAMESPACE};",
            "",
            f"public class {name}(DbContextOptions<{name}> options) : DbContext(options)",
            "{",
            *sets,
            "",
            "    protected override void OnModelCreating(ModelBuilder modelBuilder)",
            "    {",
            *config[1:],
            "    }",
            "}",
            "",
        ]
    )


class EfCoreOutput:
    id = "efcore"
    label = "Entity Framework Core"
    group = "csharp"
    engines = ("sqlserver", "postgresql", "mysql", "mariadb", "sqlite", "oracle")

    def write(self, physical: dict, context) -> list[dict]:
        engine = context.settings["engine"]
        view = build_entities(physical, context.schema, "camelCase")
        title = to_pascal_case(context.title)
        return [
            generated_file(f"Data/{title}Entities.cs", _models_file(view, context), "csharp"),
            generated_file(f"Data/{_context_name(context.title)}.cs", _context_file(view, engine, context), "csharp"),
        ]
