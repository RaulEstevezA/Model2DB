"""Every case in shared/test-cases/variants/: an example, the decisions made on its proposal, the settings and the
files every output writes, as the web version writes them (web/src/core/generate/test/variants.test.ts)."""

import json

import pytest

from model2db.core.design.edit import decide
from model2db.core.design.propose import propose_design
from model2db.core.generate.outputs import OUTPUTS, generate
from model2db.core.parsers.registry import parse_input
from model2db.examples import find_example

from .conftest import SHARED_CASES

FILES = sorted((SHARED_CASES / "variants").glob("*.json"))


def files(variant: dict) -> dict:
    example = find_example(variant["example"])
    schema = parse_input(example["text"], example["format"], {"rootName": "Invoice"})["schema"]
    design = propose_design(schema, variant["target"])
    for decision in variant["decisions"]:
        design = (
            decide(design, decision["ref"], decision["value"])
            if "value" in decision
            else decide(design, decision["ref"])
        )
    result = {}
    for output in OUTPUTS:
        if output.target != variant["target"]:
            continue
        if variant["outputs"] == "engine" and variant["settings"]["engine"] not in (output.engines or ()):
            continue
        generated = generate(schema, design, output, variant["settings"], schema.get("root"))
        result[output.id] = [{"name": file["name"], "content": file["content"]} for file in generated["files"]]
    return result


@pytest.mark.parametrize("path", FILES, ids=lambda path: path.stem)
def test_variants(path):
    variant = json.loads(path.read_text(encoding="utf-8"))
    written = files(variant)
    assert sorted(written) == sorted(variant["files"])
    for output_id, expected in variant["files"].items():
        assert written[output_id] == expected, output_id
