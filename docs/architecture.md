# Architecture

Model2DB turns a model description into a database design and then into code. Everything runs locally, in the browser or in the desktop version; there is no backend.

```text
Input text ──► Parser ──► ModelSchema ──► Proposal ──► Design ──► Physical schema ──► Output writer ──► files
                                             ▲            │        (tables or
                                             │            │         collections)
                                    reconcile (input      ▼
                                    edited)          user edits (edit.ts)
```

Every stage has a language-neutral input and output, so a new input format, a new output or a new kind of database never touches the stages around it.

| Stage | Input | Output | Code |
|---|---|---|---|
| Parsing | text in one of 23 formats | `ModelSchema` | `web/src/core/parsers/` |
| Proposal | `ModelSchema` + kind of database | `Design` with confidence | `web/src/core/design/propose.ts` |
| Editing | `Design` + a user action | a new `Design` | `web/src/core/design/edit.ts` |
| Reconciling | previous `Design` + new `ModelSchema` | a fresh proposal that keeps the user's decisions | `edit.ts` (`reconcile`) |
| Physical schema | `ModelSchema` + `Design` + options | `RelationalSchema` or `DocumentSchema` | `web/src/core/physical/` |
| Writing | physical schema + settings | files | `web/src/core/generate/` |

The model and the parsers come from [Mapper](https://github.com/RaulEstevezA/Mapper), where they are documented (`docs/internal-model.md`, `docs/parsers.md`). Model2DB adds `design/hints.ts`, which reads what the input says about persistence (`@Id`, `@ManyToOne`, `unique=True`, `@db.VarChar(80)`…).

## Folders

```text
web/src/
├── core/                 No React: pure TypeScript, tested in Node
│   ├── model/            ModelSchema, type helpers, naming
│   ├── parsers/          Formats: data/, schema/, code/ and the registry (shared with Mapper)
│   ├── design/           Analysis, hints, the proposal, one strategy per kind of database, edits
│   ├── physical/         Model roles; tables (relational/) and collections (document.ts)
│   ├── generate/         SQL, MongoDB, ORM (orm/) and ODM (odm/) writers, and the output registry
│   └── interop/          Handoff between tools and project files
├── app/                  Interface logic without React: reading the input, pending decisions, projects
├── hooks/                Designs with undo, output settings, startup, handoff, stored preferences
├── components/           React components, one CSS file each
├── i18n/                 English and Spanish texts, including every reason and note
├── examples/             Built-in examples, also used as test fixtures
└── styles/tokens/        Design tokens copied from personal_web_style
```

## Desktop version

`desktop/` is the same tool as a Python (PySide6) application. `desktop/model2db/core/` mirrors `web/src/core/` module by module, with the same names, and works on plain dictionaries with the same keys as the TypeScript JSON, so its results can be compared with the web version's as JSON. `desktop/model2db/core/workspace.py` mirrors `web/src/app/`, and `desktop/model2db/ui/` is the window: `session.py` holds the state that `App.tsx` and its hooks hold on the web.

Porting notes: where JavaScript keeps insertion order (a `Set` that is iterated) Python uses a `dict`; `===` between objects is `is`; numbers are written with `js.js_string` (`1`, not `1.0`); and `localeCompare` is emulated where an output sorts with it (`orm/typescript/drizzle.py`).

Both versions read the cases in `shared/test-cases/` ([shared/README.md](../shared/README.md)): calls of core functions with their results, the files every output writes for every example, and variants with other engines, decisions and settings. The web version writes the results (`UPDATE_SHARED=1`) and the desktop tests must give the same ones, so a change in the core is made in both versions.

## Principles

- **The core has no interface code.** Everything under `core/` runs in Node and is covered by Vitest. The components only call it.
- **Values are immutable.** Edits return new designs; undo and redo keep previous values (`hooks/useHistory.ts`).
- **No decision is hidden.** A proposal the engine is not sure about is `pending` and is never applied: the physical schema leaves a `todo` in its place, and every output writes it as a `TODO` comment.
- **The user's work survives edits.** When the input changes, `reconcile` proposes again and keeps every decision the user made wherever the new proposal still offers it.
- **One design per kind of database.** Going from PostgreSQL to MongoDB and back keeps the decisions of each (`hooks/useDesigns.ts`).
- **Nothing is executed.** Inputs are tokenized and read by hand-written parsers.
- **Local first.** Inputs stay in memory. Only preferences are stored, plus the workspace when the user turns on "Remember in this browser".

## Interface

The page follows the tool layout of personal_web_style (`layouts/tool-page.md`): presentation window, project bar, workspace, links, footer. The workspace has three panes: Model, Design and Result. Below 1100px they become tabs.

Inputs are parsed after the keystroke is painted (`useDeferredValue`); the design and the result follow.

## Dependencies

| Package | Why |
|---|---|
| react, react-dom | Interface, as in the other tools |
| @codemirror/* | Code editors with highlighting; languages load on demand |
| yaml | YAML parsing with error positions |

Everything else (every parser and writer, the zip writer) is written in the repository. The decisions are listed in [decisions.md](decisions.md).
