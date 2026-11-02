# Outputs

Every output reads the physical schema of its kind of database (tables, collections, Redis keys or wide-column tables, `web/src/core/physical/`) and writes files. The registry is `web/src/core/generate/outputs.ts`; the files every output writes for every built-in example are in `shared/test-cases/outputs/<output>/` (one file per example, or a folder when the output writes several), which is also the best way to see them.

## Options

| Option | Applies to | Values |
|---|---|---|
| Database engine | ORM outputs, Flyway, Liquibase | The engines the tool supports (below). Types, migrations and connection settings depend on it |
| Table / collection names, key prefixes | All | Plural (`order_lines`), singular (`order_line`) or as the model (`OrderLine`). Redis keys are singular by default (`order:<key>`) |
| Column / property names | All | `snake_case` (`created_at`) or as the field (`createdAt`). Documents keep the field name by default |
| Text without a length | Relational | By engine (TEXT in PostgreSQL and SQLite, VARCHAR(255) in the others), always VARCHAR(255), or always TEXT |
| Include the migration | Outputs with migrations | Adds the migration that creates the schema |

The settings are remembered in the browser as preferences; the names are kept separately for each kind of database.

## SQL

| Output | File |
|---|---|
| PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle Database | `<model>-<engine>.sql` |

One script per engine: tables in an order where each comes after the tables it refers to (references that close a cycle are added at the end with `ALTER TABLE`), keys, foreign keys, unique constraints, CHECK constraints, native enum types (PostgreSQL, MySQL, MariaDB) or lookup tables with their rows, and indexes. Names the engine reserves are quoted (`lines` in MySQL). A text key filled with a new UUID (Prisma `@default(uuid())`, JPA `GenerationType.UUID`) gets the engine's UUID default.

### Flyway and Liquibase

The same script for any of the six engines, as a migration:

| Output | Files |
|---|---|
| Flyway | `flyway.toml` (connection to fill in), `db/migration/V1__create_<model>_schema.sql` |
| Liquibase | `liquibase.properties`, `db/changelog/db.changelog-master.yaml`, `db/changelog/changes/001-create-<model>-schema.sql` |

The Liquibase changelog is formatted SQL with one changeset per table (with its indexes and rows), per enum type and per foreign key added afterwards, each with the statement that undoes it, so `liquibase rollback` works. Migrations leave out SQLite's `PRAGMA foreign_keys`, which cannot run inside a transaction.

## MongoDB

`<model>-mongodb.js`, a `mongosh` script: `createCollection` with a `$jsonSchema` validator per collection (`additionalProperties: false`, required fields, enum values) and `createIndex` for unique fields, references and chosen indexes.

## Couchbase

SQL++ for `cbq` or the Query Workbench, in two files, because Couchbase makes collections in the background: `1-collections.sql` creates one collection per stored model in the bucket's default scope, with each document's fields as comments (Couchbase checks no shape), and `2-indexes.sql`, run afterwards, creates the indexes. A path inside a list is indexed item by item (`DISTINCT ARRAY item.product FOR item IN lines END`). Couchbase has no unique indexes: those fields get a plain index and a note.

## Redis

Redis has no schema to create, so the output describes the keys and creates what can be created:

- `<model>-redis.md`: for each stored model, its key (`order:<key>`) and how a new key is made (`INCR order:next_key` or a UUID), what each hash field holds, and the lists, sets and hashes under its key.
- `<model>-redis-search.redis`: `FT.CREATE` for each hash with fields to search (the fields other keys point to and the chosen indexes), for `redis-cli` on Redis 8 or Redis Stack. `redis-cli` takes no comments, so this file has none.

## Cassandra and ScyllaDB

`<model>-cassandra.cql` or `<model>-scylladb.cql`, for `cqlsh -f`: the keyspace (one copy of each row, to raise for a cluster), the user-defined types in the order they can be created, the tables with their partition and clustering keys, and secondary indexes for unique and chosen fields (SAI in Cassandra). A table whose key is still pending is written as a comment, so the script still runs.

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
| Unique in the application | The database has no unique indexes (Couchbase, Redis, Cassandra, ScyllaDB): the field gets a plain index |

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
- Flyway 11 and Liquibase 4.33 on the six engines: Flyway applies the migration; Liquibase updates, rolls everything back and updates again.
- Couchbase Community 7.6: every example runs on a fresh bucket, and queries use the indexes, also on a list.
- Redis 8.2: every search file runs, and a search finds what it indexes.
- Cassandra 5.0 and ScyllaDB 6.2: every example runs, as proposed and with every decision accepted; a query uses the secondary index.
