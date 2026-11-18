"""eval/score.py plumbing. Labels here are TEST-ONLY, about the fictional sample records; they are not real labels
and are written to a temp file, never to eval/labelled.csv."""
import importlib.util
import shutil
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("score", ROOT / "eval" / "score.py")
score = importlib.util.module_from_spec(spec)
spec.loader.exec_module(score)


def test_metrics_for_high_risk_class():
    m = score.metrics([("risky", "High"), ("risky", "Medium"), ("legit", "High"), ("legit", "Low"),
                       ("legit", "Insufficient evidence")])
    assert (m["tp"], m["fp"], m["fn"]) == (1, 1, 1)
    assert m["precision"] == 0.5 and m["recall"] == 0.5 and m["f1"] == 0.5
    assert m["insufficient_evidence_rate"] == 0.2


def test_shipped_template_has_only_placeholders():
    rows, problems = score.read_labels(ROOT / "eval" / "labelled.example.csv")
    assert rows == [] and problems == []
    assert score.main(["--labels", str(ROOT / "eval" / "labelled.example.csv")]) == 1


def test_missing_labels_file_tells_user_to_copy_example(tmp_path, capsys):
    assert score.main(["--labels", str(tmp_path / "labelled.csv")]) == 1
    assert "cp eval/labelled.example.csv eval/labelled.csv" in capsys.readouterr().out


def test_rows_need_valid_label_and_source(tmp_path):
    p = tmp_path / "l.csv"
    p.write_text("conference,url,label,label_source,notes\nA,https://a.example/,maybe,src,\nB,https://b.example/,legit,,\n")
    rows, problems = score.read_labels(p)
    assert rows == [] and len(problems) == 2


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_end_to_end_against_fictional_sample(tmp_path, capsys):
    p = tmp_path / "l.csv"
    p.write_text("conference,url,label,label_source,notes\n"
                 "GCIR,https://gcir2027.example.net/,risky,test-only,\n"
                 "IALS,https://ials2027.example.org,legit,test-only,\n"
                 "Missing,https://not-scraped.example.org/,legit,test-only,\n")
    assert score.main(["--labels", str(p), "--records", str(ROOT / "storage/output/conferences.sample.json")]) == 0
    out = capsys.readouterr().out
    assert "Scored 2 of 3" in out and "NO PIPELINE RECORD" in out
    assert "TP 1, FP 0, FN 0" in out
