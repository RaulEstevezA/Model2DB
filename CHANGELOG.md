# Changelog

Notable changes to Model2DB, the web and the desktop version together. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). Desktop releases are tagged `v<version>` and published on [Releases](https://github.com/RaulEstevezA/Model2DB/releases).

## [Unreleased]

### Added

- Web: the tool's icon next to its name in the introduction.
- Web: queries. Each stored model can list how the application reads it (rows filtered by some fields and ordered by others, ascending or descending), and each query becomes an index on the filter and then the order. Where a model points to an owner and has a creation date (`Post.userId` and `createdAt`), the query "by userId, newest first" is proposed and waits for review like any other decision. An index the key, a unique constraint or another index already serves is not added, and the plain index of a foreign key gives way to the query's. A note asks to check the indexes against the real queries and data. In SQL (6 engines, with `DESC`), MongoDB (compound indexes) and every ORM and MongoDB library: Prisma `sort: Desc`, JPA `DESC` in `columnList`, EF Core `IsDescending`, Django `"-field"`, SQLAlchemy and SQLModel `.desc()`, Sequelize, Drizzle, Mongoose, PyMongo, MongoEngine, Beanie and Spring Data MongoDB. TypeORM, Doctrine and Tortoise cannot keep a descending column in their models: a note says so, and the TypeORM and Doctrine migrations still create it descending. Couchbase writes `DESC` in its SQL++ indexes. Redis searches the hash by the filter fields and makes the first order field `SORTABLE` (a search sorts by one field; a note says so when the query orders by more). Cassandra and ScyllaDB, which have no joins and no ordered indexes, read each query from a table of its own (`orders_by_customer_id`): a copy of the rows partitioned by the filter, with `CLUSTERING ORDER BY` for the order and the model's key last; a note says the application writes every row in each of them, and a query without a filter gets no table.
- Desktop: the same queries, with their section in each stored model, and exactly the same files and notes for every output.

### Fixed

- Web: the Django output put indexes on several columns among the constraints, where Django rejects them; they go in `Meta.indexes` now, by field name and with names Django accepts (30 characters at most). SQLAlchemy, SQLModel and Tortoise left them out of the models; they write them now.

## [0.1.0] - 2026-11-02

### Added

- Web: reads models in 23 formats (code in 12 languages, JSON Schema, OpenAPI, GraphQL, Protocol Buffers, Smithy, Prisma, model schema, and JSON, YAML, XML or CSV documents), with the parsers of Mapper.
- Web: proposes a design for four kinds of database, each proposal with its confidence and its reason. What the input declares (`@Id`, `@ManyToOne`, `unique=True`, `@db.VarChar(80)`…) is taken as it is.
  - Relational: tables, keys, foreign keys, value objects as columns, child and join tables, enums, unique columns and indexes. Numbers without a size named like counts (`quantity`, `numSeats`…) become whole numbers.
  - Documents (MongoDB, Couchbase): collections, embedded documents and references; a relation the other documents already hold (`User.posts` next to `Post.author`) is kept on that side only.
  - Key-value (Redis): a hash per stored model under its own key, and lists, sets of keys or hashes under it.
  - Wide-column (Cassandra, ScyllaDB): a table per stored model partitioned by its key, values in the row as user-defined types and collections, and a table partitioned by the owner's key for a list of other models.
- Web: decisions to review are listed and never applied on their own; the result leaves a `TODO` where each one goes.
- Web: every decision, name, column type, index and model or field left out can be changed, with undo, redo and reset. Editing the model keeps the decisions that still apply.
- Web: 32 outputs, with migrations where the tool has them:
  - SQL for PostgreSQL, MySQL, MariaDB, SQLite, SQL Server and Oracle Database, also as a Flyway migration or a Liquibase changelog (one changeset per table, each with its rollback).
  - MongoDB (a script with validators and indexes), Couchbase (SQL++ collections and indexes), Redis (the keys described, and the search indexes for redis-cli), Cassandra and ScyllaDB (CQL).
  - Django, SQLAlchemy, SQLModel, Tortoise, PyMongo, MongoEngine, Beanie, Prisma, TypeORM, Sequelize, Drizzle, Mongoose, JPA, Hibernate, Spring Data JPA, Spring Data MongoDB, Entity Framework Core, Laravel Eloquent and Doctrine.
- Web: a text key filled with a new UUID (Prisma `@default(uuid())`, JPA `GenerationType.UUID`, Hibernate `@UuidGenerator`) gets the database's UUID default, and the ORMs fill it too.
- Web: where the database has no unique indexes (Couchbase, Redis, Cassandra, ScyllaDB), the field gets a plain index and a note says the application keeps it unique.
- Web: receives models from Mapper (and any tool that sends a `model-handoff`).
- Web: save and open projects, and "Remember in this browser".
- Web: English and Spanish, keyboard and screen reader support, layout from 320px.
- Web: a button downloads the desktop version for the visitor's system, with links to the other systems and to how to open it the first time.
- Web: privacy-first traffic and page-view measurement with Cloudflare Web Analytics.
- Desktop: the same tool as a PySide6 application: the same design and exactly the same files for every output, checked by the shared test cases; projects, "Remember on this computer" and models from Mapper as files; keyboard and screen reader support (in the model editor Tab indents, and Escape then Tab leaves it). Packaged with PyInstaller and released by GitHub Actions for macOS, Windows and Linux, with an automatic start-up check.

[Unreleased]: https://github.com/RaulEstevezA/Model2DB/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/RaulEstevezA/Model2DB/releases/tag/v0.1.0
