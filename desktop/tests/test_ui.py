"""The window, without opening it (QT_QPA_PLATFORM=offscreen): examples, decisions, undo, every output, projects,
models received from other tools and the work kept on this computer."""

import json
import zipfile

from PySide6.QtCore import Qt
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

from model2db.core.design.edit import remove_query
from model2db.core.generate.outputs import OUTPUTS
from model2db.examples import EXAMPLES
from model2db.ui.query_list import QueryEditor


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


def test_the_model_editor_keeps_tab_for_indenting_and_escape_then_tab_leaves_it(window):
    window.load_example("store")
    editor = window.input_pane.editor
    editor.setFocus()
    text = editor.toPlainText()
    QTest.keyClick(editor, Qt.Key.Key_Escape)
    QTest.keyClick(editor, Qt.Key.Key_Tab)
    assert editor.toPlainText() == text
    assert QApplication.focusWidget() is not editor
    assert editor.accessibleDescription()
    # The result is read-only: Tab goes on to the next control
    assert window.result_pane.code.tabChangesFocus()
    assert window.result_pane.code.accessibleName() == "PostgreSQL schema generated"


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


def test_a_proposed_query_is_accepted_from_the_review_list_and_becomes_an_index(window):
    window.load_example("store")
    pane = window.design_pane
    session = window.session
    ref = next(item["ref"] for item in session.pending if item["ref"]["kind"] == "query")
    assert ref == {"kind": "query", "model": "Order", "index": 0}
    assert 'TODO: does the application read "Order"' in window.result_pane.code.toPlainText()
    pane.focus_decision(ref)
    row = pane.controls["query:Order#0"]
    assert row.accept is not None
    row.accept.click()
    QApplication.processEvents()
    assert all(item["ref"]["kind"] != "query" for item in session.pending)
    assert "(customer_id, placed_at DESC)" in window.result_pane.code.toPlainText()
    # The accept button is gone: the focus stays on the query
    assert QApplication.focusWidget() is pane.controls["query:Order#0"].edit


def test_a_query_is_written_in_the_editor_and_removed(window):
    window.load_example("store")
    pane = window.design_pane
    session = window.session
    pane.query_editing = ("Order", "new")
    pane.refresh()
    editor = next(widget for widget in pane.findChildren(QueryEditor))
    editor._toggle_filter("status", True)
    editor._add_sort("placedAt")
    editor._change_sort(0, "direction", "desc")
    editor._on_save(editor._filter, editor._sort)
    QApplication.processEvents()
    order = next(item for item in session.design["models"] if item["model"] == "Order")
    assert order["queries"][-1] == {
        "filter": ["status"],
        "sort": [{"field": "placedAt", "direction": "desc"}],
        "status": "active",
        "reasons": [],
    }
    assert "(status, placed_at DESC)" in window.result_pane.code.toPlainText()
    position = len(order["queries"]) - 1
    session.change(remove_query(session.design, "Order", position))
    assert "(status, placed_at DESC)" not in window.result_pane.code.toPlainText()


def test_cassandra_shows_the_table_of_each_query(window):
    window.load_example("store")
    session = window.session
    session.set_output("cassandra")
    ref = next(item["ref"] for item in session.pending if item["ref"]["kind"] == "query")
    window.design_pane.controls["query:Order#0"].accept.click()
    QApplication.processEvents()
    assert "CREATE TABLE IF NOT EXISTS orders_by_customer_id" in window.result_pane.code.toPlainText()
    texts = [label.text() for label in window.design_pane.findChildren(type(window.design_pane.status))]
    assert any(
        text.startswith("Table: orders_by_customer_id") or text.startswith("Tabla: orders_by_customer_id")
        for text in texts
    ), ref
