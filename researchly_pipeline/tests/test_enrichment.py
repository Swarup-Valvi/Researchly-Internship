"""Grounded enrichment with a MOCKED LLM (no network). Site fixture is hand-written and fictional."""
import json
import logging
from datetime import datetime, timedelta, timezone

import httpx

import enrichment
from fetcher import Fetcher, FixtureFetcher
from models import RawRecord
from normalizer.records import normalize
from observability import Metrics
from store import Store
from tests.conftest import FIX
from validators.schema_validator import validate_record_redacted

URL = "https://fict2027.example.org/"
LOG = logging.getLogger("t")


def conf(**kw):
    raw = dict(source="ccfddl", source_url="https://github.com/ccfddl/ccf-deadlines/blob/main/conference/AI/fict.yml",
               website_url=URL, name="International Conference on Fictional Computing", acronym="FICT", year=2027,
               dates_text="May 4-6, 2027", location_text="Lisbon, Portugal", deadline_text="2026-12-01 23:59:59 AoE",
               extraction_method="structured")
    raw.update(kw)
    c, err = normalize(RawRecord(**raw))
    assert err is None
    return c


class MockLLM:
    def __init__(self, fields):
        self.fields, self.calls = fields, 0

    def __call__(self, prompt):
        self.calls += 1
        assert "WEBSITE TEXT" in prompt and "Do not use outside knowledge" in prompt
        return json.dumps({"fields": self.fields})


def run(confs, llm, tmp_path, fetcher=None, reviewed=True, **kw):
    store = Store(tmp_path / "s")
    m = Metrics()
    rep = enrichment.enrich_records(confs, fetcher=fetcher or FixtureFetcher(FIX, LOG), store=store, llm=llm, metrics=m,
                                    logger=LOG, model="mock-model-1", reviewed=reviewed, **kw)
    return rep, store, m


REAL = {"field": "publisher", "value": "IEEE", "quote": "Accepted papers will be published by IEEE in the FICT Proceedings series."}


def test_real_quote_accepted_with_per_field_provenance(tmp_path):
    c = conf()
    rep, _, m = run([c], MockLLM([REAL, {"field": "topics", "value": ["machine learning", "computer vision"],
                                         "quote": "Topics include machine learning, computer vision and natural language processing."}]), tmp_path)
    assert c.publisher == "IEEE" and "machine learning" in [t.lower() for t in c.topics]
    e = c.enrichment
    assert e.status == "enriched" and e.hallucination_rejected == 0 and e.model == "mock-model-1"
    f = next(x for x in e.fields if x.field == "publisher")
    assert (f.source_url, f.extraction_method, f.model) == (URL, "llm_grounded", "mock-model-1") and f.extracted_at
    assert f.quote == REAL["quote"]
    assert c.provenance.extraction_method == "structured"            # record-level method unchanged
    assert validate_record_redacted(c.model_dump()) == []


def test_invented_quote_or_unsupported_value_is_rejected_and_counted(tmp_path):
    c = conf()
    rep, _, m = run([c], MockLLM([
        {"field": "publisher", "value": "Springer", "quote": "Proceedings are published by Springer LNCS."},     # not on page
        {"field": "publisher", "value": "Springer", "quote": REAL["quote"]},                                      # value not in quote
        {"field": "sponsors", "value": ["ACM"], "quote": "technically co-sponsored by the IEEE Computer Society"},
        {"field": "submission_deadline", "value": "2026-11-01", "quote": "FICT 2027"},                           # field not allowed
        {"field": "publisher", "value": "Springer", "quote": "Published by Springer"},                            # only in <script>
    ]), tmp_path)
    assert c.publisher is None and c.sponsors.claimed == [] and c.dates.submission_deadline == "2026-12-01T23:59-12:00"
    assert rep.hallucination_rejected == 5 and m.snapshot()["enrichment"]["hallucination_rejected"] == 5
    assert c.enrichment.status == "no_verified_fields" and c.enrichment.fields == []


