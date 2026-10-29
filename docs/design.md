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

A design has one entry per model (`include`, `key`, `table`, `fields`), one per field (`include`, `relation`, `foreignKey`, `unique`, `index`, `column`, `type`) and one per enum (`storage`). The design is for one kind of database: `relational` or `document`.

## How proposals are made

`design/propose.ts` reads the schema once (`design/analysis.ts`: who uses each model, which fields could be keys, the shape of each field) and asks the strategy of the kind of database (`design/targets/`) what differs. What the input declares (`design/hints.ts`) is always `exact`.

### Keys

| Situation | Proposal | Confidence |
|---|---|---|
| One field declared as key (`@Id`, `@id`, `primary_key=True`, `[Key]`) | That field | Exact |
| Several fields declared as key | The first | Conflict |
| A field named like an identifier (`id`, `orderId` in `Order`) | That field | High |
| Fields that could identify a row (`sku`, `code`), relational | A new integer key | Review |
| No candidate, relational | A new integer key (or UUID) | Likely |
| No candidate, MongoDB | `_id` (ObjectId) | Exact |

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
| Lists and maps of plain values, free values | Embedded |

### Other fields

- **Foreign keys by name** (relational): `customerId` next to a `Customer` model with a key is proposed as its foreign key (high), unless a `customer: Customer` field already says it.
- **Unique**: declared ones are exact; `email`, `username`, `slug`, `sku`, `isbn`, `login` and `handle` are suggested for review.
- **Enums** (relational): a CHECK constraint (high); the user can choose a native type (PostgreSQL, MySQL, MariaDB), a lookup table or plain text. Documents use the validator's `enum`.
- **Models**: one only used as a base class is left out (its fields go to its children); one no other model uses can be left out by the user.

## Edits and reconciling

`design/edit.ts` returns a new design for each action: `decide` (choose an option, or accept the suggestion as it is), include or leave out a model or field, rename a table or column, write a column type, add an index. The interface keeps previous designs for undo and redo.

When the input changes, `reconcile` proposes again for the new schema and keeps every decision the user made (`manual`) whose value the new proposal still offers, plus names, types, indexes and fields left out. Editing the model never throws the review away. Projects use the same function when they are opened.

## Roles and pending decisions

`physical/roles.ts` says what happens to each model once the decisions are applied: `stored` (own table or collection), `embedded`, `parent`, `excluded`, `pending` (it depends on a decision still to be made) or `unused`. The interface lists the pending decisions that matter for what is stored (`app/workspace.ts`); decisions of models that are still undecided appear once the decision that involves them is made.

## From the design to tables or collections

`physical/relational.ts` builds the relational schema in steps, each in its own file under `physical/relational/`:

1. `tables.ts`: one table per stored model, its key (keys first, so the columns that refer to them can take their type), its scalar columns and the foreign keys by name.
2. `relations.ts`: references, value objects as columns, child tables, join tables, arrays and JSON.
3. `enums.ts`: CHECK constraints, native types or lookup tables.
4. `textKeys.ts`: a text without a length used by a key, a unique constraint or an index gets one where the engine needs it (MySQL, MariaDB, SQL Server, Oracle), with a note.

`physical/document.ts` builds the collections: a `$jsonSchema` validator per collection, embedded models as nested objects, references as the other document's `_id`, and indexes for unique fields and references.

A pending decision never becomes a column or a property: the physical schema keeps a `todo` in its place, which every output writes as a `TODO` comment (`generate/todos.ts`). What an output cannot store exactly as designed becomes a `note`, shown next to the result.
