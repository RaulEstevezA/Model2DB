"""The result for the chosen database or ORM: its settings, the notes, file tabs, copy and save. Mirrors
web/src/components/ResultPane.tsx and ResultOptions.tsx."""

import zipfile
from pathlib import Path

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QStandardItemModel
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QFileDialog,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QTabBar,
)

from ..core.generate.outputs import OUTPUTS
from ..core.generate.sql.sql import DIALECT_NAMES
from ..core.generate.types import OUTPUT_GROUPS
from .code_view import CodeView
from .pane import Pane, section
from .paths import in_downloads
from .widgets import clear_layout

TABLE_NAMINGS = ("plural", "singular", "model")
COLUMN_NAMINGS = ("snake", "field")
STRINGS = ("auto", "varchar", "text")


def tab_labels(names: list[str]) -> list[str]:
    """The name a file tab shows: the file's own name, and its path only when another file has the same name.
    The footer shows the full path of the selected file."""

    def base(name: str) -> str:
        return name[name.rfind("/") + 1 :]

    return [name if sum(base(other) == base(name) for other in names) > 1 else base(name) for name in names]


class ResultPane(Pane):
    def __init__(self, i18n, session):
        super().__init__()
        self._i18n = i18n
        self._session = session
        self._file_index = 0
        self.last_saved: str | None = None
        self._saved_message: str | None = None

        self.database = QComboBox()
        self.database.activated.connect(lambda _=0: self._choose_output())
        self.header.addWidget(self.database)

        settings = section()
        self._grid = QGridLayout(settings)
        self._grid.setContentsMargins(14, 0, 14, 8)
        self._grid.setHorizontalSpacing(10)
        self._grid.setVerticalSpacing(6)
        self.body.addWidget(settings)

        self.notes = QLabel()
        self.notes.setWordWrap(True)
        self.notes.setProperty("role", "warningBox")
        notes_holder = section()
        notes_layout = QHBoxLayout(notes_holder)
        notes_layout.setContentsMargins(14, 0, 14, 8)
        notes_layout.addWidget(self.notes)
        self.body.addWidget(notes_holder)

        self.tabs = QTabBar()
        self.tabs.setExpanding(False)
        self.tabs.setUsesScrollButtons(True)
        self.tabs.currentChanged.connect(self._choose_file)
        tabs_holder = section()
        tabs_layout = QHBoxLayout(tabs_holder)
        tabs_layout.setContentsMargins(14, 0, 14, 0)
        tabs_layout.addWidget(self.tabs, 1)
        self.body.addWidget(tabs_holder)

        self.code = CodeView("text", read_only=True)
        self.body.addWidget(self.code, 1)

        self.file = QLabel()
        self.file.setWordWrap(True)
        self.file.setProperty("role", "muted")
        self.footer.addWidget(self.file, 1)
        self.copy_button = QPushButton()
        self.copy_button.clicked.connect(self.copy)
        self.save_button = QPushButton()
        self.save_button.setProperty("primary", True)
        self.save_button.clicked.connect(lambda: self.save())
        self.footer.addWidget(self.copy_button)
        self.footer.addWidget(self.save_button)

        self._copied = QTimer(self)
        self._copied.setSingleShot(True)
        self._copied.setInterval(2000)
        self._copied.timeout.connect(self.refresh)

        i18n.changed.connect(self._fill_outputs)
        i18n.changed.connect(self.refresh)
        session.output_changed.connect(self._output_changed)
        self._fill_outputs()
        self.refresh()

    @property
    def files(self) -> list[dict]:
        generated = self._session.generated
        return generated["files"] if generated else []

    def _fill_outputs(self) -> None:
        """The outputs by group, each group under a heading that cannot be chosen."""
        t = self._i18n.t
        self.database.blockSignals(True)
        self.database.clear()
        model = self.database.model()
        for group in OUTPUT_GROUPS:
            self.database.addItem(t.output_groups[group], None)
            if isinstance(model, QStandardItemModel):
                heading = model.item(self.database.count() - 1)
                heading.setEnabled(False)
            for output in OUTPUTS:
                if output.group == group:
                    self.database.addItem(f"   {output.label}", output.id)
        self.database.setAccessibleName(t.database_label)
        self.database.blockSignals(False)

    def _choose_output(self) -> None:
        output_id = self.database.currentData()
        if output_id:
            self._session.set_output(output_id)

    def _choose_file(self, index: int) -> None:
        if index >= 0 and index != self._file_index:
            self._file_index = index
            self._show_file()

    def _output_changed(self) -> None:
        self._saved_message = None
        self.refresh()

    def _set(self, **changes) -> None:
        settings = {**self._session.settings, **changes}
        self._session.set_settings(settings["naming"], settings["strings"], settings["engine"], settings["migrations"])

    def copy(self) -> None:
        files = self.files
        if files:
            QApplication.clipboard().setText(files[min(self._file_index, len(files) - 1)]["content"])
            self.copy_button.setText(self._i18n.t.copied)
            self._copied.start()

    def save(self, path: str | None = None) -> None:
        """Saves the file, or a .zip with every file. path skips the dialog (tests)."""
        files = self.files
        if not files:
            return
        t = self._i18n.t
        if len(files) == 1:
            name = files[0]["name"]
            target = path or QFileDialog.getSaveFileName(self, t.save, in_downloads(name[name.rfind("/") + 1 :]))[0]
            if target:
                Path(target).write_text(files[0]["content"], encoding="utf-8")
        else:
            default = self._session.generated["archiveName"]
            target = path or QFileDialog.getSaveFileName(self, t.save, in_downloads(default), "ZIP (*.zip)")[0]
            if target:
                with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
                    for file in files:
                        archive.writestr(file["name"], file["content"])
        if target:
            self.last_saved = target
            self._saved_message = t.saved(target)
            self.refresh()

    def _show_file(self) -> None:
        files = self.files
        if files:
            file = files[min(self._file_index, len(files) - 1)]
            self.code.set_language(file["editorLanguage"])
            self.code.set_text_keeping_position(file["content"])
        else:
            self.code.setPlainText("")
        self._show_footer()

    def _show_footer(self) -> None:
        t = self._i18n.t
        files = self.files
        lines = []
        if files:
            lines.append(files[min(self._file_index, len(files) - 1)]["name"])
        todos = self._todos()
        if todos:
            lines.append(t.pending_in_result(todos))
        if self._saved_message:
            lines.append(self._saved_message)
        self.file.setText(" · ".join(lines))

    def _todos(self) -> int:
        generated = self._session.generated
        if not generated:
            return 0
        physical = generated["physical"]
        parts = physical["tables"] if physical["kind"] == "relational" else physical["collections"]
        return sum(len(part["todos"]) for part in parts)

    def _options(self) -> None:
        t = self._i18n.t
        session = self._session
        output = session.output
        settings = session.settings
        relational = output.target == "relational"
        clear_layout(self._grid)
        column = 0

        def add(label_text: str, widget) -> None:
            nonlocal column
            label = QLabel(label_text)
            label.setProperty("role", "fieldLabel")
            label.setBuddy(widget)
            widget.setAccessibleName(label_text)
            self._grid.addWidget(label, 0, column)
            self._grid.addWidget(widget, 1, column)
            column += 1

        def choice(items: list[tuple[str, str]], current: str, apply) -> QComboBox:
            widget = QComboBox()
            for text, value in items:
                widget.addItem(text, value)
            widget.setCurrentIndex(max(0, widget.findData(current)))
            widget.activated.connect(lambda _=0, widget=widget: apply(widget.currentData()))
            return widget

        if relational and output.engines:
            engine = settings["engine"] if settings["engine"] in output.engines else output.engines[0]
            add(
                t.engine_label,
                choice(
                    [(DIALECT_NAMES[item], item) for item in output.engines],
                    engine,
                    lambda value: self._set(engine=value),
                ),
            )
        naming = settings["naming"]
        tables = t.tables_naming_option
        add(
            t.tables_naming if relational else t.collections_naming,
            choice(
                [(tables[item], item) for item in TABLE_NAMINGS],
                naming["tables"],
                lambda value: self._set(naming={**naming, "tables": value}),
            ),
        )
        add(
            t.columns_naming if relational else t.properties_naming,
            choice(
                [(t.columns_naming_option[item], item) for item in COLUMN_NAMINGS],
                naming["columns"],
                lambda value: self._set(naming={**naming, "columns": value}),
            ),
        )
        if relational:
            add(
                t.strings_label,
                choice(
                    [(t.strings_option[item], item) for item in STRINGS],
                    settings["strings"],
                    lambda value: self._set(strings=value),
                ),
            )
        if output.migrations:
            check = QCheckBox(t.include_migration)
            check.setChecked(settings["migrations"])
            check.toggled.connect(lambda checked: self._set(migrations=checked))
            self._grid.addWidget(check, 1, column, Qt.AlignmentFlag.AlignVCenter)
            column += 1
        self._grid.setColumnStretch(column, 1)

    def refresh(self) -> None:
        t = self._i18n.t
        session = self._session
        output = session.output
        self.title.setText(t.result_title)
        self.database.blockSignals(True)
        self.database.setCurrentIndex(max(0, self.database.findData(output.id)))
        self.database.blockSignals(False)
        self.code.setPlaceholderText(t.result_empty)
        self._options()

        files = self.files
        names = [file["name"] for file in files]
        labels = tab_labels(names)
        self.tabs.blockSignals(True)
        while self.tabs.count():
            self.tabs.removeTab(0)
        if len(files) > 1:
            for index, file in enumerate(files):
                self.tabs.addTab(labels[index])
                self.tabs.setTabToolTip(index, file["name"])
            self._file_index = min(self._file_index, len(files) - 1)
            self.tabs.setCurrentIndex(self._file_index)
        else:
            self._file_index = 0
        self.tabs.setVisible(len(files) > 1)
        self.tabs.blockSignals(False)

        generated = session.generated
        notes = generated["physical"]["notes"] if generated else []
        self.notes.setText("\n".join([t.notes_count(len(notes)), *(f"· {t.note(note)}" for note in notes)]))
        self.notes.setVisible(bool(notes))
        self._show_file()
        self.copy_button.setText(t.copied if self._copied.isActive() else t.copy)
        self.copy_button.setEnabled(bool(files))
        self.save_button.setText(t.save_zip(len(files)) if len(files) > 1 else t.save)
        self.save_button.setEnabled(bool(files))
