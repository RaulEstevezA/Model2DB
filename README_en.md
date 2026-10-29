# Model2DB

Model2DB turns a data model into a database design you review before any code is written, and then writes that code: the SQL schema, the MongoDB collections, or the models of your ORM with their migration. Everything happens on your side, in the browser: what you paste or open is never sent anywhere, and code is analyzed, never run.

```text
Paste or open the models  →  Review the proposed design  →  Choose the database or ORM  →  Copy the schema
```

## What it does

1. **Reads the models** in any supported format, or receives them from Mapper. It detects the format and what the input already says about persistence: `@Id`, `@ManyToOne`, `@Column(length = 80)`, `unique=True`, `[MaxLength]`, `@relation`, `@db.VarChar`… A declared fact is taken as it is.
2. **Proposes a design** for a relational database or for MongoDB:
   - which models get their own table or collection, and which only live inside others;
   - the primary key: a field that looks like one, or a new key the database fills (integer, UUID or ObjectId);
   - how each field holding another model is stored: a foreign key, columns in the same table (`address_city`), a child table, a join table, a JSON or array column, an embedded document or a reference;
   - lists and maps of plain values, enums (CHECK, native type or lookup table), unique columns and indexes.
3. **Says how sure it is and why.** Every proposal has a confidence (exact, high, likely, review, conflict) and a reason in plain words: "“id” is named like an identifier", "“Address” has no key: it is a value that belongs to this model".
4. **Never decides an ambiguity.** "Is `email` unique?" or "which field identifies a product when none is called `id`?" wait for you, listed at the top of the design. Until you decide, the result leaves a `TODO` where the decision goes.
5. **Lets you change everything:** any decision, the table and column names, a column's type (`VARCHAR(80)`), indexes, fields or models left out; with undo, redo and reset.
6. **Writes the result** for the chosen output, always in step with the design, with notes where the output cannot store something exactly as designed.

## Outputs

| Group | Outputs | Migration |
|---|---|---|
| SQL | PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle Database | The script itself |
| Documents | MongoDB (`mongosh` script: collections with `$jsonSchema` validators and indexes) | |
| Python | Django ORM, SQLAlchemy, SQLModel, Tortoise ORM | Django and Alembic |
| | PyMongo, MongoEngine, Beanie | |
| TypeScript / JavaScript | Prisma, TypeORM, Sequelize, Drizzle ORM | TypeORM and Sequelize |
| | Mongoose | |
| Java / Kotlin | JPA (Jakarta Persistence), Hibernate, Spring Data JPA | Flyway |
| | Spring Data MongoDB | |
| C# | Entity Framework Core (entities and `DbContext`) | |
| PHP | Laravel Eloquent, Doctrine ORM | Laravel and Doctrine Migrations |

An ORM writes for the database engine you choose (types, migrations and connection settings depend on it). The other options are the table names (plural, singular or as the model), the column names (`snake_case` or as the field) and the type of texts without a length.

Each output was checked with the real tool: the SQL and the MongoDB script run on real servers, the Python and TypeScript models load in their libraries and create their schema, the migrations apply, the Java, C# and PHP classes compile or validate against Hibernate, Spring Data, EF Core and Doctrine, and Prisma validates its schema on every engine it supports.

## Inputs

| | |
|---|---|
| Code | TypeScript (also Zod schemas), JavaScript, Python, Java, C#, Kotlin, Dart, Swift, Go, Rust, PHP, Scala |
| Schemas | JSON Schema, OpenAPI / Swagger, GraphQL, Protocol Buffers, Smithy, Prisma, model schema (Api2Class, Mapper) |
| Example documents | JSON, YAML, XML, CSV |

The parsers are the same as Mapper's: Model2DB reads everything Mapper reads and everything Api2Class writes.

## Work with other tools

- **From Mapper:** the target model of a mapping opens in Model2DB as it is, ready to design its database.
- **Projects:** "Save project" downloads the model, your decisions for both kinds of database and the output settings; "Open project" continues later. "Remember in this browser" keeps the work there only, until you delete it.

The formats are documented in [docs/interoperability.md](docs/interoperability.md).

## Versions

| | Web | Desktop |
|---|---|---|
| Technology | React + TypeScript + Vite | Python + PySide6 |
| Runs in | The browser | Installable application (Windows, macOS, Linux) |
| Documentation | This README and [docs/](./docs) | [desktop/README_en.md](./desktop/README_en.md) |
| Status | Not published yet | Complete; no packaged releases yet: [run it from source](./desktop/README_en.md#run-locally) |

## Shared behavior

The two versions are written separately (TypeScript and Python), but **they behave the same**: the [`shared/`](./shared/README.md) folder holds the test cases that define what each part of the core must do, from reading every input format to the design proposals, edits, project files and the exact files every output writes for every example. The web and desktop tests read the same files, so a difference in either version makes its tests fail.

## Development

The web version is in [`web/`](./web): React, TypeScript and Vite, without component libraries; its look follows the shared design of the portfolio and the other tools.

```bash
cd web
npm install
npm run dev      # development server
npm run check    # types, lint, format and tests
npm run build    # production build in web/dist
```

The tests cover the parsers, the design proposals and edits, the physical schemas, every output (snapshots of the four examples), project files, the shared cases and the main interface flows.

The desktop version is in [`desktop/`](./desktop): see [desktop/README_en.md](./desktop/README_en.md#run-locally) to run it, test it and build the executable.

## Repository structure

```
web/                     Web version (React + TypeScript + Vite)
  src/core/              Logic without interface: model, parsers, design, physical schema, outputs, projects
  src/components/        React interface
desktop/                 Desktop version (Python + PySide6)
  model2db/core/         The same logic as web/src/core/, in Python
shared/                  Behavior common to both versions
  test-cases/            Calls of the core and the files every output writes
docs/                    Technical documentation and images
```

## Documentation

| Document | Content |
|---|---|
| [architecture.md](docs/architecture.md) | Stages, folders and principles |
| [design.md](docs/design.md) | Decisions, confidence, how proposals are made and how they become tables or collections |
| [outputs.md](docs/outputs.md) | What each output writes, its options and notes |
| [interoperability.md](docs/interoperability.md) | Handoff from Mapper and project files |
| [adding-an-output.md](docs/adding-an-output.md) | Step by step for a new output or a new kind of database |
| [decisions.md](docs/decisions.md) | Design decisions and their reasons |

## Suggestions

Ideas for improvements, bugs or a database you would like Model2DB to write for: write to [contact.raulesteveza@gmail.com](mailto:contact.raulesteveza@gmail.com).

## Developer

**Raul Estevez**

- [Personal Website](https://raulesteveza.github.io/)
- [LinkedIn Profile](https://www.linkedin.com/in/raulesteveza/)

## License

[MIT](./LICENSE)
