# Shared

Language-neutral resources used by both the web (TypeScript) and desktop (Python) versions.

## test-cases/

Cases that define the expected behavior of the core. The web suite (`web/src/core/shared.test.ts`, `web/src/core/generate/test/generate.test.ts` and `variants.test.ts`) and the desktop suite (`desktop/tests/`) read the same files, so if one version behaves differently, its tests fail.

| Folder | What it checks |
|---|---|
| `calls/<module>.<function>.json` | Arguments of a core function and the result it gives, as JSON: names, format detection and every parser, handoffs, project files, design proposals, edits, reconciliation and model roles |
| `outputs/<output>/<example>` | The files every output writes for every built-in example, with the proposed design |
| `variants/<variant>.json` | An example, the decisions made on its proposal, the settings (engine, names, texts, migrations) and the files every output writes: every engine, native and lookup enums, arrays, UUID keys, other names, decided documents |

In the files, a missing key is `undefined` and `null` is `null`. Model roles, a `Map` on the web, are written as an object.

### Updating the cases

When the web version changes on purpose, write the results again from what it does now:

```bash
cd web
UPDATE_SHARED=1 npx vitest run src/core/shared.test.ts src/core/generate/test/variants.test.ts
npx vitest run src/core/generate -u
```

Then review the diff and port the change to `desktop/` until its tests pass.

## How it maps to each version

Shared logic lives in a `core/` folder in each version, with no interface code:

- Web: `web/src/core/` (TypeScript)
- Desktop: `desktop/model2db/core/` (Python)

A file in one `core/` has its counterpart in the other (`design/propose.ts` / `design/propose.py`). In Python, models, designs and physical schemas are dictionaries with the same keys as the JSON.

The model and the parsers come from Mapper, where they were ported first: both tools read the same 23 input formats in the same way.

## Notes on the Python port

- Errors of YAML and XML documents come from different libraries in each version (`yaml` and `DOMParser` on the web, PyYAML and the standard library on the desktop): only the error code is compared, not the message.
