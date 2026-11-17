"""How the application reads a model, which decides its indexes. A proposed query waits for the user like any other
decision; the user can also write, change and remove them. Mirrors web/src/components/QueryList.tsx."""

from PySide6.QtWidgets import QCheckBox, QComboBox, QFrame, QGridLayout, QHBoxLayout, QLabel, QVBoxLayout, QWidget

from ..core.design.edit import accept_query, add_query, remove_query, set_query
from ..core.design.queries import describe_query, queryable_fields
from .widgets import clear_layout, confidence_badge, muted, small_button


def query_targets(physical: dict | None, model: str, queries: list[dict]) -> tuple[dict, bool]:
    """What each query turned into, by the text the physical schema names it with: an index, the search index of a
    Redis hash, or a table of its own (Cassandra, ScyllaDB). The second value says whether they are tables."""
    if not physical:
        return {}, False
    if physical["kind"] == "widecolumn":
        tables = [table for table in physical["tables"] if table["kind"] == "query" and table["model"] == model]
        return {table["query"]: table["name"] for table in tables}, True
    if physical["kind"] == "keyvalue":
        entry = next((item for item in physical["entries"] if item["model"] == model), None)
        if not entry or not entry["search"]:
            return {}, False
        return {f"{model} {describe_query(query)}": f"idx:{entry['prefix']}" for query in queries}, False
    if physical["kind"] == "relational":
        holder = next(
            (table for table in physical["tables"] if table["kind"] == "entity" and table["model"] == model), None
        )
    else:
        holder = next((item for item in physical["collections"] if item["model"] == model), None)
    indexes = holder["indexes"] if holder else []
    return {index["query"]: index["name"] for index in indexes if index.get("query")}, False


class QueryRow(QFrame):
    """One query: its fields in words, its state, why it was proposed or what it turned into, and its actions."""

    def __init__(self, t, subject: str, text: str, query: dict, target: str | None, tables: bool, actions):
        super().__init__()
        self.setObjectName("row")
        pending = query["status"] == "pending"
        if pending:
            self.setProperty("category", "review")
        self.setAccessibleName(subject)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 6, 10, 6)
        layout.setSpacing(4)
        label = QLabel(text)
        label.setProperty("role", "mono")
        label.setWordWrap(True)
        layout.addWidget(label)
        # The state and the actions go below the text, so a narrow pane does not scroll sideways
        row = QHBoxLayout()
        row.addWidget(confidence_badge(t, "review" if pending else "manual"))
        self.accept = None
        if pending:
            self.accept = small_button(t.accept)
            self.accept.setToolTip(t.accept_title(subject))
            self.accept.setAccessibleName(t.accept_title(subject))
            self.accept.clicked.connect(actions["accept"])
            row.addWidget(self.accept)
        self.edit = small_button(t.edit)
        self.edit.setAccessibleName(t.edit_query(text))
        self.edit.clicked.connect(actions["edit"])
        row.addWidget(self.edit)
        remove = small_button(t.remove)
        remove.setAccessibleName(t.remove_query(text))
        remove.clicked.connect(actions["remove"])
        row.addWidget(remove)
        row.addStretch()
        layout.addLayout(row)
        if pending and query["reasons"]:
            layout.addWidget(muted(" ".join(t.reason(reason) for reason in query["reasons"])))
        if not pending and target:
            layout.addWidget(muted(f"{t.query_table if tables else t.query_index}: {target}"))

    def focus_control(self) -> None:
        (self.accept or self.edit).setFocus()


