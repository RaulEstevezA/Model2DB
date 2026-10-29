"""Laravel Eloquent models, and a migration that runs the schema written for the chosen engine. Mirrors
web/src/core/generate/orm/php/eloquent.ts."""

from ...sql.statements import schema_statements
from ...todos import todo_text
from ...types import file_base, generated_file
from ..entities import build_entities
from .php import backed_enum, is_backed_enum, php_string, sql_literal


def _cast(column: dict, view: dict) -> str | None:
    """Eloquent's cast of a column, when its value is not plain text."""
    column_type = column["type"]
    kind = column_type["kind"]
    if kind == "enum":
        item = next((candidate for candidate in view["enums"] if candidate["name"] == column_type["name"]), None)
        return f"{item['name']}::class" if item and is_backed_enum(item) else None
    if kind in ("json", "array"):
        return "'array'"
    if kind != "primitive":
        return None
    if column_type["name"] == "decimal":
        scale = column_type.get("scale")
        return f"'decimal:{2 if scale is None else scale}'"
    return {
        "integer": "'integer'",
        "float": "'float'",
        "boolean": "'boolean'",
        "date": "'immutable_date'",
        "datetime": "'immutable_datetime'",
        "any": "'array'",
    }.get(column_type["name"])


def _model_file(item: dict, view: dict, context) -> str:
    imports = {"Illuminate\\Database\\Eloquent\\Model"}
    table = item["table"]
    lines = [f"    protected $table = {php_string(table['name'])};", ""]
    key = table["primaryKey"]
    key_attribute = (
        next((attribute for attribute in item["attributes"] if attribute["column"]["name"] == key[0]), None)
        if len(key) == 1
        else None
    )
    if key_attribute:
        column = key_attribute["column"]
        lines.append(f"    protected $primaryKey = {php_string(column['name'])};")
        numeric = column["type"]["kind"] == "primitive" and column["type"]["name"] == "integer"
        if column.get("generated") != "identity":
            lines.append("    public $incrementing = false;")
        if not numeric:
            lines.append("    protected $keyType = 'string';")
    else:
        # Eloquent has no composite keys: rows are created and read here, changed through their owner
        lines.extend(["    protected $primaryKey = null;", "    public $incrementing = false;"])
        context.note({"code": "compositeKeyReadOnly", "params": {"orm": "Laravel Eloquent", "table": table["name"]}})
    lines.extend(["    public $timestamps = false;", ""])
    fillable = [
        php_string(attribute["column"]["name"])
        for attribute in item["attributes"]
        if attribute["column"].get("generated") != "identity"
    ]
    lines.append(f"    protected $fillable = [{', '.join(fillable)}];")
    casts = []
    for attribute in item["attributes"]:
        value = _cast(attribute["column"], view)
        if value:
            casts.append(f"            {php_string(attribute['column']['name'])} => {value},")
    if casts:
        for attribute in item["attributes"]:
            enum_item = attribute.get("enum")
            if enum_item and is_backed_enum(enum_item):
                imports.add(f"App\\Enums\\{enum_item['name']}")
        lines.extend(
            ["", "    protected function casts(): array", "    {", "        return [", *casts, "        ];", "    }"]
        )
    for navigation in item["navigations"]:
        target = next(candidate for candidate in view["classes"] if candidate["name"] == navigation["target"])
        kind = navigation["kind"]
        if kind == "manyToOne":
            attribute = next(
                candidate for candidate in item["attributes"] if candidate["name"] == navigation["attribute"]
            )
            relation = "BelongsTo"
            body = (
                f"$this->belongsTo({target['name']}::class, {php_string(attribute['column']['name'])}, "
                f"{php_string(attribute['foreignKey']['references'][0])})"
            )
        elif kind == "oneToMany":
            attribute = next(
                candidate for candidate in target["attributes"] if candidate["name"] == navigation["attribute"]
            )
            relation = "HasMany"
            body = (
                f"$this->hasMany({target['name']}::class, {php_string(attribute['column']['name'])}, "
                f"{php_string(attribute['foreignKey']['references'][0])})"
            )
        else:
            join = navigation["join"]
            relation = "BelongsToMany"
            body = (
                f"$this->belongsToMany({target['name']}::class, {php_string(join['table']['name'])}, "
                f"{php_string(join['ownerColumn'])}, {php_string(join['targetColumn'])})"
            )
        imports.add(f"Illuminate\\Database\\Eloquent\\Relations\\{relation}")
        lines.extend(
            ["", f"    public function {navigation['name']}(): {relation}", "    {", f"        return {body};", "    }"]
        )
    return "\n".join(
        [
            "<?php",
            "",
            "namespace App\\Models;",
            "",
            *(f"use {name};" for name in sorted(imports)),
            "",
            f"/** Model written by Model2DB from {context.title}. Review it before using it. */",
            *(f"// {todo_text(todo, table['model'], 'table')}" for todo in table["todos"]),
            f"class {item['name']} extends Model",
            "{",
            *lines,
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
            "use Illuminate\\Database\\Migrations\\Migration;",
            "use Illuminate\\Support\\Facades\\DB;",
            "",
            f"/** Migration written by Model2DB from {context.title}: "
            "the schema as Model2DB writes it for this engine. */",
            "return new class extends Migration",
            "{",
            "    public function up(): void",
            "    {",
            *(f"        DB::statement({sql_literal(sql, '            ')});" for sql in up),
            "    }",
            "",
            "    public function down(): void",
            "    {",
            *(f"        DB::statement({php_string(sql)});" for sql in down),
            "    }",
            "};",
            "",
        ]
    )


class EloquentOutput:
    id = "eloquent"
    label = "Laravel Eloquent"
    group = "php"
    engines = ("mysql", "mariadb", "postgresql", "sqlite", "sqlserver")
    migrations = True

    def write(self, physical: dict, context) -> list[dict]:
        view = build_entities(physical, context.schema, "camelCase")
        files = []
        for item in view["enums"]:
            if is_backed_enum(item):
                files.append(
                    generated_file(
                        f"app/Enums/{item['name']}.php", backed_enum("App\\Enums", item["name"], item["values"]), "php"
                    )
                )
        for item in view["classes"]:
            files.append(generated_file(f"app/Models/{item['name']}.php", _model_file(item, view, context), "php"))
        if context.settings["migrations"]:
            files.append(
                generated_file(
                    f"database/migrations/2025_01_01_000000_create_{file_base(context.title)}_schema.php",
                    _migration_file(physical, context),
                    "php",
                )
            )
        return files
