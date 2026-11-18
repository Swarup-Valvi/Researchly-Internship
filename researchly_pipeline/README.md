# researchly_pipeline

Data-aggregation layer for Researchly.io: scrapes CFP / conference metadata from IEEE, ACM, Springer,
WikiCFP and individual conference sites, normalizes it to one schema, de-duplicates across sources, and writes
**provenance-tracked, schema-validated** `conferences.json`. Nothing is ever invented: a field that cannot be
extracted is `null`, and a record with no extractable name/year goes to the dead-letter folder.

> **Honest status.** All parser tests run against hand-written HTML fixtures (`tests/fixtures/`, fictional
> conferences) because the dev sandbox cannot reach these sites. The CSS selectors in `config/sources.yaml` are
> *starting points* modelled on each site's public structure — **validate them on real saved pages and patch the
> YAML before trusting live output.** JSON-LD parsing is standards-based and more robust than selectors.

## Setup
```bash
cd researchly_pipeline
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# optional, only for JS-rendered pages: pip install playwright && playwright install chromium
python -m pytest            # 41 tests, no network needed
```

## Run
```bash
# Offline demo against saved fixtures (no network):
python run.py --source wikicfp --limit 20 --fixtures tests/fixtures --output storage/output/demo.json
python run.py --fixtures tests/fixtures --urls https://gcir2027.example.net/ --full     # all sources

# Live (see "Compliance guard" first):
python run.py --source ieee acm --limit 50
python run.py --since 2026-11-01          # skip pages already fetched on/after this date
python run.py --dry-run                   # run everything, write nothing
python run.py --details --source wikicfp  # also fetch each WikiCFP event page (extra requests)
python run.py --llm                       # grounded LLM assist for gaps (needs GEMINI_API_KEY)
python scheduler.py --interval-hours 12   # APScheduler loop
```
Exit code is `2` if any output record fails schema validation (invalid records are never written).

### Compliance guard
Live crawling of a source is **refused** unless `tos_reviewed: true` for it in `sources.yaml`. Read that site's
Terms of Service and `robots.txt`, then flip the flag yourself. The pipeline also: honours `robots.txt` (skips are
logged), rate-limits per domain (token bucket), identifies itself via `user_agent` (**put your real contact email
in `sources.yaml`**), never touches login-gated/paywalled content, and stores no personal data (CFP metadata only).
Raw snapshots keep a `.meta.json` with URL + copyright note and are for audit only — do not redistribute them.

## Output (per record)
See `config/schema.json`. Key guarantees: `conference_id` = sha256(canonical_name + year + primary_source_url);
`provenance.source_urls`, `scraped_at`, `extraction_method`, `confidence`; `raw_snapshot_ref` → gzipped HTML in
`storage/raw/`. `indexing_claims` are only ever `claimed` (from the site's own text) or `unknown` — **never
`verified` here**; verification is the credibility engine's job. WikiCFP never supplies sponsor/indexing claims.
`sponsors.verified_source` is set only when IEEE/ACM/Springer's *own* page lists the event.

`confidence = 0.40·source_trust + 0.40·completeness + 0.20·method_weight (+≤0.10 corroboration)`;
trust: ieee 1.0, acm 1.0, springer 0.9, individual 0.7, wikicfp 0.4; method: structured 1.0, heuristic 0.7, llm 0.5.

## Dedup
Same year only (never merged across years), no conflicting country, and either `rapidfuzz` token-sort ratio ≥ 90 on
normalized names, or identical acronym plus similar wording / acronym spelling the full name (the acronym rule
guards against collisions). Merge precedence: IEEE > ACM > Springer > individual > WikiCFP; list fields are unioned.
Re-runs are idempotent: existing output is re-merged with new records.

## Add a new source (no core changes)
1. `config/sources.yaml`: add an entry (`seed_urls`, `trust`, `selectors`, `tos_reviewed: false`).
2. `scrapers/mysource.py`:
   ```python
   from scrapers.base import BaseScraper, register
   @register
   class MySource(BaseScraper):
       name = "mysource"
       def parse(self, html, url): ...   # return list[RawRecord]
   ```
   (Publisher listings can subclass `scrapers.listing.ListingScraper` and only set `name` + `publisher_name`.)
3. Add `"mysource"` to `models.Source`, `SOURCE_PRECEDENCE`, `confidence.SOURCE_TRUST`, `config/schema.json`'s
   `source` enum (these four lists are the one place the vocabulary lives).
4. Save a real page into `tests/fixtures/`, register it in `index.json`, add a parse test.

## Patch selectors when a site changes
Symptom: `no records parsed (possible selector drift)` in `storage/failed/`. Open the saved snapshot
(`storage/raw/<source>/*.html.gz`, path in the failed JSON), find the new markup, edit the selector in
`sources.yaml` only, re-run. Add the page as a fixture so it never regresses.

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| `sources_skipped: tos_reviewed is false` | Review the site's terms, then set `tos_reviewed: true` |
| `skipped by robots.txt` in logs | Path is disallowed; don't override — use another source |
| `gave up after 3 attempts` | Rate limit/outage. Lower `requests_per_minute`, retry later |
| `record dropped: missing year` | Intended: the year is never guessed. Fix the selector or the source page |
| Nothing new on re-run | Incremental state (`storage/state.json`); use `--full` to ignore |
| 0 records from a JS-heavy page | Content is client-rendered; use the site's JSON-LD/API or add a Playwright fetch |
| Output mixes sample + real data | Sample is `conferences.sample.json` (fictional); live output is `conferences.json` |