class QueryEditor(QFrame):
    """The fields a query filters by, then the ones it orders by, each with its direction."""

    def __init__(self, t, fields: list[str], initial: dict, on_save, on_cancel):
        super().__init__()
        self._t = t
        self._fields = fields
        self._filter = [field for field in initial["filter"] if field in fields]
        self._sort = [dict(item) for item in initial["sort"] if item["field"] in fields]
        self._on_save = on_save
        self._on_cancel = on_cancel
        self._layout = QVBoxLayout(self)
        self._layout.setContentsMargins(12, 6, 0, 6)
        self._layout.setSpacing(8)
        self._render()

    def _render(self) -> None:
        t = self._t
        clear_layout(self._layout)
        self._layout.addWidget(muted(t.filter_by))
        # Two columns of fields, so a narrow pane does not scroll sideways
        checks = QGridLayout()
        for position, field in enumerate(self._fields):
            check = QCheckBox(field)
            check.setChecked(field in self._filter)
            check.toggled.connect(lambda checked, field=field: self._toggle_filter(field, checked))
            checks.addWidget(check, position // 2, position % 2)
        self._layout.addLayout(checks)
        self._layout.addWidget(muted(t.sort_by))
        free = [
            field
            for field in self._fields
            if field not in self._filter and all(item["field"] != field for item in self._sort)
        ]
        for position, item in enumerate(self._sort):
            row = QHBoxLayout()
            field_select = QComboBox()
            field_select.setAccessibleName(t.sort_field(position + 1))
            for field in [item["field"], *free]:
                field_select.addItem(field, field)
            field_select.activated.connect(
                lambda index, select=field_select, position=position: self._change_sort(
                    position, "field", select.itemData(index)
                )
            )
            row.addWidget(field_select)
            direction = QComboBox()
            direction.setAccessibleName(t.sort_direction(position + 1))
            direction.addItem(t.ascending, "asc")
            direction.addItem(t.descending, "desc")
            direction.setCurrentIndex(1 if item["direction"] == "desc" else 0)
            direction.activated.connect(
                lambda index, select=direction, position=position: self._change_sort(
                    position, "direction", select.itemData(index)
                )
            )
            row.addWidget(direction)
            remove = small_button(t.remove)
            remove.setAccessibleName(t.remove_sort(item["field"]))
            remove.clicked.connect(lambda _=False, position=position: self._remove_sort(position))
            row.addWidget(remove)
            row.addStretch()
            self._layout.addLayout(row)
        if free:
            add = small_button(t.add_sort)
            add.clicked.connect(lambda: self._add_sort(free[0]))
            holder = QHBoxLayout()
            holder.addWidget(add)
            holder.addStretch()
            self._layout.addLayout(holder)
        empty = not self._filter and not self._sort
        if empty:
            self._layout.addWidget(muted(t.query_empty))
        actions = QHBoxLayout()
        save = small_button(t.save_query, primary=True)
        save.setEnabled(not empty)
        save.clicked.connect(lambda: self._on_save(self._filter, self._sort))
        actions.addWidget(save)
        cancel = small_button(t.cancel)
        cancel.clicked.connect(self._on_cancel)
        actions.addWidget(cancel)
        actions.addStretch()
        self._layout.addLayout(actions)

    def _toggle_filter(self, field: str, checked: bool) -> None:
        self._filter = [*self._filter, field] if checked else [item for item in self._filter if item != field]
        if checked:
            self._sort = [item for item in self._sort if item["field"] != field]
        self._render()

    def _change_sort(self, position: int, key: str, value) -> None:
        self._sort = [{**item, key: value} if i == position else item for i, item in enumerate(self._sort)]
        self._render()

    def _remove_sort(self, position: int) -> None:
        self._sort = [item for i, item in enumerate(self._sort) if i != position]
        self._render()

    def _add_sort(self, field: str) -> None:
        self._sort = [*self._sort, {"field": field, "direction": "asc"}]
        self._render()


def query_section(pane, design: dict, item: dict, fields: list[dict], physical: dict | None) -> QWidget:
    """The Queries section of a model card. `pane` is the design pane: it keeps which query is being edited
    (`query_editing`), registers each row to give it the focus, and applies the changes."""
    t = pane.i18n.t
    session = pane.session
    model = item["model"]
    queries = item.get("queries") or []
    queryable = queryable_fields(fields, item["fields"])
    targets, tables = query_targets(physical, model, queries)
    section = QWidget()
    layout = QVBoxLayout(section)
    layout.setContentsMargins(0, 8, 0, 0)
    layout.setSpacing(6)
    title = QLabel(t.queries_title)
    title.setProperty("role", "muted")
    layout.addWidget(title)
    layout.addWidget(muted(t.queries_help))
    editing = pane.query_editing[1] if pane.query_editing and pane.query_editing[0] == model else None
    if not queries and editing != "new":
        layout.addWidget(muted(t.no_queries))

    def close() -> None:
        pane.query_editing = None
        pane.refresh()

    def save(index):
        def apply(filter_: list[str], sort: list[dict]) -> None:
            pane.query_editing = None
            current = session.design
            pane.change(
                add_query(current, model, filter_, sort)
                if index == "new"
                else set_query(current, model, index, filter_, sort)
            )

        return apply

    for index, query in enumerate(queries):
        text = t.query_text(query)
        subject = t.subjects.query(model, text)
        if editing == index:
            layout.addWidget(QueryEditor(t, queryable, query, save(index), close))
            continue
        ref = {"kind": "query", "model": model, "index": index}

        def accept(_=False, index=index, ref=ref) -> None:
            pane.keep_focus(ref)
            pane.change(accept_query(session.design, model, index))

        def edit(_=False, index=index) -> None:
            pane.query_editing = (model, index)
            pane.refresh()

        def remove(_=False, index=index) -> None:
            pane.query_editing = None
            pane.change(remove_query(session.design, model, index))

        row = QueryRow(
            t,
            subject,
            text,
            query,
            targets.get(f"{model} {describe_query(query)}"),
            tables,
            {"accept": accept, "edit": edit, "remove": remove},
        )
        pane.register(ref, row)
        layout.addWidget(row)
    if editing == "new":
        layout.addWidget(QueryEditor(t, queryable, {"filter": [], "sort": []}, save("new"), close))
    elif queryable:
        add = small_button(t.add_query)

        def start(_=False) -> None:
            pane.query_editing = (model, "new")
            pane.refresh()

        add.clicked.connect(start)
        holder = QHBoxLayout()
        holder.addWidget(add)
        holder.addStretch()
        layout.addLayout(holder)
    return section
