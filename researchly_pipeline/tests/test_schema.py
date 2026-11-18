import copy
import json
from pathlib import Path

from validators.schema_validator import validate_all, validate_record

SAMPLE = Path(__file__).resolve().parent.parent / "storage" / "output" / "conferences.sample.json"


def good():
    return json.loads(SAMPLE.read_text())[0]


def test_sample_output_validates_with_zero_errors():
    assert validate_all(json.loads(SAMPLE.read_text())) == []


def test_missing_required_field_fails():
    r = good(); del r["provenance"]["confidence"]
    assert any("confidence" in e for e in validate_record(r))


def test_unknown_property_and_bad_enum_fail():
    r = good(); r["surprise"] = 1
    assert validate_record(r)
    r = good(); r["indexing_claims"]["scopus"] = "yes"
    assert validate_record(r)


def test_bad_date_and_bad_confidence_fail():
    r = good(); r["dates"]["submission_deadline"] = "Jan 20 2027"
    assert validate_record(r)
    r = copy.deepcopy(good()); r["provenance"]["confidence"] = 1.5
    assert validate_record(r)
