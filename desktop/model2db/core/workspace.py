"""Workspace logic that the interface uses, kept out of the widgets so it can be tested. Mirrors
web/src/app/workspace.ts, web/src/app/handoff.ts and web/src/app/project.ts.

An input is a dictionary with `text`, `format` (None: detected from the text) and optionally `fileName` (the file
it was opened from, for detection) and `receivedFrom` (the tool that sent it)."""

from .design.analysis import analyze, is_top_level
from .design.edit import reconcile
from .interop.handoff import read_handoff, schema_text
from .js import trim
from .model.schema import all_fields
from .parsers.registry import detect_format, find_parser, parse_input

EMPTY_INPUT = {"text": "", "format": None}
TOOL_NAMES = {"api2class": "Api2Class", "mapper": "Mapper", "model2db": "Model2DB", "datacleanr": "DataCleanr"}


def read_input(state: dict) -> dict:
    """Parses the input with its chosen or detected format. A schema without models is not a model."""
    if trim(state["text"]) == "":
        return {"format": state["format"], "outcome": None}
    format_id = state["format"] or detect_format(state["text"], state.get("fileName"))
    if not format_id:
        return {"format": None, "outcome": None}
    outcome = parse_input(state["text"], format_id, {"rootName": "Root"})
    if outcome["ok"] and not outcome["schema"]["models"]:
        return {"format": format_id, "outcome": {"ok": False, "error": {"code": "noModels"}}}
    return {"format": format_id, "outcome": outcome}


def pending_decisions(design: dict, roles: dict[str, str]) -> list[dict]:
    """Decisions waiting for the user that matter for what is stored: the keys of stored models and the fields of
    the models whose fields reach the result. Each item has `ref` and `decision`."""
    items = []
    for model in design["models"]:
        role = roles.get(model["model"])
        fields_matter = role == "stored" or (design["target"] == "document" and role == "embedded")
        key = model.get("key")
        if role == "stored" and key and key["status"] == "pending":
            items.append({"ref": {"kind": "key", "model": model["model"]}, "decision": key})
        if not fields_matter:
            continue
        for field in model["fields"]:
            if not field["include"]:
                continue
            for kind in ("relation", "foreignKey", "unique"):
                decision = field.get(kind)
                if decision and decision["status"] == "pending":
                    ref = {"kind": kind, "model": model["model"], "field": field["field"]}
                    items.append({"ref": ref, "decision": decision})
    for item in design["enums"]:
        if item["storage"]["status"] == "pending":
            items.append({"ref": {"kind": "enum", "enum": item["enum"]}, "decision": item["storage"]})
    return items


def can_exclude(schema: dict, model: str) -> bool:
    """Whether the user can leave the model out: only models no other model uses."""
    return is_top_level(analyze(schema), model)


def field_count(schema: dict) -> int:
    """Count of fields in every model, inherited ones included."""
    return sum(len(all_fields(schema, model)) for model in schema["models"])


def input_from_handoff(handoff: dict) -> dict:
    """A model sent by another tool (Mapper's "Open in Model2DB"), as the input: its text when it came with one,
    its model schema otherwise."""
    received_from = TOOL_NAMES.get(handoff["from"], handoff["from"])
    if "text" in handoff:
        parser = find_parser(handoff["text"]["format"])
        return {
            "text": handoff["text"]["content"],
            "format": parser.id if parser else None,
            "receivedFrom": received_from,
        }
    return {"text": schema_text(handoff["schema"]), "format": "modelschema", "receivedFrom": received_from}


def received_input(text: str) -> dict | None:
    """The input of a model-handoff file another tool saved for Model2DB, or None if the text is not one."""
    handoff = read_handoff(text)
    return input_from_handoff(handoff) if handoff else None


def input_of_project(project: dict) -> dict:
    state = {"text": project["input"]["text"], "format": project["input"]["format"]}
    if project["input"].get("fileName"):
        state["fileName"] = project["input"]["fileName"]
    return state


def designs_for_input(designs: dict, state: dict) -> dict:
    """The saved designs fitted to the model the input reads now: what no longer applies is proposed again, as when
    the input is edited."""
    read = read_input(state)
    if not read["outcome"] or not read["outcome"]["ok"]:
        return {"relational": None, "document": None}
    schema = read["outcome"]["schema"]
    return {
        "relational": reconcile(designs["relational"], schema, "relational"),
        "document": reconcile(designs["document"], schema, "document"),
    }
