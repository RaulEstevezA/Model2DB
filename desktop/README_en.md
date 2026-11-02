# Model2DB · Desktop

Desktop version of Model2DB: Python + PySide6.

It does the same as the web version, on your computer and without a browser: it passes the same test cases from [`shared/test-cases/`](../shared/README.md), proposes the same design and writes exactly the same files for every output, engine and option.

What the tool does and its philosophy are in the [main README](../README_en.md).

## Download

| System | File |
|---|---|
| macOS (Apple Silicon) | [Model2DB-macOS.dmg](https://github.com/RaulEstevezA/Model2DB/releases/latest/download/Model2DB-macOS.dmg) |
| Windows (x64) | [Model2DB-Windows.zip](https://github.com/RaulEstevezA/Model2DB/releases/latest/download/Model2DB-Windows.zip) |
| Windows (ARM64) | [Model2DB-Windows-ARM64.zip](https://github.com/RaulEstevezA/Model2DB/releases/latest/download/Model2DB-Windows-ARM64.zip) |
| Linux (x64) | [Model2DB-Linux.tar.gz](https://github.com/RaulEstevezA/Model2DB/releases/latest/download/Model2DB-Linux.tar.gz) |
| Linux (ARM64, Ubuntu 24.04 or newer) | [Model2DB-Linux-ARM64.tar.gz](https://github.com/RaulEstevezA/Model2DB/releases/latest/download/Model2DB-Linux-ARM64.tar.gz) |

Every version is in [Releases](https://github.com/RaulEstevezA/Model2DB/releases).

> [!NOTE]
> The packaged app has been built and checked on **macOS** (Apple Silicon). The Windows and Linux builds are compiled by GitHub Actions and pass the tests and an automatic start-up check, but nobody has used them on a real computer yet. If you find a problem, write to [contact.raulesteveza@gmail.com](mailto:contact.raulesteveza@gmail.com).

- **macOS:** open the `.dmg` and drag Model2DB to Applications.
- **Windows:** unzip the `.zip` and run `Model2DB.exe` inside the `Model2DB` folder.
- **Linux:** extract with `tar -xzf Model2DB-Linux.tar.gz` (or `Model2DB-Linux-ARM64.tar.gz`) and run `Model2DB/Model2DB`. Some distributions need `libxcb-cursor0`. The ARM64 version needs a 2024 or newer distribution (glibc 2.39, like Ubuntu 24.04).

### Opening it the first time

The app is not signed (signing requires paid Apple and Microsoft accounts), so the system shows a warning the first time it is opened:

- **macOS** says it could not verify that the app is free of malware. Click **Done**, go to **System Settings → Privacy & Security**, scroll down to **Security** and click **Open Anyway**. This is only needed once.
- **Windows** shows "Windows protected your PC". Click **More info** and then **Run anyway**.

The code is the one in this repository, and the files are built by GitHub Actions ([workflow](../.github/workflows/release-desktop.yml)).

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
