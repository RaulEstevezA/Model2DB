# The design

The design is the step between the model and the code: every choice Model2DB makes about how the models are stored, with how sure it is and why. The user reviews it before anything is written. Types are in `web/src/core/design/types.ts`.

## Decisions

A decision is a plain JSON value:

```json
{
  "value": true,
  "status": "pending",
  "confidence": "review",
  "reasons": [{ "code": "uniqueNamed", "params": { "field": "email" } }],
  "options": [true, false]
}
```

- `value`: the proposal while the decision is pending, the choice once it is active.
- `status`: `active` (applied) or `pending` (waits for the user).
- `confidence`: the scale of personal_web_style (`patterns/confidence-states.md`). `exact`, `high` and `probable` are applied; `review` and `conflict` stay pending.
- `reasons`: codes translated by the interface (`i18n/messages.ts`), so the same design reads in English and Spanish.
- `options`: the values that make sense for this subject. The interface offers exactly these.
- `manual`: set when the user made or confirmed the choice.

A design has one entry per model (`include`, `key`, `table`, `fields`, `queries`), one per field (`include`, `relation`, `foreignKey`, `unique`, `wholeNumber`, `index`, `column`, `type`) and one per enum (`storage`). The design is for one kind of database: `relational` (the SQL engines), `document` (MongoDB, Couchbase), `keyvalue` (Redis) or `widecolumn` (Cassandra, ScyllaDB). The kinds are listed in `STORAGE_TARGETS`; a project keeps one design per kind.

## How proposals are made

`design/propose.ts` reads the schema once (`design/analysis.ts`: who uses each model, which fields could be keys, the shape of each field) and asks the strategy of the kind of database (`design/targets/`) what differs. What the input declares (`design/hints.ts`) is always `exact`.

### Keys

| Situation | Proposal | Confidence |
|---|---|---|
| One field declared as key (`@Id`, `@id`, `primary_key=True`, `[Key]`) | That field | Exact |
| Several fields declared as key | The first | Conflict |
| A field named like an identifier (`id`, `orderId` in `Order`) | That field | High |
| Fields that could identify a row (`sku`, `code`), relational | A new integer key | Review |
| No candidate, relational or Redis | A new integer key (or UUID) | Likely |
| No candidate, documents | `_id` (ObjectId in MongoDB, a UUID in Couchbase) | Exact |
| No candidate, Cassandra and ScyllaDB | A new UUID (there is no auto-increment) | Likely |

### Fields that hold other models

Relational:

| Field | Proposal |
|---|---|
| A model with its own key (`customer: Customer`) | Foreign key (high); exact when declared (`@ManyToOne`) |
| A model without key and without lists (`address: Address`) | Its fields become columns, `address_city` (likely) |
| A model without key that contains lists | Waits: a reference or a JSON column (review) |
| A list of models with a field pointing back (`Order.lines` / `OrderLine.order`) | Child table (high) |
| Lists on both sides (`Post.tags` / `Tag.posts`) | Join table (high) |
| A list of models other models also use | Join table (review) |
| A list of plain values (`tags: string[]`) | Table with one row per value (likely); array column in PostgreSQL, or JSON |
| A map | JSON column (high) |
| A free value (`any`, `object`) | JSON column; review when the type is unknown |

Documents (MongoDB):

| Field | Proposal |
|---|---|
| A model that leads back to this one (recursive) | Reference |
| A model without key | Embedded (high) |
| A model with key, used only here | Embedded (likely) |
| A model with key that other models also use | Reference (review) |
| A list of models whose documents point back (`User.posts` / `Post.author`) | Kept on the other side only (high): the list is not stored twice |
| Lists and maps of plain values, free values | Embedded |

Keys and values (Redis): each stored model is a hash under `prefix:<key>`. How the data is read decides most of it, and the model does not say, so lists of other models wait for the user.

| Field | Proposal |
|---|---|
| A model with its own key | A hash field with its key (high) |
| A model without key and without lists | Its fields in this hash, `address_city` (likely); otherwise JSON text |
| A list of models with a key | A set of their keys under this key, `user:<key>:posts` (review) |
| A list of models without key | JSON text in this hash (review) |
| A list of plain values | A Redis list under this key (likely) |
| A map of plain values | A Redis hash under this key (likely) |

Wide columns (Cassandra, ScyllaDB): a table per stored model, partitioned by its key. There are no joins, so values live in the row and a list of other models is a table of its own, partitioned by the owner's key.

| Field | Proposal |
|---|---|
| A model with its own key | A column with its key (high) |
| A model without key | A user-defined type in the row, `frozen<address>` (likely); JSON text if it leads back to this model |
| A list of models with a key | A table partitioned by this key with their keys, `user_posts` (review) |
| A list of models without key | A list of user-defined types in the row (review) |
| Lists and maps of plain values | Native collections, `list<text>`, `map<text, int>` (high) |

### Other fields

