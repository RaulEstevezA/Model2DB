# Model2DB · Desktop

Desktop version of Model2DB: Python + PySide6.

It does the same as the web version, on your computer and without a browser: it passes the same test cases from [`shared/test-cases/`](../shared/README.md), proposes the same design and writes exactly the same files for every output, engine and option.

What the tool does and its philosophy are in the [main README](../README_en.md).

## Download

There are no packaged versions yet. To use it now, run it from the source code (below).

## Differences with the web version

- It works without going online: there are no links to the other tools.
- A model sent by Mapper arrives as a file (`.json` with `"format": "model-handoff"`): open it with **Open** in the Model pane.
- "Remember on this computer" keeps the work in the application's settings, until you delete it.
- **Save** asks where to save the result; several files are saved as a `.zip`.

## Run locally

Requirements: Python 3.11 or newer.

```bash
cd desktop
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
python -m pytest                   # tests (shared cases from shared/test-cases/)
ruff check .                       # static analysis
python -m model2db                 # run the application
```

## Build the executable

```bash
pip install -e ".[build]"
pyinstaller packaging/model2db.spec
dist/Model2DB.app/Contents/MacOS/Model2DB --smoke-test   # macOS; dist/Model2DB/Model2DB elsewhere
```

The result is in `dist/`: `Model2DB.app` on macOS and a `Model2DB` folder with the executable on Windows and Linux. PyInstaller does not cross-compile: each system is built on its own operating system. `--smoke-test` opens the window, loads every example, reads a YAML and an XML document, writes every output and saves a project, to check that nothing was left out of the package.

## Structure

```
model2db/
  core/          The same logic as web/src/core/, module by module: model, parsers, design, physical schema,
                 outputs, projects and handoffs; workspace.py mirrors web/src/app/
  ui/            The window (PySide6): model, design and result panes, project bar, texts and theme
  examples.py    The built-in examples, the same as web/src/examples/
packaging/       PyInstaller spec, launcher, smoke test and icons
tests/           Shared cases (calls, outputs, variants) and the window
```

## Developer

**Raul Estevez**

- [Personal Website](https://raulesteveza.github.io/)
- [LinkedIn Profile](https://www.linkedin.com/in/raulesteveza/)

## License

[MIT](../LICENSE)
