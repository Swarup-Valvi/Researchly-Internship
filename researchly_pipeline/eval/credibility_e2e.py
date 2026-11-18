"""End-to-end credibility eval on N real conferences (LIVE network; run it yourself, deliberately).

  ccfddl (one shallow clone) -> pick N distinct series with an official site -> grounded enrichment (own site +
  linked proceedings page, optional search discovery) -> live lookups (DBLP SPARQL, RDAP, OpenAlex) -> JSON.
Then score with the real engine:  node backend/scripts/credibility_eval.mjs <out.json>

    python eval/credibility_e2e.py --n 20 --out /tmp/e2e.json [--discovery] [--allow-unreviewed-lookups]

Guards: enrichment and lookups respect their `tos_reviewed` flags in sources.yaml; --allow-unreviewed-lookups is a
one-off override for this run only (it does not change the file). Needs GEMINI_API_KEY for enrichment.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import enrichment  # noqa: E402
import lookups  # noqa: E402
import yaml  # noqa: E402
from extractors import llm_assist  # noqa: E402
from fetcher import Fetcher  # noqa: E402
from normalizer.records import normalize  # noqa: E402
from observability import Metrics, get_logger  # noqa: E402
from scrapers.ccfddl import CCFDDLScraper  # noqa: E402
from store import Store  # noqa: E402


def pick(records, n):
    """One record per series (latest year with an official site), spread evenly over the alphabetical area list."""
    best = {}
    for r in records:
        if r.website_url and "github.com" not in r.website_url:
            k = r.raw_snapshot_ref.split(":", 1)[1] + "|" + (r.acronym or "")
            if k not in best or r.year > best[k].year:
                best[k] = r
    keys = sorted(best)
    step = max(1, len(keys) // n)
    return [best[k] for k in keys[::step]][:n]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--out", required=True)
    ap.add_argument("--storage", default=None, help="state/snapshots dir (default: next to --out)")
    ap.add_argument("--discovery", action="store_true", help="also run Gemini Google-Search discovery (candidate URLs only)")
    ap.add_argument("--allow-unreviewed-lookups", action="store_true")
    a = ap.parse_args(argv)
    cfg = yaml.safe_load((ROOT / "config" / "sources.yaml").read_text())
    logger, metrics = get_logger("INFO"), Metrics()
    store = Store(Path(a.storage or Path(a.out).parent / "e2e_storage"))

    scfg = {**cfg["defaults"], **cfg["sources"]["ccfddl"]}
    s = CCFDDLScraper(scfg, Fetcher(scfg, logger), store, metrics, logger, {})
    raw = s.run(full=True)
    confs = [c for c, _ in (normalize(r) for r in pick(raw, a.n)) if c]
    logging.getLogger().info("picked %d conferences", len(confs))

    ecfg = {**cfg["defaults"], **cfg.get("enrichment", {})}
    rep = enrichment.enrich_records(confs, fetcher=Fetcher(ecfg, logger), store=store, llm=llm_assist.gemini_llm(),
                                    metrics=metrics, logger=logger, max_per_run=a.n, reviewed=bool(ecfg.get("tos_reviewed")),
                                    discover=llm_assist.gemini_search_discovery() if a.discovery else None)
    lcfg = {**cfg["defaults"], **cfg.get("lookups", {})}
    if lcfg.get("tos_reviewed") or a.allow_unreviewed_lookups:
        lrep = lookups.run_lookups(confs, fetcher=Fetcher(lcfg, logger), store=store, metrics=metrics, logger=logger)
    else:
        lrep = {"skipped": "lookups tos_reviewed is false"}
    store.save_state()
    Path(a.out).write_text(json.dumps({"records": [c.model_dump() for c in confs], "enrichment_sites": rep.sites,
                                       "lookups": lrep, "metrics": metrics.snapshot()}, indent=1, default=str))
    print(json.dumps({"records": len(confs), "llm_calls": rep.llm_calls, "rejected": rep.hallucination_rejected,
                      "lookups": lrep}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
