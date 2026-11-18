#!/usr/bin/env python3
"""Researchly ingestion CLI.

Examples:
  python run.py --source wikicfp --limit 20 --fixtures tests/fixtures      # offline, no network
  python run.py --source ieee --limit 50                                    # live (needs tos_reviewed: true)
  python run.py --full --dry-run                                            # everything, write nothing
  python run.py --since 2026-11-01                                          # skip pages fetched after this date
"""
from __future__ import annotations

import argparse
import copy
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import yaml

import scrapers
from dedup.matcher import deduplicate
from extractors import llm_assist
from fetcher import Fetcher, FixtureFetcher
from models import Conference
from normalizer.records import normalize
from observability import Metrics, get_logger, log
from store import Store
from validators.schema_validator import load_validator, validate_record_redacted

ROOT = Path(__file__).resolve().parent
ORDER = ["ieee", "acm", "springer", "wikicfp", "individual"]  # individual last: seeded from discovered URLs
KNOWN_HOSTS = ("wikicfp.com", "ieee.org", "acm.org", "springer.com")


def load_config(path: Path) -> dict:
    cfg = yaml.safe_load(Path(path).read_text())
    d = cfg.get("defaults", {})
    cfg["sources"] = {k: {**d, **v} for k, v in cfg["sources"].items()}
    return cfg


def _since_iso(s: str | None) -> str | None:
    if not s:
        return None
    return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc).isoformat(timespec="seconds")


def run_pipeline(args: argparse.Namespace) -> dict:
    logger = get_logger(args.log_level)
    cfg = load_config(Path(args.config))
    store = Store(Path(args.storage))
    metrics = Metrics()
    out_path = Path(args.output)
    names = [n for n in ORDER if n in cfg["sources"] and cfg["sources"][n].get("enabled", True)]
    names += [n for n in cfg["sources"] if n not in names and cfg["sources"][n].get("enabled", True)]  # user-added sources
    if args.source and args.source != ["all"]:
        unknown = [s for s in args.source if s not in scrapers.SCRAPERS]
        if unknown:
            raise SystemExit(f"unknown source(s): {unknown}. Known: {sorted(scrapers.SCRAPERS)}")
        names = [n for n in names if n in args.source]
    llm = llm_assist.gemini_llm() if args.llm else None
    if args.llm and not llm:
        log(logger, logging.WARNING, "--llm requested but GEMINI_API_KEY is not set; LLM assist disabled")

    raw, skipped_sources = [], {}
    discovered: list[str] = []
    for name in names:
        scfg = copy.deepcopy(cfg["sources"][name])
        if not args.fixtures and not scfg.get("tos_reviewed") and not args.allow_unreviewed:
            skipped_sources[name] = "tos_reviewed is false in sources.yaml (review the site's terms + robots.txt, then set it to true)"
            log(logger, logging.WARNING, "source skipped", source=name, reason=skipped_sources[name])
            continue
        fetcher = FixtureFetcher(args.fixtures, logger) if args.fixtures else Fetcher(scfg, logger)
        opts = {"details": args.details}
        if name == "individual":
            opts["urls"] = list(dict.fromkeys(scfg.get("seed_urls", []) + (args.urls or []) + discovered))[: args.limit or 25]
        cls = scrapers.SCRAPERS[name]
        scraper = cls(scfg, fetcher, store, metrics, logger, opts, llm=llm) if name == "individual" else cls(scfg, fetcher, store, metrics, logger, opts)
        recs = scraper.run(limit=args.limit, since=_since_iso(args.since), full=args.full)
        raw.extend(recs)
        for r in recs:
            host = urlparse(r.website_url or "").netloc
            if r.website_url and host and not any(host.endswith(k) for k in KNOWN_HOSTS):
                discovered.append(r.website_url)

    new: list[Conference] = []
    for r in raw:
        conf, reason = normalize(r)
        if conf is None:
            metrics.inc(r.source, "records_failed")
            store.dead_letter(r.source, r.source_url, f"record dropped: {reason}", extra={"record_name": r.name})
            continue
        new.append(conf)

    existing: list[Conference] = []
    for d in store.load_output(out_path):
        try:
            existing.append(Conference.model_validate(d))
        except Exception as exc:  # noqa: BLE001
            # Pydantic's str(exc) quotes input values; log only where/what failed, never the values.
            where = [{"loc": "/".join(map(str, e.get("loc", ()))), "type": e.get("type")} for e in getattr(exc, "errors", lambda: [])()][:5]
            log(logger, logging.WARNING, "existing record unreadable; dropped", error_type=type(exc).__name__, errors=where)
    merged = deduplicate(existing + new)

    validator, final, invalid = load_validator(), [], 0
    for c in merged:
        rec = c.model_dump()
        errs = validate_record_redacted(rec, validator)   # path + error type only: no field VALUES reach storage/failed/
        if errs:
            invalid += 1
            store.dead_letter(c.provenance.primary_source, c.provenance.source_urls[0], "schema validation failed", extra={"errors": errs[:10]})
            continue
        final.append(rec)
    if not args.dry_run:
        store.write_output(out_path, final)
        store.save_state()
    summary = {"sources_run": [n for n in names if n not in skipped_sources], "sources_skipped": skipped_sources,
               "raw_records": len(raw), "new_normalized": len(new), "existing_records": len(existing),
               "output_records": len(final), "schema_invalid": invalid, "dry_run": args.dry_run, "metrics": metrics.snapshot()}
    if not args.dry_run:
        (out_path.parent / "metrics.json").write_text(json.dumps(summary, indent=2))
    log(logger, logging.INFO, "run complete", **{k: v for k, v in summary.items() if k != "metrics"})
    return summary


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--source", nargs="*", help="source name(s) or 'all' (default: all enabled)")
    p.add_argument("--limit", type=int, help="max records per source")
    p.add_argument("--since", help="YYYY-MM-DD: skip pages already fetched on/after this date")
    p.add_argument("--full", action="store_true", help="ignore incremental state (full re-scrape)")
    p.add_argument("--dry-run", action="store_true", help="run everything, write nothing")
    p.add_argument("--fixtures", help="offline mode: serve pages from this directory (see tests/fixtures/index.json)")
    p.add_argument("--allow-unreviewed", action="store_true", help="override the tos_reviewed guard (you take responsibility)")
    p.add_argument("--details", action="store_true", help="wikicfp: fetch each event page for external link + categories")
    p.add_argument("--urls", nargs="*", help="extra seed URLs for the 'individual' source")
    p.add_argument("--llm", action="store_true", help="enable grounded LLM-assisted extraction (needs GEMINI_API_KEY)")
    p.add_argument("--config", default=str(ROOT / "config" / "sources.yaml"))
    p.add_argument("--output", default=str(ROOT / "storage" / "output" / "conferences.json"))
    p.add_argument("--storage", default=str(ROOT / "storage"), help="dir for raw snapshots / failed / state")
    p.add_argument("--log-level", default="INFO")
    return p


def main(argv=None) -> int:
    summary = run_pipeline(build_parser().parse_args(argv))
    print(json.dumps({k: v for k, v in summary.items() if k != "metrics"}, indent=2))
    return 0 if summary["schema_invalid"] == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
