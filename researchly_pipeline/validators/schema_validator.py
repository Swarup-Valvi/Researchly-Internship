from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "config" / "schema.json"


def load_validator(path: Path = SCHEMA_PATH) -> Draft202012Validator:
    return Draft202012Validator(json.loads(Path(path).read_text()))


def validate_record(record: dict, validator: Draft202012Validator | None = None) -> list[str]:
    """Validate ONE record; returns human-readable errors ([] means valid)."""
    v = validator or load_validator()
    sub = Draft202012Validator({**v.schema, "type": "object", "$ref": "#/$defs/conference"})
    return [f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}" for e in sorted(sub.iter_errors(record), key=str)]


def validate_all(records: list[dict], validator: Draft202012Validator | None = None) -> list[str]:
    v = validator or load_validator()
    return [f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}" for e in sorted(v.iter_errors(records), key=str)]
