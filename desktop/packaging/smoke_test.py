"""Checks that the packaged app works: run as `Model2DB --smoke-test`.

PyInstaller only bundles what it sees imported, so a module loaded in an unusual way can be missing from the
executable even though every test passes. This opens the window, loads every example, reads a YAML and an XML
document, writes every output and saves a project, then exits with 0.
"""

import json
import sys
import tempfile
from pathlib import Path

from PySide6.QtCore import QEvent, QTimer


def check(window) -> None:
    from model2db.core.generate.outputs import OUTPUTS
    from model2db.examples import EXAMPLES

    session = window.session
    for example in EXAMPLES:
        session.load_example(example["id"])
        assert session.design is not None, example["id"]
    for output in OUTPUTS:
        session.set_output(output.id)
        assert window.result_pane.code.toPlainText().strip(), output.id
    # PyYAML and the XML parser are imported by the parsers only when a document is read
    session.set_input({"text": "id: 1\nname: Ana\n", "format": None})
    assert session.read["format"] == "yaml"
    session.set_input({"text": "<user><id>1</id></user>", "format": None})
    assert session.read["format"] == "xml"
    session.load_example("store")
    with tempfile.TemporaryDirectory() as folder:
        target = Path(folder) / "order.model2db.json"
        window.project_bar.save_project(str(target))
        assert json.loads(target.read_text(encoding="utf-8"))["format"] == "model2db-project"


def main() -> None:
    from model2db.ui.app import create_app

    app, window = create_app([])
    window.show()

    def run() -> None:
        try:
            check(window)
        except Exception as error:
            print(f"Smoke test failed: {error!r}", file=sys.stderr, flush=True)
            app.exit(1)
        else:
            print("Smoke test passed", flush=True)
            app.exit(0)

    QTimer.singleShot(0, run)
    code = app.exec()
    # Deleted now, not when the process ends, so pending deletions never meet a window already gone
    # (on Linux that crashes the process after the test has passed)
    window.close()
    window.deleteLater()
    app.sendPostedEvents(None, QEvent.Type.DeferredDelete)
    app.processEvents()
    sys.exit(code)
