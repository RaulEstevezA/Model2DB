"""The interpretation of the model as a database: every proposal, why it was made and how sure it is. Nothing
pending reaches the result until the user decides. Mirrors web/src/components/DesignPane.tsx, ModelCard.tsx,
FieldRow.tsx and DecisionControl.tsx."""

from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLayout,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from ..core.design.edit import (
    decide,
    set_field_include,
    set_field_index,
    set_field_override,
    set_model_include,
    set_table_name,
)
from ..core.design.types import same_value
from ..core.model.schema import all_fields, describe_type
from .pane import Pane
from .widgets import badge, clear_layout, confidence_badge, mono, muted, small_button


def _shape(type_ref: dict) -> str:
    """What a relation option means, which depends on the kind of field."""
    if type_ref["kind"] == "model":
        return "model"
    if type_ref["kind"] == "map":
        return "map"
    if type_ref["kind"] == "array":
        return "models" if type_ref["items"]["kind"] == "model" else "values"
    return "free"


def ref_key(ref: dict) -> str:
    """Identifies a decision across rebuilds of the pane, to keep the focus on it."""
    if ref["kind"] == "enum":
        return f"enum:{ref['enum']}"
    if ref["kind"] == "key":
        return f"key:{ref['model']}"
    return f"{ref['kind']}:{ref['model']}.{ref['field']}"


class CommitLine(QLineEdit):
    """A text field that applies its value when it loses the focus or on Enter, so typing a name is one step in the
    history, not one per letter. Escape restores the applied value."""

    def __init__(self, value: str, placeholder: str, on_commit):
        super().__init__(value)
        self.setPlaceholderText(placeholder)
        self._value = value
        self._on_commit = on_commit
        self.editingFinished.connect(self._commit)

    def _commit(self) -> None:
        if self.text().strip() != self._value:
            self._value = self.text().strip()
            self._on_commit(self.text())

    def keyPressEvent(self, event) -> None:  # noqa: N802 (Qt's name)
        if event.key() == Qt.Key.Key_Escape:
            self.setText(self._value)
            return
        super().keyPressEvent(event)


class DecisionControl(QFrame):
    """One decision: the chosen or suggested option, its state in text and color, and why it was proposed. A pending
    decision offers to accept the suggestion as it is, or to choose another option."""

    def __init__(self, t, subject: str, decision: dict, option_label, on_choose, on_accept):
        super().__init__()
        self.setObjectName("row")
        pending = decision["status"] == "pending"
        if pending:
            self.setProperty("category", "review")
        self.setAccessibleName(subject)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 6, 10, 6)
        layout.setSpacing(4)
        row = QHBoxLayout()
        self.select: QComboBox | None = None
        if len(decision["options"]) > 1:
            self.select = QComboBox()
            self.select.setAccessibleName(subject)
            for option in decision["options"]:
                self.select.addItem(option_label(option))
            index = next(
                (i for i, option in enumerate(decision["options"]) if same_value(option, decision["value"])), 0
            )
            self.select.setCurrentIndex(index)
            self.select.activated.connect(lambda i: on_choose(decision["options"][i]))
            row.addWidget(self.select, 1)
        else:
            row.addWidget(QLabel(option_label(decision["value"])), 1)
        row.addWidget(confidence_badge(t, "manual" if decision.get("manual") else decision["confidence"]))
        self.accept: QPushButton | None = None
        if pending:
            self.accept = small_button(t.accept)
            self.accept.setToolTip(t.accept_title(subject))
            self.accept.setAccessibleName(t.accept_title(subject))
            self.accept.clicked.connect(on_accept)
            row.addWidget(self.accept)
        layout.addLayout(row)
        why = (
            t.reason({"code": "manual"})
            if decision.get("manual")
            else " ".join(t.reason(reason) for reason in decision["reasons"])
        )
        layout.addWidget(muted(why))

    def focus_control(self) -> None:
        """The control itself, so its name and state are read; the decision when it has a single option."""
        (self.select or self.accept or self).setFocus()


