"""Every output for every built-in example against shared/test-cases/outputs/: the files the web version writes
for them with the proposed design (web/src/core/generate/test/generate.test.ts writes the same files)."""

import pytest

from model2db.core.design.propose import propose_design
from model2db.core.generate.outputs import OUTPUTS, generate
from model2db.core.parsers.registry import parse_input
from model2db.examples import EXAMPLES

from .conftest import SHARED_CASES

SETTINGS = {
    "naming": {"tables": "plural", "columns": "snake"},
    "strings": "auto",
    "engine": "postgresql",
    "migrations": True,
}
FOLDER = SHARED_CASES / "outputs"


def expected_files(output_id: str, example_id: str) -> dict[str, str]:
    """The files of an example: `<example>.<extension>` when the output writes one, `<example>/…` otherwise."""
    root = FOLDER / output_id
    single = [path for path in root.glob(f"{example_id}.*") if path.is_file()]
    if single:
        return {"": single[0].read_text(encoding="utf-8")}
    folder = root / example_id
    return {
        path.relative_to(folder).as_posix(): path.read_text(encoding="utf-8")
        for path in folder.rglob("*")
        if path.is_file()
    }


def test_every_output_has_cases():
    assert {path.name for path in FOLDER.iterdir() if path.is_dir()} >= {output.id for output in OUTPUTS}


@pytest.mark.parametrize("output", OUTPUTS, ids=lambda output: output.id)
@pytest.mark.parametrize("example", EXAMPLES, ids=lambda example: example["id"])
def test_outputs(example, output):
    outcome = parse_input(example["text"], example["format"], {"rootName": "Invoice"})
    assert outcome["ok"]
    schema = outcome["schema"]
    generated = generate(schema, propose_design(schema, output.target), output, SETTINGS, schema.get("root"))
    files = generated["files"]
    expected = expected_files(output.id, example["id"])
    if len(files) == 1:
        assert list(expected) == [""], f"{output.id} writes one file for {example['id']}"
        assert files[0]["content"] == expected[""]
    else:
        assert sorted(file["name"] for file in files) == sorted(expected)
        for file in files:
            assert file["content"] == expected[file["name"]], file["name"]
