"""Evidence gathering: risk-phrase patterns, the extended quote gate, multi-page enrichment, live lookups.
All network is mocked (httpx.MockTransport). Page texts are hand-written and fictional."""
import json
import logging
from urllib.parse import parse_qs, urlparse

import httpx

import enrichment
import lookups
from extractors import risk_phrases
from fetcher import Fetcher
from models import RawRecord
from normalizer.records import normalize
from observability import Metrics
from store import Store
from validators.schema_validator import validate_record_redacted

LOG = logging.getLogger("t")
SITE = "https://fict2027.example.org/"


def fetcher_for(routes, robots="User-agent: *\nAllow: /"):
    calls = []

    def h(req):
        calls.append(str(req.url))
        if req.url.path == "/robots.txt":
            return httpx.Response(200, text=robots)
        key = f"{req.url.scheme}://{req.url.host}{req.url.path}"
        body = routes.get(key)
        if body is None:
            return httpx.Response(404, text="nope")
        if callable(body):
            return body(req)
        return httpx.Response(200, text=body)
    f = Fetcher({"user_agent": "TestBot/1", "respect_robots": True, "max_retries": 1, "requests_per_minute": 6000},
                LOG, client=httpx.Client(transport=httpx.MockTransport(h)), sleep=lambda s: None)
    return f, calls


def conf(**kw):
    raw = dict(source="ccfddl", source_url="https://github.com/ccfddl/ccf-deadlines/blob/main/conference/AI/fict.yml",
               website_url=SITE, name="International Conference on Fictional Computing", acronym="FICT", year=2027,
               extraction_method="structured", dblp_key="fict", series_years=[2019, 2021, 2023, 2025, 2027])
    raw.update(kw)
    c, err = normalize(RawRecord(**raw))
    assert err is None
    return c


# --- risk phrase patterns -------------------------------------------------------------------------------------------

def test_risk_patterns_hit_predatory_wording():
    hits = dict(risk_phrases.scan(
        "Welcome. We guarantee acceptance of all quality papers. Papers are published within 7 days of payment. "
        "Review decision within 48 hours. Your paper is accepted upon payment of the fee. "
        "Technical Program Committee: To be announced."))
    assert set(hits) == set(risk_phrases.CATEGORIES)
    assert "guarantee acceptance" in hits["guaranteed_acceptance"]


def test_risk_patterns_ignore_normal_wording():
    normal = ("At least one author of each accepted paper must register. Authors have 48 hours to respond to reviews "
              "during the rebuttal period. Registration fee: USD 450. All submissions undergo double-blind peer review. "
              "Notification within 8 weeks. Reviews are due within 30 days.")
    assert risk_phrases.scan(normal) == []


def test_fast_review_needs_a_short_period():
    assert risk_phrases.confirms("fast_review", "decision within 3 days")
    assert not risk_phrases.confirms("fast_review", "decision within 21 days")
    assert risk_phrases.confirms("fast_review", "fast-track review available")


# --- quote gate -----------------------------------------------------------------------------------------------------

PAGES = [(SITE, enrichment.norm("Organised by the Fictional Computing Society. All papers undergo double-blind peer review "
                                "by at least three reviewers. Registration fee: EUR 400.")),
         ("https://pub.example.org/proc", enrichment.norm("FICT 2027 proceedings will appear in Fictional Lecture Notes."))]


def gate(item):
    return enrichment.check_item(item, PAGES)


def test_gate_records_which_page_a_quote_came_from():
    (f, v, q, url), _ = gate({"field": "proceedings_series", "value": "Fictional Lecture Notes",
                              "quote": "FICT 2027 proceedings will appear in Fictional Lecture Notes."})
    assert url == "https://pub.example.org/proc"


def test_gate_rejects_quote_spanning_two_pages():
    r, why = gate({"field": "publisher", "value": "Fictional", "quote": "EUR 400. FICT 2027 proceedings"})
    assert r is None and why == "quote not found on any fetched page"


def test_gate_peer_review_and_organizer():
    (f, v, _, _), _ = gate({"field": "peer_review_statement", "value": "All papers undergo double-blind peer review",
                            "quote": "All papers undergo double-blind peer review by at least three reviewers."})
    assert f == "peer_review_statement"
    r, why = gate({"field": "peer_review_statement", "value": "Registration fee: EUR 400", "quote": "Registration fee: EUR 400."})
    assert r is None and why == "statement does not describe reviewing"
    (f, v, _, _), _ = gate({"field": "organizer", "value": "Fictional Computing Society",
                            "quote": "Organised by the Fictional Computing Society."})
    assert v == "Fictional Computing Society"


