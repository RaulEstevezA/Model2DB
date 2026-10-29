# Outputs

Every output reads the physical schema of its kind of database (tables or collections, `web/src/core/physical/`) and writes files. The registry is `web/src/core/generate/outputs.ts`; the files every output writes for every built-in example are in `shared/test-cases/outputs/<output>/` (one file per example, or a folder when the output writes several), which is also the best way to see them.

## Options

| Option | Applies to | Values |
|---|---|---|
| Database engine | ORM outputs | The engines the ORM supports (below). Types, migrations and connection settings depend on it |
| Table / collection names | All | Plural (`order_lines`), singular (`order_line`) or as the model (`OrderLine`) |
| Column / property names | All | `snake_case` (`created_at`) or as the field (`createdAt`). Documents keep the field name by default |
| Text without a length | Relational | By engine (TEXT in PostgreSQL and SQLite, VARCHAR(255) in the others), always VARCHAR(255), or always TEXT |
| Include the migration | Outputs with migrations | Adds the migration that creates the schema |

The settings are remembered in the browser as preferences; the names are kept separately for tables and for documents.

## SQL

| Output | File |
|---|---|
| PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle Database | `<model>-<engine>.sql` |

One script per engine: tables in an order where each comes after the tables it refers to (references that close a cycle are added at the end with `ALTER TABLE`), keys, foreign keys, unique constraints, CHECK constraints, native enum types (PostgreSQL, MySQL, MariaDB) or lookup tables with their rows, and indexes. Names the engine reserves are quoted (`lines` in MySQL).

## MongoDB

`<model>-mongodb.js`, a `mongosh` script: `createCollection` with a `$jsonSchema` validator per collection (`additionalProperties: false`, required fields, enum values) and `createIndex` for unique fields, references and chosen indexes.

## ORM (relational)

All of them write from the same view of the tables (`generate/orm/entities.ts`): one class per table, one attribute per column, navigations between classes, and join tables as many-to-many relations.

| Output | Engines | Files |
|---|---|---|
| Django ORM | PostgreSQL, MySQL, MariaDB, SQLite, Oracle | `models.py`, `migrations/0001_initial.py` |
| SQLAlchemy | All six | `models.py` (2.0 style, `Mapped`), Alembic `migrations/versions/0001_create_schema.py` |
| SQLModel | All six | `models.py`, Alembic migration |
| Tortoise ORM | All six | `models.py` (Aerich writes migrations from the models) |
| Prisma | PostgreSQL, MySQL, MariaDB, SQLite, SQL Server | `prisma/schema.prisma` (`prisma migrate` writes the migration) |
| TypeORM | All six | `entities/<model>.entities.ts`, `migrations/<timestamp>-Create<Model>Schema.ts` |
| Sequelize | All six | `models/<model>.models.ts`, `migrations/<timestamp>-create-<model>-schema.js` |
| Drizzle ORM | PostgreSQL, MySQL, MariaDB, SQLite | `db/<model>.schema.ts` (drizzle-kit writes migrations) |
| JPA (Jakarta Persistence) | All six | One class per entity and enum (with its converter) under `src/main/java/com/example/model/`, Flyway `V1__create_schema.sql` |
| Hibernate | All six | As JPA, with Hibernate's own annotations where they help |
| Spring Data JPA | All six | As JPA, plus a repository per entity |
| Entity Framework Core | All six | `Data/<Model>Entities.cs`, `Data/<Model>DbContext.cs` (`dotnet ef` writes migrations) |
| Laravel Eloquent | MySQL, MariaDB, PostgreSQL, SQLite, SQL Server | `app/Models/*.php`, `app/Enums/*.php`, a migration under `database/migrations/` |
| Doctrine ORM | All six | `src/Entity/*.php`, `src/Enum/*.php`, a Doctrine Migrations class |

## ODM (documents)

| Output | Files |
|---|---|
| PyMongo | `collections.py`: the validators and indexes, and a function that creates them |
| MongoEngine | `documents.py` |
| Beanie | `documents.py` (Pydantic models) |
| Mongoose | `models/<model>.models.ts` |
| Spring Data MongoDB | One class per document and enum under `src/main/java/com/example/document/`, a repository per collection |

## Notes

When an output cannot store something exactly as designed, it says so next to the result instead of changing the design. The physical schema writes some notes and the outputs add their own:

| Note | When |
|---|---|
| Array as JSON | An array column outside PostgreSQL |
| Native enum as CHECK | A native enum on SQLite, SQL Server or Oracle |
| Default precision | Decimals without a declared precision get (18, 2) |
| Text key length | A text without a length in a key or index on MySQL, MariaDB, SQL Server or Oracle |
| Renamed reserved name | A name the engine reserves |
| Embedded cycle | A model that would embed itself |
| Composite key as id | The ORM has no composite primary keys (Tortoise): the table gets an `id`, and the columns stay unique together |
| Composite key read-only | Eloquent creates and reads those rows but changes them through their owner |
| Enum checked in code | The ORM checks the values in the application (Tortoise) |
| ORM enum type | The ORM stores the enum with its own type instead of a CHECK (Prisma) |
| Enum needs a cast | Values of a PostgreSQL enum type need a cast the ORM cannot write |

## Pending decisions in the result

A decision still pending is never written as a column, a property or a relation. Every output writes a `TODO` comment in its place, in English like the rest of the generated code, and the result's footer counts them.

## How the outputs were checked

Scripts and projects for these checks live outside the repository (`local-data/`, not versioned):

- SQL: the four examples on PostgreSQL 17, MySQL 8.4, MariaDB 11.4, SQL Server 2022, Oracle Free 23 and SQLite, plus 72 variants of the options; the MongoDB script on MongoDB 7, where valid documents are accepted and invalid ones rejected.
- Python: the libraries load the models and create the schema; Alembic and Django migrations apply on PostgreSQL, MySQL and MariaDB; an order is saved and read.
- TypeScript: Prisma validates on every engine it supports and `db push` applies; TypeORM, Sequelize and Drizzle compile with `tsc` and run on SQLite; Mongoose validates documents.
- Java: every variant compiles against Hibernate 7, Spring Data JPA 3.5 and Spring Data MongoDB 4.5; Hibernate creates the schema in H2 and saves and reads an order.
- C#: every variant compiles with .NET 9 and EF Core runs on SQLite.
- PHP: Doctrine validates the mapping and its migration goes up and down; Eloquent's migration goes up and down and the shop saves and reads its relations.
