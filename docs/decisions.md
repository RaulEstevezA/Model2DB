# Decisions

Choices that shape the project, with the reason, so they are not undone by accident.

| Decision | Reason |
|---|---|
| No backend | Models may be private; everything Model2DB does fits in the browser (personal_web_style `UX_GUIDE.md`, local processing) |
| The parsers are Mapper's, ported as they are | Model2DB reads everything Mapper reads and everything Api2Class writes, with tests already written |
| A design step between the model and the code | The same model can be stored in several reasonable ways; the user should see and choose them before code is written |
| Review and conflict proposals are never applied; the result leaves a `TODO` | The engine helps; the user decides when the model does not say enough (personal_web_style `patterns/confidence-states.md`) |
| What the input declares is exact | `@Id`, `@ManyToOne` or `unique=True` already are the user's decision |
| One design per kind of database | Relational and document designs answer different questions; switching between them must not lose either |
| `reconcile` on every change of the input | Editing the model must not throw away the review |
| Every ORM writes from the same view of the tables (`orm/entities.ts`) | Class names, navigations and join tables agree across languages, and each ORM writer only knows its own syntax |
| An output writes a note instead of changing the design | The design is the user's; what an ORM cannot express is explained, not hidden |
| Every output checked with the real tool before it is added | Generated code is only correct when the database or the ORM accepts it |
| Projects store the text, not the parsed schema | The designs are reconciled with what the text reads now, as when the input is edited |
| Inputs are not stored unless the user turns on "Remember in this browser" | personal_web_style stores preferences, not user data; the option makes the exception explicit and reversible |
| Handoff through `sessionStorage`, `postMessage` or a file, never the URL | Models can be large and would stay in the browser history (`patterns/tool-continuity.md`) |
| No deployment workflow yet | Publishing the tool is decided by the owner |