class DesignPane(Pane):
    def __init__(self, i18n, session):
        super().__init__()
        self._i18n = i18n
        self._session = session
        # (model, field) whose editor is open; field "" is the model's own editor
        self._editing: tuple[str, str] | None = None
        # The decision that keeps the focus after the pane is rebuilt (accepting removes its button)
        self._focus: str | None = None
        self.controls: dict[str, DecisionControl] = {}

        self.undo_button = QPushButton()
        self.undo_button.clicked.connect(session.undo)
        self.redo_button = QPushButton()
        self.redo_button.clicked.connect(session.redo)
        self.reset_button = QPushButton()
        self.reset_button.clicked.connect(self._reset)
        for button in (self.undo_button, self.redo_button, self.reset_button):
            self.header.addWidget(button)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        content = QWidget()
        self._content = QVBoxLayout(content)
        self._content.setContentsMargins(14, 0, 14, 14)
        self._content.setSpacing(10)
        # The content grows with what it holds and scrolls, instead of being squeezed into the visible height
        self._content.setSizeConstraint(QLayout.SizeConstraint.SetMinimumSize)
        self.scroll.setWidget(content)
        self.body.addWidget(self.scroll, 1)

        self.status = QLabel()
        self.status.setWordWrap(True)
        self.footer.addWidget(self.status, 1)

        i18n.changed.connect(self.refresh)
        # The result follows every change of the design, and the table and column names shown come with it
        session.output_changed.connect(self.refresh)
        self.refresh()

    # Actions

    def _reset(self) -> None:
        if QMessageBox.question(self, "Model2DB", self._i18n.t.confirm_reset) == QMessageBox.StandardButton.Yes:
            self._session.reset_design()

    def _decide(self, ref: dict, value=None, accept: bool = False) -> None:
        design = self._session.design
        if not design:
            return
        self._focus = ref_key(ref)
        self._session.change(decide(design, ref) if accept else decide(design, ref, value))

    def _change(self, design: dict) -> None:
        self._session.change(design)

    def focus_decision(self, ref: dict) -> None:
        control = self.controls.get(ref_key(ref))
        if control:
            self.scroll.ensureWidgetVisible(control)
            control.focus_control()

    def _toggle_editor(self, model: str, field: str) -> None:
        self._editing = None if self._editing == (model, field) else (model, field)
        self.refresh()

    # Display

    def _subject(self, ref: dict) -> str:
        subjects = self._i18n.t.subjects
        if ref["kind"] == "key":
            return subjects.key(ref["model"])
        if ref["kind"] == "unique":
            return subjects.unique(ref["model"], ref["field"])
        if ref["kind"] == "enum":
            return subjects.enum(ref["enum"])
        return subjects.field(ref["model"], ref["field"])

    def _control(self, ref: dict, decision: dict, option_label) -> DecisionControl:
        control = DecisionControl(
            self._i18n.t,
            self._subject(ref),
            decision,
            option_label,
            lambda value: self._decide(ref, value),
            lambda: self._decide(ref, accept=True),
        )
        self.controls[ref_key(ref)] = control
        return control

    def refresh(self) -> None:
        t = self._i18n.t
        session = self._session
        schema, design = session.schema, session.design
        self.title.setText(t.design_title)
        self.undo_button.setText(t.undo)
        self.undo_button.setToolTip(t.undo_title)
        self.undo_button.setEnabled(session.can_undo)
        self.redo_button.setText(t.redo)
        self.redo_button.setToolTip(t.redo_title)
        self.redo_button.setEnabled(session.can_redo)
        self.reset_button.setText(t.reset)
        self.reset_button.setToolTip(t.reset_title)
        self.reset_button.setEnabled(design is not None)
        # The pane is built again: the decision that has the focus gets it back afterwards
        focused = QApplication.focusWidget()
        if self._focus is None and focused is not None:
            self._focus = next(
                (key for key, control in self.controls.items() if control is focused or control.isAncestorOf(focused)),
                None,
            )
        clear_layout(self._content)
        self.controls = {}
        if not schema or not design:
            self._content.addWidget(muted(t.design_waiting))
            self._content.addStretch()
            self.status.setText("")
            return

        kind = design["target"]
        roles = session.roles
        pending = session.pending
        stored = [model for model in schema["models"] if roles.get(model["name"]) == "stored"]
        others = [model for model in schema["models"] if roles.get(model["name"]) != "stored"]
        self._content.addWidget(muted(t.design_for(session.output.label, kind)))

        if pending:
            box = QFrame()
            box.setObjectName("row")
            box.setProperty("category", "review")
            box_layout = QVBoxLayout(box)
            box_layout.setContentsMargins(12, 8, 12, 8)
            title = QLabel(t.review_summary(len(pending)))
            title.setProperty("role", "warning")
            box_layout.addWidget(title)
            box_layout.addWidget(muted(t.review_help))
            for item in pending:
                row = QHBoxLayout()
                link = QPushButton(self._subject(item["ref"]))
                link.setProperty("link", True)
                link.clicked.connect(lambda _=False, ref=item["ref"]: self.focus_decision(ref))
                row.addWidget(link)
                row.addWidget(muted(" ".join(t.reason(reason) for reason in item["decision"]["reasons"])), 1)
                box_layout.addLayout(row)
            self._content.addWidget(box)

        physical = session.generated["physical"] if session.generated else None
        for model in stored:
            item = next((entry for entry in design["models"] if entry["model"] == model["name"]), None)
            if item:
                self._content.addWidget(self._model_card(design, item, all_fields(schema, model), physical))

        if design["enums"]:
            self._content.addWidget(self._section_title(t.enums_title))
            for item in design["enums"]:
                ref = {"kind": "enum", "enum": item["enum"]}
                row = QHBoxLayout()
                row.addWidget(mono(item["enum"]))
                row.addWidget(self._control(ref, item["storage"], lambda value: t.enum_option[value]), 1)
                self._content.addLayout(row)

        if others:
            self._content.addWidget(
                self._section_title(t.other_models_title if kind == "relational" else t.other_documents_title)
            )
            role_text = t.role if kind == "relational" else t.document_role
            for model in others:
                role = roles.get(model["name"], "unused")
                row = QHBoxLayout()
                row.addWidget(mono(model["name"]))
                row.addWidget(muted(role_text[role]), 1)
                if session.can_exclude(model["name"]) and role in ("excluded", "parent"):
                    check = QCheckBox(t.include_model(model["name"]))
                    check.setChecked(False)
                    check.toggled.connect(
                        lambda checked, name=model["name"]: self._change(
                            set_model_include(session.design, name, checked)
                        )
                    )
                    row.addWidget(check)
                self._content.addLayout(row)
        self._content.addStretch()

        summary = t.design_summary(len(stored), kind)
        state = t.pending_count(len(pending)) if pending else t.all_decided
        self.status.setText(f"{summary} · {state}")
        self.status.setProperty("role", "warning" if pending else "muted")
        self.status.style().unpolish(self.status)
        self.status.style().polish(self.status)
        self.status.setAccessibleName(self.status.text())

        if self._focus and self._focus in self.controls:
            control = self.controls[self._focus]
            # Once the widgets are laid out, so the scroll area can show it
            QTimer.singleShot(0, lambda: (self.scroll.ensureWidgetVisible(control), control.focus_control()))
        self._focus = None

    def _section_title(self, text: str) -> QLabel:
        label = QLabel(text)
        label.setProperty("role", "sectionTitle")
        return label

    def _model_card(self, design: dict, item: dict, fields: list[dict], physical: dict | None) -> QFrame:
        t = self._i18n.t
        session = self._session
        relational = design["target"] == "relational"
        model = item["model"]
        table = None
        name = ""
        if physical and physical["kind"] == "relational":
            table = next(
                (entry for entry in physical["tables"] if entry["kind"] == "entity" and entry["model"] == model), None
            )
            name = table["name"] if table else ""
        elif physical:
            collection = next((entry for entry in physical["collections"] if entry["model"] == model), None)
            name = collection["name"] if collection else ""

        card = QFrame()
        card.setObjectName("card")
        layout = QVBoxLayout(card)
        layout.setContentsMargins(14, 10, 14, 10)
        layout.setSpacing(8)
        header = QHBoxLayout()
        title = QLabel(f"{model} → {name}" if name else model)
        title.setProperty("role", "sectionTitle")
        header.addWidget(title, 1)
        if session.can_exclude(model):
            check = QCheckBox(t.include_model(model))
            check.setChecked(item["include"])
            check.toggled.connect(lambda checked: self._change(set_model_include(session.design, model, checked)))
            header.addWidget(check)
        edit = small_button(t.edit)
        edit.setAccessibleName(t.edit_title(model))
        edit.setCheckable(True)
        edit.setChecked(self._editing == (model, ""))
        edit.clicked.connect(lambda: self._toggle_editor(model, ""))
        header.addWidget(edit)
        layout.addLayout(header)
        if self._editing == (model, ""):
            label = t.table_name if relational else t.collection_name
            line = CommitLine(
                item.get("table", ""),
                name,
                lambda value: self._change(set_table_name(session.design, model, value)),
            )
            line.setAccessibleName(label)
            layout.addWidget(muted(label))
            layout.addWidget(line)

        key = item.get("key")
        key_field = (
            key["value"]["field"] if key and key["status"] == "active" and key["value"]["kind"] == "field" else None
        )
        if key:
            layout.addWidget(muted(t.key if relational else t.document_key))
            layout.addWidget(self._control({"kind": "key", "model": model}, key, t.key_option))

        for field in fields:
            decided = next((entry for entry in item["fields"] if entry["field"] == field["name"]), None)
            if decided:
                layout.addWidget(self._field_row(design, model, field, decided, field["name"] == key_field, table))
        return card

    def _field_row(self, design: dict, model: str, field: dict, decided: dict, is_key: bool, table: dict | None):
        t = self._i18n.t
        session = self._session
        relational = design["target"] == "relational"
        shape = _shape(field["type"])
        source = f"{model}.{field['name']}"
        columns = [column for column in (table["columns"] if table else []) if column.get("source") == source]
        derived = columns[0]["name"] if columns else ""

        def relation_label(value) -> str:
            if not relational and value == "reference":
                return t.document_reference(shape == "models")
            return t.relation_option(value, shape)

        row = QWidget()
        layout = QVBoxLayout(row)
        layout.setContentsMargins(0, 4, 0, 4)
        layout.setSpacing(4)
        head = QHBoxLayout()
        name_label = mono(field["name"])
        name_label.setProperty("tone", "name")
        head.addWidget(name_label)
        type_label = mono(field.get("originalType") or describe_type(field["type"]))
        type_label.setProperty("tone", "type")
        head.addWidget(type_label)
        if not decided["include"]:
            head.addWidget(badge(t.not_stored))
        else:
            if derived and not decided.get("relation"):
                head.addWidget(muted(f"→ {derived}", wrap=False))
            if is_key:
                head.addWidget(badge(t.primary_key))
        head.addStretch()
        edit = small_button(t.edit)
        edit.setAccessibleName(t.edit_title(source))
        edit.setCheckable(True)
        edit.setChecked(self._editing == (model, field["name"]))
        edit.clicked.connect(lambda: self._toggle_editor(model, field["name"]))
        head.addWidget(edit)
        layout.addLayout(head)

        if decided["include"]:
            if decided.get("relation"):
                ref = {"kind": "relation", "model": model, "field": field["name"]}
                layout.addWidget(self._control(ref, decided["relation"], relation_label))
            if decided.get("foreignKey"):
                ref = {"kind": "foreignKey", "model": model, "field": field["name"]}
                layout.addWidget(self._control(ref, decided["foreignKey"], t.foreign_key_option))
            if decided.get("unique"):
                ref = {"kind": "unique", "model": model, "field": field["name"]}
                layout.addWidget(self._control(ref, decided["unique"], t.unique_option))

        if self._editing == (model, field["name"]):
            editor = QFrame()
            editor.setObjectName("editorBox")
            box = QVBoxLayout(editor)
            box.setContentsMargins(12, 8, 12, 8)
            include = QCheckBox(t.include_field)
            include.setChecked(decided["include"])
            include.toggled.connect(
                lambda checked: self._change(set_field_include(session.design, model, field["name"], checked))
            )
            box.addWidget(include)
            if decided["include"]:
                label = t.column_name if relational else t.property_name
                box.addWidget(muted(label))
                column = CommitLine(
                    decided.get("column", ""),
                    derived or field["name"],
                    lambda value: self._change(
                        set_field_override(session.design, model, field["name"], "column", value)
                    ),
                )
                column.setAccessibleName(label)
                box.addWidget(column)
                if relational and not decided.get("relation"):
                    box.addWidget(muted(t.column_type))
                    column_type = CommitLine(
                        decided.get("type", ""),
                        t.derived,
                        lambda value: self._change(
                            set_field_override(session.design, model, field["name"], "type", value)
                        ),
                    )
                    column_type.setAccessibleName(t.column_type)
                    box.addWidget(column_type)
                    box.addWidget(muted(t.column_type_help))
                if not is_key and not decided.get("relation"):
                    index = QCheckBox(t.add_index)
                    index.setChecked(decided.get("index") is True)
                    index.toggled.connect(
                        lambda checked: self._change(set_field_index(session.design, model, field["name"], checked))
                    )
                    box.addWidget(index)
            layout.addWidget(editor)
        return row
