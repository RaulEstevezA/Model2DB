"""Every output, in the order the selector shows them, and generating the files of one. Mirrors
web/src/core/generate/outputs.ts."""

from dataclasses import dataclass

from ..model.schema import default_root
from ..physical.document import build_document
from ..physical.relational.schema import build_relational
from .mongodb.mongodb import generate_mongo
from .odm.mongoose import MongooseOutput
from .odm.python.mongo import BeanieOutput, MongoEngineOutput, PyMongoOutput
from .odm.spring_data_mongo import SpringDataMongoOutput
from .orm.csharp.efcore import EfCoreOutput
from .orm.jvm.jpa import jpa_outputs
from .orm.php.doctrine import DoctrineOutput
from .orm.php.eloquent import EloquentOutput
from .orm.python.django import DjangoOutput
from .orm.python.sqlalchemy import SqlAlchemyOutput
from .orm.python.sqlmodel import SqlModelOutput
from .orm.python.tortoise import TortoiseOutput
from .orm.typescript.drizzle import DrizzleOutput
from .orm.typescript.prisma import PrismaOutput
from .orm.typescript.sequelize import SequelizeOutput
from .orm.typescript.typeorm import TypeOrmOutput
from .sql.sql import DIALECT_NAMES, generate_sql
from .types import WriteContext, file_base, generated_file


@dataclass(frozen=True)
class Output:
    """An entry of the output selector, whatever kind of database it writes for."""

    id: str
    label: str
    group: str
    target: str
    writer: object
    engines: tuple[str, ...] | None = None
    migrations: bool = False

    def generate(self, schema: dict, design: dict, settings: dict, title: str) -> dict:
        if self.target == "relational":
            engine = _engine_of(self.writer, settings)
            physical = build_relational(
                schema, design, {"naming": settings["naming"], "strings": settings["strings"], "dialect": engine}
            )
            context = WriteContext(schema, design, {**settings, "engine": engine}, title)
        else:
            physical = build_document(schema, design, settings["naming"])
            context = WriteContext(schema, design, settings, title)
        files = self.writer.write(physical, context)
        return {"physical": {**physical, "notes": [*physical["notes"], *context.notes]}, "files": files}


def _engine_of(writer, settings: dict) -> str:
    """The engine a writer builds for: its own (plain SQL), or the one chosen among those it supports."""
    engines = getattr(writer, "engines", None)
    if not engines:
        return writer.id
    return settings["engine"] if settings["engine"] in engines else engines[0]


def _output(writer, target: str) -> Output:
    return Output(
        id=writer.id,
        label=writer.label,
        group=writer.group,
        target=target,
        writer=writer,
        engines=tuple(writer.engines) if getattr(writer, "engines", None) else None,
        migrations=bool(getattr(writer, "migrations", False)),
    )


class _SqlWriter:
    group = "relational"

    def __init__(self, dialect: str):
        self.id = dialect
        self.label = DIALECT_NAMES[dialect]

    def write(self, physical: dict, context: WriteContext) -> list[dict]:
        content = generate_sql(physical, self.id, context.title)
        return [generated_file(f"{file_base(context.title)}-{self.id}.sql", content, "sql")]


class _MongoWriter:
    id = "mongodb"
    label = "MongoDB"
    group = "document"

    def write(self, physical: dict, context: WriteContext) -> list[dict]:
        content = generate_mongo(physical, context.title)
        return [generated_file(f"{file_base(context.title)}-mongodb.js", content, "javascript")]


OUTPUTS: tuple[Output, ...] = (
    *(
        _output(_SqlWriter(dialect), "relational")
        for dialect in ("postgresql", "mysql", "mariadb", "sqlite", "sqlserver", "oracle")
    ),
    _output(_MongoWriter(), "document"),
    _output(DjangoOutput(), "relational"),
    _output(SqlAlchemyOutput(), "relational"),
    _output(SqlModelOutput(), "relational"),
    _output(TortoiseOutput(), "relational"),
    _output(PrismaOutput(), "relational"),
    _output(TypeOrmOutput(), "relational"),
    _output(SequelizeOutput(), "relational"),
    _output(DrizzleOutput(), "relational"),
    *(_output(writer, "relational") for writer in jpa_outputs()),
    _output(EfCoreOutput(), "relational"),
    _output(EloquentOutput(), "relational"),
    _output(DoctrineOutput(), "relational"),
    _output(PyMongoOutput(), "document"),
    _output(MongoEngineOutput(), "document"),
    _output(BeanieOutput(), "document"),
    _output(MongooseOutput(), "document"),
    _output(SpringDataMongoOutput(), "document"),
)


def find_output(output_id: str) -> Output:
    return next((output for output in OUTPUTS if output.id == output_id), OUTPUTS[0])


def generate(schema: dict, design: dict, output: Output, settings: dict, title: str | None = None) -> dict:
    """From the decisions to the files: the physical schema for the chosen database and its code."""
    name = title or schema.get("root") or default_root(schema) or "schema"
    return {**output.generate(schema, design, settings, name), "archiveName": f"{file_base(name)}-{output.id}.zip"}
