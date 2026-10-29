"""What the window shows and works with: the input, the designs with their undo history, the output settings and
the generated files. Mirrors the state of web/src/App.tsx and its hooks.

Every change recomputes what depends on it and emits the signal of what changed, so the panels stay in sync.
Preferences are stored (QSettings); the model and the decisions only when the user turns on "Remember on this
computer", as in the web version.
"""

import json

from PySide6.QtCore import QObject, QSettings, QTimer, Signal

from ..core.design.edit import reconcile
from ..core.design.propose import propose_design
from ..core.generate.outputs import find_output, generate
from ..core.interop.project import create_project, project_file_name, read_project
from ..core.js import trim
from ..core.model.schema import default_root
from ..core.physical.roles import model_roles
from ..core.workspace import (
    EMPTY_INPUT,
    can_exclude,
    designs_for_input,
    input_of_project,
    pending_decisions,
    read_input,
    received_input,
)
from ..examples import find_example

# Steps kept for undo
HISTORY_LIMIT = 100
NO_DESIGNS = {"relational": None, "document": None}
# Documents keep the field names of the model; tables follow the SQL convention
DEFAULT_NAMING = {
    "relational": {"tables": "plural", "columns": "snake"},
    "document": {"tables": "plural", "columns": "field"},
}
DIALECTS = ("postgresql", "mysql", "mariadb", "sqlite", "sqlserver", "oracle")


def _json_setting(value, default):
    try:
        result = json.loads(value) if isinstance(value, str) else default
    except ValueError:
        return default
    return result if isinstance(result, type(default)) else default


def _bool(value) -> bool:
    # QSettings gives back "true" / "false" strings with the INI format
    return value in (True, "true", "1", 1)


