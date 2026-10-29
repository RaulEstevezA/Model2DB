# Adding an output

## A new output for tables or documents

Most outputs write for a kind of database that already exists: an ORM, an ODM or a SQL dialect. They read the physical schema and only write files.

1. **Write the writer** in `web/src/core/generate/orm/<language>/<name>.ts` (relational) or `generate/odm/...` (documents): an object with `id`, `label`, `group` and `write(physical, context)`, typed as `RelationalWriter` or `DocumentWriter` (`generate/types.ts`).
   - ORM writers start from `buildEntities` (`generate/orm/entities.ts`): classes, attributes and navigations already named and related, so every ORM agrees.
   - `engines` lists the SQL engines the ORM supports; the first one is the default. Read the chosen one from `context.settings.engine`.
   - `migrations: true` if it can write a migration; `generate/sql/statements.ts` gives the schema as separate statements, and the statements that undo it.
   - Write every pending decision as a `TODO` comment (`generate/todos.ts`), never as code.
   - When the ORM cannot store something as designed, call `context.note(...)` with a note code (`physical/types.ts`), and add its text to both languages in `i18n/messages.ts`.
2. **Register it** in `OUTPUTS` in `generate/outputs.ts`, wrapped in `relational(...)` or `documental(...)`, in the place it should appear in the selector. A new group also needs a label in `outputGroups` (both languages).
3. **Add its editor language** in `utils/editorLanguages.ts` if CodeMirror does not have it yet.
4. **Test it.** The snapshots in `generate/test/` and the shared outputs are written for every example: run `npx vitest run src/core/generate -u` and review the new files in `shared/test-cases/outputs/<id>/`.
5. **Check it with the real tool** before committing: compile, load the models, run the migration, save and read a row. The generated code is only correct when the tool accepts it.
6. **Port it to the desktop version** (`desktop/model2db/core/generate/`) until the shared outputs match.

## A new kind of database

A key-value or wide-column store (Redis, Cassandra) changes the decisions, not only the files.

1. **A strategy** in `web/src/core/design/targets/<kind>.ts` implementing `DesignStrategy` (`design/strategy.ts`): its keys, how each field holding another model is stored, whether foreign keys by name make sense, how enums are stored. Register it in `STRATEGIES` in `design/propose.ts`, and add the kind to `StorageTarget` (`design/types.ts`).
2. **New relation choices or reasons**, if any, in `design/types.ts`, with their texts.
3. **A physical builder** in `web/src/core/physical/` that turns the active decisions into the kind's schema, with `todos` for pending decisions, and a new member of `PhysicalSchema`.
4. **A writer type** in `generate/types.ts` and a wrapper in `generate/outputs.ts` like `relational` and `documental`.
5. **The interface:** the design pane reads the design generically; check the names it shows for the new kind (`designFor`, `designSummary`, `role` in `i18n/messages.ts`) and the default naming in `hooks/useOutputSettings.ts`.
6. **Projects** keep one design per kind: add the kind to `ProjectDesigns` and to `readProject` (`core/interop/project.ts`).

Most proposals for these kinds will be `review`: their design depends on the queries, which the model does not say.