def test_gate_risk_category_must_be_confirmed_by_code():
    r, why = gate({"field": "risk_phrases", "value": "guaranteed_acceptance",
                   "quote": "All papers undergo double-blind peer review by at least three reviewers."})   # mislabelled
    assert r is None and why == "risk category not confirmed by code patterns"
    r, why = gate({"field": "risk_phrases", "value": "made_up_category", "quote": "Registration fee: EUR 400."})
    assert r is None and why == "unknown risk category"


def test_rejections_are_recorded_with_reason():
    resp = json.dumps({"fields": [{"field": "publisher", "value": "Springer", "quote": "Published by Springer LNCS."},
                                  {"field": "organizer", "value": "Fictional Computing Society",
                                   "quote": "Organised by the Fictional Computing Society."}]})
    kept, n, rej = enrichment.verify_response(resp, [(u, t) for u, t in PAGES])
    assert [k[0] for k in kept] == ["organizer"] and n == 1
    assert rej[0].field == "publisher" and rej[0].reason == "quote not found on any fetched page"


# --- multi-page enrichment ------------------------------------------------------------------------------------------

HOME = """<html><body><h1>FICT 2027</h1>
<p>Organised by the Fictional Computing Society.</p>
<p>We guarantee acceptance for all registered papers.</p>
<a href="/proceedings.html">Conference Proceedings</a></body></html>"""
PROC = "<html><body><p>The FICT 2027 proceedings are published in Fictional Lecture Notes.</p></body></html>"


class LLM:
    def __init__(self, fields):
        self.fields, self.prompts = fields, []

    def __call__(self, prompt):
        self.prompts.append(prompt)
        return json.dumps({"fields": self.fields})


def enrich(c, llm, fetcher, tmp_path, **kw):
    return enrichment.enrich_records([c], fetcher=fetcher, store=Store(tmp_path / "s"), llm=llm, metrics=Metrics(),
                                     logger=LOG, model="mock", reviewed=True, **kw)


def test_proceedings_page_is_fetched_and_scanned(tmp_path):
    f, calls = fetcher_for({SITE: HOME, "https://fict2027.example.org/proceedings.html": PROC})
    c = conf()
    llm = LLM([{"field": "proceedings_series", "value": "Fictional Lecture Notes",
                "quote": "The FICT 2027 proceedings are published in Fictional Lecture Notes."},
               {"field": "organizer", "value": "Fictional Computing Society", "quote": "Organised by the Fictional Computing Society."}])
    enrich(c, llm, f, tmp_path)
    assert "=== PAGE 2: https://fict2027.example.org/proceedings.html ===" in llm.prompts[0]
    assert c.enrichment.pages_read == [SITE, "https://fict2027.example.org/proceedings.html"]
    ps = next(x for x in c.enrichment.fields if x.field == "proceedings_series")
    assert ps.source_url.endswith("/proceedings.html") and c.organizer == "Fictional Computing Society"
    [rp] = c.risk_phrases                                       # found by the code scan, no LLM involvement
    assert (rp.category, rp.method, rp.source_url) == ("guaranteed_acceptance", "pattern", SITE)
    assert "guarantee acceptance" in rp.quote
    assert validate_record_redacted(c.model_dump()) == []


def test_discovered_urls_are_only_candidates(tmp_path):
    f, calls = fetcher_for({SITE: "<p>FICT 2027 home</p>",
                            "https://other.example.net/a": "<p>A page about something else entirely.</p>",
                            "https://pub.example.org/fict": "<p>FICT 2027 proceedings, ISBN 000.</p>"},)
    c = conf()
    enrich(c, LLM([{"field": "publisher", "value": "Invented Press", "quote": "Invented Press publishes FICT"}]), f, tmp_path,
           discover=lambda conf_: ["https://other.example.net/a", "https://pub.example.org/fict", "https://x.example/3"])
    assert c.enrichment.pages_read == [SITE, "https://pub.example.org/fict"]   # off-topic page dropped, max 2 tried
    assert c.publisher is None and c.enrichment.rejected[0].reason == "quote not found on any fetched page"


