# Changelog

Notable changes to Model2DB, the web and the desktop version together. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Web: reads models in 23 formats (code in 12 languages, JSON Schema, OpenAPI, GraphQL, Protocol Buffers, Smithy, Prisma, model schema, and JSON, YAML, XML or CSV documents), with the parsers of Mapper.
- Web: proposes a relational or a MongoDB design (tables or collections, keys, relations, value objects, child and join tables, embedded documents, enums, unique columns and indexes), each proposal with its confidence and its reason. What the input declares (`@Id`, `@ManyToOne`, `unique=True`, `@db.VarChar(80)`…) is taken as it is.
- Web: decisions to review are listed and never applied on their own; the result leaves a `TODO` where each one goes.
- Web: every decision, name, column type, index and model or field left out can be changed, with undo, redo and reset. Editing the model keeps the decisions that still apply.
- Web: 26 outputs: SQL for PostgreSQL, MySQL, MariaDB, SQLite, SQL Server and Oracle Database; a MongoDB script with validators and indexes; Django, SQLAlchemy, SQLModel, Tortoise, PyMongo, MongoEngine, Beanie, Prisma, TypeORM, Sequelize, Drizzle, Mongoose, JPA, Hibernate, Spring Data JPA, Spring Data MongoDB, Entity Framework Core, Laravel Eloquent and Doctrine, with migrations where the tool has them.
- Web: receives models from Mapper (and any tool that sends a `model-handoff`).
- Web: save and open projects, and "Remember in this browser".
- Web: English and Spanish, keyboard and screen reader support, layout from 320px.
- Web: privacy-first traffic and page-view measurement with Cloudflare Web Analytics.
- Desktop: the same tool as a PySide6 application: the same design and exactly the same files for every output, checked by the shared test cases; projects, "Remember on this computer" and models from Mapper as files.