class Session(QObject):
    input_changed = Signal()
    design_changed = Signal()
    output_changed = Signal()
    message_changed = Signal()

    def __init__(self, settings: QSettings):
        super().__init__()
        self._settings = settings
        self.input = dict(EMPTY_INPUT)
        self.read = read_input(self.input)
        self._schema_key = ""
        # Designs to start from when the next model is read (a project, the copy kept on this computer)
        self._next_designs = NO_DESIGNS
        self.designs = NO_DESIGNS
        self._past: list = []
        self._future: list = []
        self.roles: dict[str, str] = {}
        self.pending: list[dict] = []
        self.generated: dict | None = None
        # A message for the user: (text, "ok" | "error"), or None
        self.message: tuple[str, str] | None = None

        # Preferences (remembered)
        self.output_id = find_output(str(settings.value("output", "postgresql"))).id
        namings = _json_setting(settings.value("naming"), {})
        self.namings = {target: namings.get(target, DEFAULT_NAMING[target]) for target in DEFAULT_NAMING}
        self.strings = str(settings.value("strings", "auto"))
        if self.strings not in ("auto", "varchar", "text"):
            self.strings = "auto"
        self.engine = str(settings.value("engine", "postgresql"))
        if self.engine not in DIALECTS:
            self.engine = "postgresql"
        self.migrations = _bool(settings.value("migrations", True))
        self.remember = _bool(settings.value("remember", False))

        # The copy of the work kept while "remember" is on, written once changes pause
        self._save_timer = QTimer(self)
        self._save_timer.setSingleShot(True)
        self._save_timer.setInterval(600)
        self._save_timer.timeout.connect(self._save_workspace)

    # Input

    @property
    def schema(self) -> dict | None:
        outcome = self.read["outcome"]
        return outcome["schema"] if outcome and outcome["ok"] else None

    @property
    def title(self) -> str | None:
        schema = self.schema
        return (schema.get("root") or default_root(schema)) if schema else None

    def set_input(self, state: dict) -> None:
        if state == self.input:
            return
        # Clearing the input starts over: the decisions made on the previous model are discarded too
        if trim(state["text"]) == "":
            self._next_designs = NO_DESIGNS
        self.input = state
        self.read = read_input(state)
        self.input_changed.emit()
        self._reconcile()

    def change_input(self, **changes) -> None:
        state = {**self.input, **changes}
        for key in [key for key, value in changes.items() if value is None and key in ("fileName", "receivedFrom")]:
            state.pop(key, None)
        self.set_input(state)

    def has_work(self) -> bool:
        return trim(self.input["text"]) != ""

    def can_exclude(self, model: str) -> bool:
        return self.schema is not None and can_exclude(self.schema, model)

    def _reconcile(self) -> None:
        """A new proposal whenever the model changes, keeping what the user decided wherever it still applies."""
        schema = self.schema
        key = json.dumps(schema, sort_keys=True) if schema else ""
        if key == self._schema_key:
            return
        self._schema_key = key
        # While the model cannot be read (a typo being fixed) the designs stay, so the next model keeps the decisions
        if not schema:
            self._design_updated()
            return
        previous = self._next_designs
        self._reset({target: reconcile(previous[target], schema, target) for target in ("relational", "document")})

    # Designs and history

    @property
    def target(self) -> str:
        return self.output.target

    @property
    def design(self) -> dict | None:
        return self.designs[self.target] if self.schema else None

    @property
    def can_undo(self) -> bool:
        return bool(self._past)

    @property
    def can_redo(self) -> bool:
        return bool(self._future)

    def _reset(self, designs: dict) -> None:
        """A new starting point (a new model, a project): the history starts over."""
        self._past.clear()
        self._future.clear()
        self.designs = designs
        # The next model starts from these, unless it is a different one (see load_example and set_input)
        self._next_designs = designs
        self._design_updated()

    def change(self, design: dict) -> None:
        """A change the user made to the design: it can be undone."""
        if design == self.designs[design["target"]]:
            return
        self._past.append(self.designs)
        del self._past[:-HISTORY_LIMIT]
        self._future.clear()
        # Kept for the next model too, so editing the input does not throw the review away
        self.designs = {**self.designs, design["target"]: design}
        self._next_designs = self.designs
        self._design_updated()

    def undo(self) -> None:
        if not self._past:
            return
        self._future.append(self.designs)
        self.designs = self._past.pop()
        self._next_designs = self.designs
        self._design_updated()

    def redo(self) -> None:
        if not self._future:
            return
        self._past.append(self.designs)
        self.designs = self._future.pop()
        self._next_designs = self.designs
        self._design_updated()

    def reset_design(self) -> None:
        """Back to the proposal, as a step that can be undone."""
        if self.schema:
            self.change(propose_design(self.schema, self.target))

    def _design_updated(self) -> None:
        design, schema = self.design, self.schema
        self.roles = model_roles(schema, design) if schema and design else {}
        self.pending = pending_decisions(design, self.roles) if design else []
        self.design_changed.emit()
        self._generate()

    # Output

    @property
    def output(self):
        return find_output(self.output_id)

    @property
    def settings(self) -> dict:
        return {
            "naming": self.namings[self.target],
            "strings": self.strings,
            "engine": self.engine,
            "migrations": self.migrations,
        }

    def set_output(self, output_id: str) -> None:
        target = self.target
        self.output_id = find_output(output_id).id
        self._settings.setValue("output", self.output_id)
        if self.target != target:
            # The other kind of database has its own design
            self._design_updated()
        else:
            self._generate()

    def set_settings(self, naming: dict, strings: str, engine: str, migrations: bool) -> None:
        self.namings = {**self.namings, self.target: naming}
        self.strings = strings
        self.engine = engine
        self.migrations = migrations
        self._settings.setValue("naming", json.dumps(self.namings))
        self._settings.setValue("strings", strings)
        self._settings.setValue("engine", engine)
        self._settings.setValue("migrations", migrations)
        self._generate()

    def _generate(self) -> None:
        design, schema = self.design, self.schema
        self.generated = generate(schema, design, self.output, self.settings, self.title) if schema and design else None
        self.output_changed.emit()
        if self.remember:
            self._save_timer.start()

    # Messages

    def set_message(self, text: str | None, kind: str = "ok") -> None:
        self.message = (text, kind) if text else None
        self.message_changed.emit()

    # Projects, examples and handoffs

    def output_project(self) -> dict:
        return {
            "output": self.output_id,
            "naming": dict(self.namings),
            "strings": self.strings,
            "engine": self.engine,
            "migrations": self.migrations,
        }

    def current_project(self) -> dict | None:
        if not self.has_work():
            return None
        state = {**self.input, "format": self.read["format"] or self.input["format"]}
        return create_project(state, self.designs, self.output_project())

    def project_file(self) -> tuple[str, str] | None:
        """The current project as (text, suggested file name)."""
        project = self.current_project()
        if not project:
            return None
        return json.dumps(project, ensure_ascii=False, indent=2), project_file_name(self.title)

    def read_project_file(self, text: str) -> dict:
        return read_project(text)

    def apply_project(self, project: dict) -> None:
        """Puts a project (a saved file, the copy kept on this computer) in the workspace."""
        output = project["output"]
        self.output_id = find_output(output["output"]).id
        self.namings = dict(output["naming"])
        self.strings = output["strings"]
        self.engine = output["engine"]
        self.migrations = output["migrations"]
        for key, value in (
            ("output", self.output_id),
            ("naming", json.dumps(self.namings)),
            ("strings", self.strings),
            ("engine", self.engine),
            ("migrations", self.migrations),
        ):
            self._settings.setValue(key, value)
        state = input_of_project(project)
        self.input = state
        self.read = read_input(state)
        self._schema_key = json.dumps(self.schema, sort_keys=True) if self.schema else ""
        self.input_changed.emit()
        # The saved designs, fitted to the model the text reads now
        self._reset(designs_for_input(project["designs"], state))

    def load_example(self, example_id: str) -> None:
        example = find_example(example_id)
        if not example:
            return
        # A different model: the decisions made on the previous one do not apply
        self._next_designs = NO_DESIGNS
        self._schema_key = ""
        self.output_id = find_output(example["output"]).id
        self._settings.setValue("output", self.output_id)
        self.set_message(None)
        self.set_input({"text": example["text"], "format": example["format"]})

    def receive(self, text: str) -> bool:
        """A model another tool of the family saved for Model2DB (a model-handoff file). Returns whether it was one."""
        state = received_input(text)
        if not state:
            return False
        self.set_input(state)
        return True

    # Work kept on this computer (opt-in)

    def set_remember(self, remember: bool) -> None:
        self.remember = remember
        self._settings.setValue("remember", remember)
        if remember:
            self._save_workspace()

    def has_saved(self) -> bool:
        return bool(self._settings.value("workspace"))

    def restore_saved(self) -> bool:
        """The work kept on this computer, when the user asked for it."""
        if not self.remember:
            return False
        raw = self._settings.value("workspace")
        read = read_project(raw) if isinstance(raw, str) else None
        if not read or not read["ok"]:
            return False
        self.apply_project(read["project"])
        return True

    def clear_saved(self) -> None:
        self._settings.remove("workspace")
        self.set_remember(False)

    def _save_workspace(self) -> None:
        if not self.remember:
            return
        project = self.current_project()
        if project:
            self._settings.setValue("workspace", json.dumps(project, ensure_ascii=False))
