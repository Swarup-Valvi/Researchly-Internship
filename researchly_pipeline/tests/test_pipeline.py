import json
from pathlib import Path

import run
from tests.conftest import FIX


def args(tmp, *extra):
    return run.build_parser().parse_args(["--fixtures", str(FIX), "--storage", str(tmp / "s"), "--output", str(tmp / "out" / "c.json"),
                                          "--urls", "https://gcir2027.example.net/", "https://broken.example.org/", *extra])


def test_cli_wikicfp_limit_20_writes_schema_valid_json(tmp_path):
    a = run.build_parser().parse_args(["--source", "wikicfp", "--limit", "20", "--fixtures", str(FIX), "--storage", str(tmp_path / "s"),
                                       "--output", str(tmp_path / "c.json")])
    s = run.run_pipeline(a)
    assert s["schema_invalid"] == 0 and s["output_records"] == 4
    data = json.loads((tmp_path / "c.json").read_text())
    for r in data:
        assert r["conference_id"] and r["provenance"]["source_urls"] and r["provenance"]["scraped_at"] and 0 <= r["provenance"]["confidence"] <= 1


def test_rerun_is_idempotent_and_duplicates_are_merged(tmp_path):
    run.run_pipeline(args(tmp_path))
    first = json.loads((tmp_path / "out" / "c.json").read_text())
    run.run_pipeline(args(tmp_path, "--full"))
    second = json.loads((tmp_path / "out" / "c.json").read_text())
    assert [r["conference_id"] for r in first] == [r["conference_id"] for r in second]
    keys = [(r["canonical_name"], r["year"]) for r in second]
    assert len(keys) == len(set(keys))                                         # no duplicate conference-year
    legacy = [r for r in second if r["provenance"]["primary_source"] != "ccfddl"]
    assert len(legacy) == 6                                                    # 11 raw page records -> 6 distinct
    assert len(second) - len(legacy) == 9                                      # + 9 ccfddl conference-years (fixture)
    icals = next(r for r in second if "Applied Learning" in r["canonical_name"])
    assert icals["dedup"]["canonical_source"] == "ieee" and len(icals["dedup"]["merged_from"]) == 3


def test_bad_pages_go_to_dead_letter_and_never_crash(tmp_path):
    s = run.run_pipeline(args(tmp_path))
    reasons = [json.loads(p.read_text())["reason"] for p in (tmp_path / "s" / "failed").glob("*.json")]
    assert any("no records parsed" in r for r in reasons) and any("missing year" in r for r in reasons)
    assert s["metrics"]["individual"]["pages_failed"] >= 1


def test_dry_run_writes_nothing(tmp_path):
    run.run_pipeline(args(tmp_path, "--dry-run"))
    assert not (tmp_path / "out" / "c.json").exists()


def test_live_run_refuses_unreviewed_sources(tmp_path):
    a = run.build_parser().parse_args(["--source", "wikicfp", "--storage", str(tmp_path / "s"), "--output", str(tmp_path / "c.json"), "--dry-run"])
    s = run.run_pipeline(a)
    assert "wikicfp" in s["sources_skipped"] and s["sources_run"] == []


def test_incremental_since_skips_recently_fetched(tmp_path):
    run.run_pipeline(args(tmp_path))
    s = run.run_pipeline(args(tmp_path, "--since", "2000-01-01"))   # everything fetched after cutoff? no: fetched_at >= since -> skipped
    assert s["metrics"]["wikicfp"]["pages_fetched"] == 0 and s["metrics"]["wikicfp"]["pages_unchanged"] >= 1


def test_bad_committee_entry_never_appears_in_failed_record_json(tmp_path, caplog):
    # A previously written output record whose committee entry violates the schema (contact data in the name,
    # name over maxLength). Re-running re-validates it -> dead letter. Only path + error type may be written.
    sample = json.loads((Path(run.__file__).parent / "storage/output/conferences.sample.json").read_text())[0]
    leaky_name = "Leaky Person leak@example.org"
    long_aff = "Secret Affiliation " + "x" * 300
    sample["committee"] = [{"name": leaky_name, "affiliation": long_aff}]
    out = tmp_path / "out" / "c.json"
    out.parent.mkdir(parents=True)
    out.write_text(json.dumps([sample]))
    s = run.run_pipeline(args(tmp_path))
    assert s["schema_invalid"] >= 1
    failed = [json.loads(p.read_text()) for p in (tmp_path / "s" / "failed").glob("*.json")]
    schema_fail = [f for f in failed if f["reason"] == "schema validation failed"]
    assert schema_fail, "the bad record must be dead-lettered"
    errs = [e for f in schema_fail for e in f["errors"]]
    assert {"path": "committee/0/name", "error_type": "not"} in errs
    assert {"path": "committee/0/affiliation", "error_type": "anyOf"} in errs
    blob = " ".join(p.read_text() for p in (tmp_path / "s" / "failed").glob("*.json")) + caplog.text
    for leaked in ("Leaky", "leak@example.org", "Secret Affiliation"):
        assert leaked not in blob
    assert leaky_name not in out.read_text()                     # and the invalid record is not written to output
