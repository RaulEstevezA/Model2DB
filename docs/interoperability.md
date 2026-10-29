# Interoperability

Model2DB works alone, and can also receive models from Mapper (and any tool of the family that writes the same handoff). Three formats make it possible.

| Format | What it holds | Used for |
|---|---|---|
| `model-schema` | Models: fields, types, nullability, enums | An input format; what other tools send |
| `model-handoff` | One model-schema plus who sent it | Opening a model in Model2DB from another tool |
| `model2db-project` | The input, the designs and the output settings | Saving and reopening work |

`model-schema` and `model-handoff` are shared with Api2Class and Mapper and are described in [Mapper's docs/interoperability.md](https://github.com/RaulEstevezA/Mapper/blob/main/docs/interoperability.md). Model2DB reads a model-schema like any other input (`.model.json`, or any JSON with `"format": "model-schema"`).

## Receiving a model (model-handoff, version 1)

```json
{
  "format": "model-handoff",
  "version": 1,
  "from": "mapper",
  "role": "target",
  "model": "Order",
  "schema": { "format": "model-schema", "version": 1, "models": [], "enums": [] },
  "text": { "format": "typescript", "content": "…" }
}
```

Model2DB ignores `role` (it only has one input). When `text` comes with a format Model2DB reads, the text is shown in the input editor and parsed again; otherwise the model-schema itself is shown. The page says "Model received from Mapper" and opens on the design.

Transfer, by order of preference (`core/interop/handoff.ts`):

1. **Same tab, same origin**: the sender stores the handoff in `sessionStorage['model2db.incoming']` and navigates to Model2DB. It is read once and removed.
2. **Another tab:** `postMessage` with the handoff as the message; only messages from `https://raulesteveza.github.io` or Model2DB's own origin are accepted, and the content is validated.
3. **File:** the user exports the model (`.model.json`) and opens it in Model2DB.

Everything received is validated (`readHandoff`): an unknown sender, a different format or version, or a model-schema that does not validate is ignored. The URL is never used: models can be large and would stay in the browser history.

### From Mapper

Mapper prepared this contract before Model2DB had its name, as "DBCreate": its "Export target model" downloads the target as a model-schema that Model2DB opens as a file. An "Open in Model2DB" action in Mapper would send `{ format: 'model-handoff', from: 'mapper', role: 'target', schema }` to `sessionStorage['model2db.incoming']` and navigate to `/tools/Model2DB/`. Mapper sends only the model; Model2DB decides everything about persistence.

## model2db-project (version 1)

```json
{
  "format": "model2db-project",
  "version": 1,
  "savedAt": "2026-10-29T12:00:00.000Z",
  "input": { "format": "typescript", "text": "interface Customer { id: number; email: string }", "fileName": "models.ts" },
  "designs": {
    "relational": { "target": "relational", "models": [], "enums": [] },
    "document": null
  },
  "output": {
    "output": "mysql",
    "naming": {
      "relational": { "tables": "plural", "columns": "snake" },
      "document": { "tables": "plural", "columns": "field" }
    },
    "strings": "auto",
    "engine": "mysql",
    "migrations": true
  }
}
```

- `input.format` is an input format id, or `null` to detect it from the text when the project is opened. `fileName` is optional.
- `designs` holds one design per kind of database ([design.md](design.md)), `null` for a kind not used yet, so going from PostgreSQL to MongoDB and back after opening the project keeps the decisions of both.
- `output` is the chosen output and every setting of [outputs.md](outputs.md#options).

The model schema is not stored: opening a project parses the text again and reconciles the saved designs with it (`reconcile`, as when the input is edited). A decision whose value the model no longer offers is proposed again; everything else is kept.

Reading a project checks every part and copies only known keys (`core/interop/project.ts`): a damaged file is rejected with the path of the first problem (`$.designs.relational.models[0].fields[1].unique.status`), and a project from a newer version is refused instead of being misread. The shared cases (`shared/test-cases/calls/project.readProject.json`) hold the same files for the desktop version.

The file is named after the main model: `order.model2db.json`.

### Remember in this browser

"Remember in this browser" stores the same project in `localStorage['model2db.workspace']`, only while the option is on (`model2db.remember`), and restores it when the page opens. "Delete saved work" removes it and turns the option off. A model received from another tool takes priority over the saved work.