- **Foreign keys by name** (relational): `customerId` next to a `Customer` model with a key is proposed as its foreign key (high), unless a `customer: Customer` field already says it.
- **Unique**: declared ones are exact; `email`, `username`, `slug`, `sku`, `isbn`, `login` and `handle` are suggested for review. Couchbase, Redis, Cassandra and ScyllaDB have no unique indexes: the field gets a plain index and a note says the application keeps it unique.
- **Whole numbers** (relational): a number without a size (TypeScript's `number`) named like a count (`quantity`, `count`, `numSeats`…) is stored as a whole number (likely); the user can choose decimals.
- **Enums** (relational): a CHECK constraint (high); the user can choose a native type (PostgreSQL, MySQL, MariaDB), a lookup table or plain text. Documents use the validator's `enum`.
- **Models**: one only used as a base class is left out (its fields go to its children); one no other model uses can be left out by the user.

### Queries

The fields say what is stored, not how the application reads it, and that is what decides the indexes. Each model keeps the queries the application runs on it (`design/queries.ts`):

```json
{
  "filter": ["userId"],
  "sort": [{ "field": "createdAt", "direction": "desc" }],
  "status": "pending",
  "reasons": [{ "code": "queryByOwner", "params": { "field": "userId", "sort": "createdAt" } }]
}
```

- `filter`: fields compared with a value; `sort`: fields the rows come back ordered by, each `asc` or `desc`. A query can use stored scalar fields and references to one other model (their key column).
- One query is proposed per field that points to an owner (a foreign key, a reference, or a name like `userId` next to a `User` model with a key) when the model has a date to order by (`createdAt` first; never an update, deletion, expiry or birth date): the rows of that owner, newest first. It is always `pending`, with the reason `queryByOwner`.
- The user accepts a proposal, changes it, removes it or writes new ones; those are `active` with no reasons.
- `queries` is missing until the first proposal. Once there, even empty, it belongs to the user: `reconcile` keeps it (leaving out the fields that are gone) and never proposes again, so a removed proposal stays removed. Designs saved before queries existed get the proposals when they are reconciled.

## Edits and reconciling

`design/edit.ts` returns a new design for each action: `decide` (choose an option, or accept the suggestion as it is), include or leave out a model or field, rename a table or column, write a column type, add an index, and add, change, accept or remove a query (`addQuery`, `setQuery`, `acceptQuery`, `removeQuery`). A proposed query is a pending item of its own (`{ kind: 'query', model, index }`), and `decide` on it accepts it. The interface keeps previous designs for undo and redo.

When the input changes, `reconcile` proposes again for the new schema and keeps every decision the user made (`manual`) whose value the new proposal still offers, plus names, types, indexes and fields left out. Editing the model never throws the review away. Projects use the same function when they are opened.

## Roles and pending decisions

`physical/roles.ts` says what happens to each model once the decisions are applied: `stored` (own table, collection or keys), `embedded`, `parent`, `excluded`, `pending` (it depends on a decision still to be made) or `unused`. The interface lists the pending decisions that matter for what is stored (`app/workspace.ts`); decisions of models that are still undecided appear once the decision that involves them is made.

## From the design to tables, collections or keys

`physical/relational.ts` builds the relational schema in steps, each in its own file under `physical/relational/`:

1. `tables.ts`: one table per stored model, its key (keys first, so the columns that refer to them can take their type), its scalar columns and the foreign keys by name.
2. `relations.ts`: references, value objects as columns, child tables, join tables, arrays and JSON.
3. `enums.ts`: CHECK constraints, native types or lookup tables.
4. `textKeys.ts`: a text without a length used by a key, a unique constraint or an index gets one where the engine needs it (MySQL, MariaDB, SQL Server, Oracle), with a note.

`physical/document.ts` builds the collections: a `$jsonSchema` validator per collection, embedded models as nested objects, references as the other document's `_id`, and indexes for unique fields and references.

`physical/keyValue.ts` builds the Redis keys: a hash per stored model with what each field holds, the lists, sets and hashes under its key, and a search index on the fields other keys point to and the ones chosen to be indexed.

`physical/wideColumn.ts` builds the Cassandra and ScyllaDB schema: the user-defined types in the order they can be created, a table per stored model with its partition key, a table partitioned by the owner's key for each list of other models, and secondary indexes.

The queries of a model (`physical/queryIndexes.ts` for tables and collections) become:

- **Tables and collections**: one index on the filter fields and then the order fields, with `descending` columns (`(user_id, created_at DESC)`, `{ userId: 1, createdAt: -1 }`). It is not added when the primary key, a unique constraint or another index already serves it (the direction of the filter columns does not matter, and an index is read both ways), and it replaces the plain indexes on its first columns, such as the index of a foreign key.
- **Redis**: the filter fields join the hash's search index (TAG, or NUMERIC for numbers) and the first order field is `SORTABLE`; a search sorts by one field, so a note says when a query orders by more.
- **Cassandra and ScyllaDB**: a table of its own (`orders_by_customer_id`), a copy of the model's columns partitioned by the filter, clustered by the order with `CLUSTERING ORDER BY` and with the model's key last. A query by the key needs none; one without a filter gets none, with a note. Another note says the application writes every row in each table.

A field that is not stored on its own leaves the query without an index, with a note; a pending query leaves a `TODO`. A note asks to check the indexes against the real queries and data, which the model cannot say.

A pending decision never becomes a column or a property: the physical schema keeps a `todo` in its place, which every output writes as a `TODO` comment (`generate/todos.ts`). What an output cannot store exactly as designed becomes a `note`, shown next to the result.