def test_llm_risk_phrase_kept_only_when_code_confirms(tmp_path):
    f, _ = fetcher_for({SITE: "<p>FICT 2027. Decision within 2 days of submission. Double-blind peer review.</p>"})
    c = conf()
    enrich(c, LLM([{"field": "risk_phrases", "value": "fast_review", "quote": "Decision within 2 days of submission."},
                   {"field": "risk_phrases", "value": "guaranteed_acceptance", "quote": "Double-blind peer review."}]), f, tmp_path)
    cats = {(r.category, r.method) for r in c.risk_phrases}
    assert ("fast_review", "pattern") in cats and ("guaranteed_acceptance", "llm_grounded") not in cats
    assert c.enrichment.hallucination_rejected == 1


# --- lookups --------------------------------------------------------------------------------------------------------

def sparql(req):
    q = parse_qs(urlparse(str(req.url)).query)["query"][0]
    if "conf/fict>" in q:
        b = {"title": {"value": "Fictional Computing (FICT)"}, "years": {"value": "12"}, "first": {"value": "2014"},
             "last": {"value": "2026"}}
    else:
        b = {"years": {"value": "0"}}
    return httpx.Response(200, json={"results": {"bindings": [b]}})


def openalex(req):
    name = parse_qs(urlparse(str(req.url)).query)["search"][0]
    inst = [{"display_name": "Fictional University of Lisbon"}] if name.startswith("Ana") else []
    return httpx.Response(200, json={"results": [{"display_name": name, "last_known_institutions": inst}]})


ROUTES = {"https://sparql.dblp.org/sparql": sparql,
          "https://rdap.org/domain/example.org": lambda r: httpx.Response(200, json={"events": [
              {"eventAction": "registration", "eventDate": "2001-05-01T00:00:00Z"}]}),
          "https://api.openalex.org/authors": openalex}


def test_lookups_dblp_rdap_committee_aggregates_only(tmp_path):
    f, calls = fetcher_for(ROUTES)
    c = conf(committee=[{"name": "Ana Silva", "affiliation": "Fictional University of Lisbon"},
                        {"name": "Bo Chen", "affiliation": "Example Institute of Technology"}])
    rep = lookups.run_lookups([c], fetcher=f, store=Store(tmp_path / "s"), metrics=Metrics(), logger=LOG)
    assert rep["looked_up"] == 1
    d = c.lookups.dblp.data
    assert c.lookups.dblp.ok and d["found"] and d["years_with_publications"] == 12 and d["first_year"] == 2014
    assert c.lookups.rdap.ok and c.lookups.rdap.data["domain"] == "example.org" and c.lookups.rdap.data["age_days"] > 3650
    cm = c.lookups.committee.data
    assert (cm["looked_up"], cm["resolved"], cm["with_stated_affiliation"], cm["institution_matches"]) == (2, 2, 2, 1)
    assert "Ana" not in json.dumps(c.lookups.model_dump())                     # no names in the stored result
    assert validate_record_redacted(c.model_dump()) == []


def test_lookups_are_reused_until_inputs_change(tmp_path):
    f, calls = fetcher_for(ROUTES)
    st = Store(tmp_path / "s")
    c = conf()
    lookups.run_lookups([c], fetcher=f, store=st, metrics=Metrics(), logger=LOG)
    n = len(calls)
    rep = lookups.run_lookups([c], fetcher=f, store=st, metrics=Metrics(), logger=LOG)
    assert rep == {"looked_up": 0, "reused": 1, "skipped_budget": 0} and len(calls) == n
    c.dblp_key = "other"                                                       # changed input -> looked up again
    lookups.run_lookups([c], fetcher=f, store=st, metrics=Metrics(), logger=LOG)
    assert len(calls) > n and c.lookups.dblp.data["found"] is False


def test_unknown_venue_and_robots_disallow_are_not_errors(tmp_path):
    f, _ = fetcher_for(ROUTES, robots="User-agent: *\nDisallow: /")
    c = conf()
    lookups.run_lookups([c], fetcher=f, store=Store(tmp_path / "s"), metrics=Metrics(), logger=LOG)
    assert c.lookups.dblp.ok is False and c.lookups.dblp.error == "disallowed by robots.txt"
    assert c.lookups.committee.error == "no committee listed"


def test_series_years_come_from_the_dataset(env):
    from scrapers.ccfddl import CCFDDLScraper
    from tests.conftest import FIX, make_scraper
    recs = make_scraper(CCFDDLScraper, env, options={"ccfddl_path": str(FIX / "ccfddl"), "min_year": 2025}).run()
    aaai = next(r for r in recs if r.acronym == "AAAI" and r.year == 2027)
    assert 2024 in aaai.series_years and aaai.series_years == sorted(set(aaai.series_years))   # includes years < min_year