def test_robots_disallowed_site_is_skipped_without_llm_call(tmp_path):
    def h(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /")
        return httpx.Response(200, text="<p>should never be fetched</p>")
    fetcher = Fetcher({"user_agent": "TestBot/1", "respect_robots": True, "max_retries": 1, "requests_per_minute": 600},
                      LOG, client=httpx.Client(transport=httpx.MockTransport(h)), sleep=lambda s: None)
    c, llm = conf(), MockLLM([REAL])
    rep, _, _ = run([c], llm, tmp_path, fetcher=fetcher)
    assert llm.calls == 0 and c.enrichment.status == "skipped_robots" and c.publisher is None
    assert rep.sites[0]["status"] == "skipped_robots" and "robots" in rep.sites[0]["reason"]


def test_conflict_with_ccfddl_keeps_ccfddl_and_logs_it(tmp_path):
    c = conf(tracks=[{"name": "second round", "deadline_text": "2027-01-10 23:59:59 AoE"}], publisher="ACM")
    rep, _, _ = run([c], MockLLM([REAL, {"field": "tracks", "value": ["Industry track"],
                                         "quote": "FICT 2027: International Conference on Fictional Computing Industry track"}]), tmp_path)
    assert c.publisher == "ACM"                                        # existing value kept
    assert [x.field for x in c.provenance.conflicts] == ["publisher"]
    x = c.provenance.conflicts[0]
    assert (x.kept, x.kept_source, x.discarded, x.discarded_source) == ("ACM", "ccfddl", "IEEE", "llm_grounded")
    assert [t.name for t in c.tracks] == ["second round"]              # invented track quote rejected, ccfddl kept
    assert c.dates.submission_deadline == "2026-12-01T23:59-12:00" and c.location.country == "Portugal"
    assert validate_record_redacted(c.model_dump()) == []


def test_cache_hit_makes_no_llm_call(tmp_path):
    store_dir = tmp_path
    c1, llm1 = conf(), MockLLM([REAL])
    rep1, store, _ = run([c1], llm1, store_dir)
    store.save_state()
    c2, llm2 = conf(), MockLLM([REAL])
    rep2, _, m2 = run([c2], llm2, store_dir)                            # fresh cache entry: no fetch, no LLM
    assert llm1.calls == 1 and llm2.calls == 0
    assert c2.publisher == "IEEE" and c2.enrichment.status == "cached_unchanged"
    later = datetime.now(timezone.utc) + timedelta(days=30)             # stale entry, same content hash: refetch, no LLM
    c3, llm3 = conf(), MockLLM([REAL])
    run([c3], llm3, store_dir, now=later)
    assert llm3.calls == 0 and c3.publisher == "IEEE"


def test_missing_api_key_skips_cleanly_without_fetching(tmp_path):
    class Boom:
        def get(self, *a, **k):
            raise AssertionError("must not fetch without an API key")
    c = conf(publisher=None)
    rep, _, _ = run([c], None, tmp_path, fetcher=Boom())
    assert c.enrichment is None and c.publisher is None
    assert rep.sites == [{"conference": "FICT", "year": 2027, "url": URL, "status": "skipped_no_api_key",
                          "reason": "GEMINI_API_KEY not set; nothing fetched"}]


def test_not_reviewed_and_no_official_site_and_budget(tmp_path):
    c = conf()
    rep, _, _ = run([c], MockLLM([REAL]), tmp_path, reviewed=False)
    assert rep.sites[0]["status"] == "skipped_not_reviewed" and c.enrichment is None
    nosite = conf(website_url=None)                                    # website falls back to the dataset URL
    rep, _, _ = run([nosite], MockLLM([REAL]), tmp_path)
    assert rep.sites[0]["status"] == "skipped_no_official_site"
    a, b = conf(), conf(acronym="FICT2", name="Second Fictional Conference", website_url="https://fict2-2027.example.org/")
    llm = MockLLM([REAL])
    rep, _, _ = run([a, b], llm, tmp_path, max_per_run=1)
    assert llm.calls == 1 and [s["status"] for s in rep.sites] == ["enriched", "skipped_budget"]


def test_indexing_claims_stay_claims_and_email_local_part_is_redacted(tmp_path):
    c = conf()
    run([c], MockLLM([
        {"field": "indexing_claims", "value": ["Scopus", "DBLP"], "quote": "Proceedings will be submitted for indexing in Scopus and DBLP."},
        {"field": "contact_email_domain", "value": "fict2027.example.org", "quote": "Write to program-chairs@fict2027.example.org."},
    ]), tmp_path)
    assert c.indexing_claims.scopus == "claimed" and c.indexing_claims.dblp == "claimed" and c.indexing_claims.wos == "unknown"
    assert "verified" not in c.indexing_claims.model_dump().values()   # claims made by the site, never verified
    assert c.contact_email_domain == "fict2027.example.org"
    q = next(f.quote for f in c.enrichment.fields if f.field == "contact_email_domain")
    assert "program-chairs" not in q and "<redacted>@fict2027.example.org" in q
    assert validate_record_redacted(c.model_dump()) == []


def test_cli_enrich_without_key_reports_every_site_and_writes_nothing_unverified(tmp_path, monkeypatch):
    import run
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("ENABLE_LLM_ENRICHMENT", "true")
    a = run.build_parser().parse_args(["--source", "ccfddl", "--fixtures", str(FIX), "--storage", str(tmp_path / "s"),
                                       "--output", str(tmp_path / "c.json"), "--enrich-limit", "5", "--dry-run"])
    s = run.run_pipeline(a)
    sites = s["enrichment"]["sites"]
    assert len(sites) == 5 and {x["status"] for x in sites} == {"skipped_no_api_key"}
    assert s["enrichment"]["llm_calls"] == 0 and s["schema_invalid"] == 0
