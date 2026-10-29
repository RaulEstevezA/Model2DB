"""The window, without opening it (QT_QPA_PLATFORM=offscreen): examples, decisions, undo, every output, projects,
models received from other tools and the work kept on this computer."""

import json
import zipfile

from PySide6.QtWidgets import QApplication

from model2db.core.generate.outputs import OUTPUTS
from model2db.examples import EXAMPLES


def test_every_example_gives_a_design_and_a_result(window):
    for example in EXAMPLES:
        window.load_example(example["id"])
        session = window.session
        assert session.design is not None, example["id"]
        assert session.output_id == example["output"]
        assert window.result_pane.code.toPlainText() == session.generated["files"][0]["content"]


def test_every_output_writes_files(window):
    window.load_example("store")
    for output in OUTPUTS:
        window.session.set_output(output.id)
        assert window.result_pane.code.toPlainText().strip(), output.id
        assert window.design_pane.status.text(), output.id


def test_typing_reads_the_model_after_a_pause(window):
    pane = window.input_pane
    pane.editor.setPlainText('{"id": 1, "name": "Ana"}')
    pane._commit_text()
    assert window.session.read["format"] == "json"
    assert "2 fields" in pane.status.text()


def test_a_syntax_error_is_shown_with_its_position(window):
    window.input_pane.set_text('{"id": 1,}')
    assert window.session.read["outcome"]["ok"] is False
    assert "Line 1" in window.input_pane.status.text()


def test_accepting_a_decision_keeps_the_focus_on_it(window):
    window.load_example("store")
    pane = window.design_pane
    session = window.session
    before = len(session.pending)
    ref = session.pending[0]["ref"]
    pane.focus_decision(ref)
    control = pane.controls[f"unique:{ref['model']}.{ref['field']}"]
    assert control.accept is not None
    control.accept.click()
    QApplication.processEvents()
    assert len(session.pending) == before - 1
    focused = QApplication.focusWidget()
    rebuilt = pane.controls[f"unique:{ref['model']}.{ref['field']}"]
    assert focused is rebuilt.select


def test_a_decision_can_be_undone_and_redone(window):
    window.load_example("store")
    session = window.session
    before = session.design
    ref = session.pending[0]["ref"]
    window.design_pane._decide(ref, False)
    assert session.design != before
    session.undo()
    assert session.design == before
    session.redo()
    assert session.design != before


def test_the_decisions_survive_a_typo(window):
    window.load_example("store")
    session = window.session
    window.design_pane._decide(session.pending[0]["ref"], accept=True)
    pending = len(session.pending)
    text = session.input["text"]
    window.input_pane.set_text("{{{" + text)
    assert session.design is None
    window.input_pane.set_text(text)
    assert len(session.pending) == pending


def test_each_kind_of_database_keeps_its_design(window):
    window.load_example("store")
    session = window.session
    window.design_pane._decide(session.pending[0]["ref"], accept=True)
    relational = session.design
    session.set_output("mongodb")
    assert session.design["target"] == "document"
    session.set_output("mysql")
    assert session.design == relational


def test_the_settings_change_the_result(window):
    window.load_example("store")
    session = window.session
    session.set_output("sqlalchemy")
    session.set_settings({"tables": "singular", "columns": "snake"}, "auto", "mysql", False)
    names = [file["name"] for file in session.generated["files"]]
    assert names == ["models.py"]
    assert '__tablename__ = "customer"' in session.generated["files"][0]["content"]


def test_a_project_is_saved_and_opened_again(window, tmp_path):
    window.load_example("store")
    session = window.session
    window.design_pane._decide(session.pending[0]["ref"], accept=True)
    designs = session.designs
    path = tmp_path / "order.model2db.json"
    window.project_bar.save_project(str(path))
    saved = json.loads(path.read_text(encoding="utf-8"))
    assert saved["format"] == "model2db-project"
    session.set_input({"text": "", "format": None})
    window.project_bar.open_project(str(path))
    assert session.designs == designs
    assert session.input["text"] == saved["input"]["text"]
    assert "opened" in session.message[0]


def test_a_damaged_project_is_rejected(window, tmp_path):
    path = tmp_path / "broken.json"
    path.write_text('{"format": "model2db-project", "version": 1}', encoding="utf-8")
    window.project_bar.open_project(str(path))
    assert window.session.message == ("The project is damaged ($.designs).", "error")


def test_a_model_sent_by_another_tool_is_received(window, tmp_path):
    handoff = {
        "format": "model-handoff",
        "version": 1,
        "from": "mapper",
        "role": "target",
        "schema": {
            "format": "model-schema",
            "version": 1,
            "models": [
                {
                    "name": "Invoice",
                    "kind": "class",
                    "fields": [
                        {
                            "name": "id",
                            "type": {"kind": "primitive", "name": "integer"},
                            "nullable": False,
                            "optional": False,
                        }
                    ],
                }
            ],
            "enums": [],
        },
    }
    path = tmp_path / "invoice.handoff.json"
    path.write_text(json.dumps(handoff), encoding="utf-8")
    window.input_pane.open_file(str(path))
    assert window.session.input["receivedFrom"] == "Mapper"
    assert window.session.read["format"] == "modelschema"
    assert "Model received from Mapper." in window.input_pane.status.text()


def test_one_file_is_saved_as_it_is_and_several_as_a_zip(window, tmp_path):
    window.load_example("store")
    session = window.session
    single = tmp_path / "order.sql"
    window.result_pane.save(str(single))
    assert single.read_text(encoding="utf-8") == session.generated["files"][0]["content"]
    session.set_output("jpa")
    archive_path = tmp_path / "order.zip"
    window.result_pane.save(str(archive_path))
    with zipfile.ZipFile(archive_path) as archive:
        assert sorted(archive.namelist()) == sorted(file["name"] for file in session.generated["files"])


def test_file_tabs_show_the_file_name(window):
    window.load_example("store")
    window.session.set_output("jpa")
    tabs = window.result_pane.tabs
    labels = [tabs.tabText(index) for index in range(tabs.count())]
    assert "Order.java" in labels
    assert tabs.tabToolTip(labels.index("Order.java")) == "src/main/java/com/example/model/Order.java"


def test_the_work_is_kept_only_when_asked(window):
    window.load_example("json")
    session = window.session
    assert not session.has_saved()
    window.project_bar.remember.setChecked(True)
    assert session.has_saved()
    session.set_input({"text": "", "format": None})
    assert session.restore_saved()
    assert session.design is not None
    session.clear_saved()
    assert not session.has_saved()
    assert not session.remember


def test_the_language_can_be_switched(window):
    from model2db.ui.i18n import EN, ES

    window._i18n.set_language("es")
    assert window.design_pane.title.text() == ES.design_title
    window._i18n.set_language("en")
    assert window.design_pane.title.text() == EN.design_title
