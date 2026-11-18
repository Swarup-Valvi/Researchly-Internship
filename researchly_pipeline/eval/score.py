"""Score the credibility engine against a hand-labelled set.

    cp eval/labelled.example.csv eval/labelled.csv      # once; labelled.csv is git-ignored (see eval/README.md)
    python eval/score.py [--labels eval/labelled.csv] [--records storage/output/conferences.json]

Each CSV row (conference, url, label legit|risky, label_source, notes) is matched to a pipeline record by website URL.
The backend engine is run OFFLINE (no DBLP/RDAP/OpenAlex lookups) via eval/engine_eval.mjs; "predicted risky" means
risk_level == "High". Prints precision/recall/F1 for the High-risk class and the "Insufficient evidence" rate.

Rows labelled PLACEHOLDER are skipped. Rows with no matching pipeline record are reported separately and are NOT
counted as predictions (we cannot score what we did not scrape); scrape them first.
"""
from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LABELS = {"legit", "risky"}
DEFAULT_LABELS = ROOT / "eval" / "labelled.csv"
EXAMPLE_LABELS = ROOT / "eval" / "labelled.example.csv"


def norm_url(u: str) -> str:
    u = (u or "").strip().lower()
    for p in ("https://", "http://"):
        u = u.removeprefix(p)
    return u.removeprefix("www.").rstrip("/")


def read_labels(path: Path) -> tuple[list[dict], list[str]]:
    rows, problems = [], []
    with path.open(newline="", encoding="utf-8") as f:
        for i, r in enumerate(csv.DictReader(f), start=2):
            label = (r.get("label") or "").strip().lower()
            if label == "placeholder":
                continue
            if label not in LABELS:
                problems.append(f"line {i}: label must be legit or risky, got {r.get('label')!r}")
                continue
            if not (r.get("label_source") or "").strip() or r["label_source"].strip().upper() == "PLACEHOLDER":
                problems.append(f"line {i}: label_source is required (where does this label come from?)")
                continue
            rows.append({**r, "label": label})
    return rows, problems


def metrics(pairs: list[tuple[str, str]]) -> dict:
    """pairs = [(label legit|risky, engine risk_level)]. Positive class = risky / High."""
    tp = sum(1 for y, p in pairs if y == "risky" and p == "High")
    fp = sum(1 for y, p in pairs if y == "legit" and p == "High")
    fn = sum(1 for y, p in pairs if y == "risky" and p != "High")
    prec = tp / (tp + fp) if tp + fp else None
    rec = tp / (tp + fn) if tp + fn else None
    f1 = 2 * prec * rec / (prec + rec) if prec and rec else (0.0 if prec == 0 or rec == 0 else None)
    insuff = sum(1 for _, p in pairs if p == "Insufficient evidence")
    return {"n": len(pairs), "tp": tp, "fp": fp, "fn": fn, "precision": prec, "recall": rec, "f1": f1,
            "insufficient_evidence_rate": insuff / len(pairs) if pairs else None,
            "by_label": {lab: {lvl: sum(1 for y, p in pairs if y == lab and p == lvl)
                               for lvl in sorted({p for _, p in pairs})} for lab in sorted(LABELS)}}


def run_engine(records: list[dict]) -> dict[str, dict]:
    res = subprocess.run(["node", str(Path(__file__).with_name("engine_eval.mjs"))], input=json.dumps(records),
                         capture_output=True, text=True, cwd=ROOT, timeout=120)
    if res.returncode != 0:
        sys.exit(f"engine_eval.mjs failed:\n{res.stderr}")
    return {a["conference_id"]: a for a in json.loads(res.stdout)}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--labels", type=Path, default=DEFAULT_LABELS)
    ap.add_argument("--records", type=Path, default=ROOT / "storage" / "output" / "conferences.json")
    a = ap.parse_args(argv)
    if not a.labels.exists():
        print(f"No labels file at {a.labels}.\nCreate it from the template (it is git-ignored, keep it private):\n"
              f"    cp {EXAMPLE_LABELS.relative_to(ROOT)} {DEFAULT_LABELS.relative_to(ROOT)}\n"
              "then replace the PLACEHOLDER rows with sourced labels (see eval/README.md).")
        return 1
    rows, problems = read_labels(a.labels)
    for p in problems:
        print("SKIPPED", p)
    if not rows:
        print("No labelled rows yet (only placeholders). Fill in eval/labelled.csv, then re-run.")
        return 1
    if not a.records.exists():
        sys.exit(f"No pipeline output at {a.records}. Run the pipeline first (or pass --records).")
    records = json.loads(a.records.read_text())
    by_url = {norm_url(r["website_url"]): r for r in records}
    matched, missing = [], []
    for r in rows:
        rec = by_url.get(norm_url(r["url"]))
        (matched.append((r, rec)) if rec else missing.append(r))
    audits = run_engine([rec for _, rec in matched]) if matched else {}
    pairs = []
    print(f"{'conference':40} {'label':6} {'engine':22} score  coverage")
    for r, rec in matched:
        au = audits[rec["conference_id"]]
        pairs.append((r["label"], au["risk_level"]))
        print(f"{r['conference'][:40]:40} {r['label']:6} {au['risk_level']:22} {str(au['overall_score']):5}  {au['coverage']}")
    for r in missing:
        print(f"{r['conference'][:40]:40} {r['label']:6} NO PIPELINE RECORD for {r['url']} (not scored)")
    m = metrics(pairs)
    fmt = lambda x: "n/a" if x is None else f"{x:.2f}"  # noqa: E731
    print(f"\nScored {m['n']} of {len(rows)} labelled rows ({len(missing)} without a pipeline record).")
    print(f"High-risk class: precision {fmt(m['precision'])}  recall {fmt(m['recall'])}  F1 {fmt(m['f1'])}  "
          f"(TP {m['tp']}, FP {m['fp']}, FN {m['fn']})")
    print(f"Insufficient-evidence rate: {fmt(m['insufficient_evidence_rate'])}")
    print("Risk level by label:", json.dumps(m["by_label"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
