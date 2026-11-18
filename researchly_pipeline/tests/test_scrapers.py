from tests.conftest import make_scraper
from scrapers.acm import ACMScraper
from scrapers.ieee import IEEEScraper
from scrapers.individual import IndividualScraper
from scrapers.springer import SpringerScraper
from scrapers.wikicfp import WikiCFPScraper


def test_wikicfp_parses_two_row_records_and_leaves_claims_empty(env, fx):
    recs = make_scraper(WikiCFPScraper, env).parse(fx("wikicfp_list.html"), "http://www.wikicfp.com/cfp/call?conference=computer%20science")
    assert [r.acronym for r in recs] == ["ICALS", "SECDA", "GCIR", None]
    first = recs[0]
    assert first.name == "International Conference on Applied Learning Systems"
    assert first.year == 2027 and first.location_text == "Lisbon, Portugal"
    assert first.deadline_text.startswith("Jan 20, 2027")
    assert all(r.indexing_text is None and not r.sponsors_text and not r.sponsor_listed_by_publisher for r in recs)  # lowest trust


def test_wikicfp_detail_page_gives_external_link_and_categories(fx):
    d = WikiCFPScraper.parse_detail(fx("wikicfp_detail.html"), "x")
    assert d["link"] == "https://gcir2027.example.net/"
    assert d["categories"] == ["machine learning", "nlp"]


def test_wikicfp_follows_next_page_and_respects_limit(env):
    s = make_scraper(WikiCFPScraper, env)
    assert {r.acronym for r in s.run()} >= {"ICALS", "VISIO"}      # page 2 was followed
    assert len(make_scraper(WikiCFPScraper, env).run(limit=2, full=True)) == 2


def test_ieee_jsonld_is_structured_and_listed_by_publisher(env, fx):
    [r] = make_scraper(IEEEScraper, env).parse(fx("ieee_jsonld.html"), "https://www.ieee.org/conferences/")
    assert r.extraction_method == "structured" and r.publisher == "IEEE" and r.sponsor_listed_by_publisher
    assert r.year == 2027 and r.venue == "Centro de Congressos" and r.location_text == "Lisbon, Portugal"


def test_acm_selectors(env, fx):
    recs = make_scraper(ACMScraper, env).parse(fx("acm_listing.html"), "https://www.acm.org/conferences")
    assert len(recs) == 2 and recs[0].sponsors_text == ["ACM SIGSAC"] and recs[0].year == 2027
    assert recs[0].website_url == "https://secda2027.example.org/"


def test_springer_selectors(env, fx):
    [r] = make_scraper(SpringerScraper, env).parse(fx("springer_listing.html"), "https://link.springer.com/conference/")
    assert r.year == 2026 and r.location_text == "Vienna, Austria" and r.deadline_text is None


def test_individual_jsonld_plus_important_dates(env, fx):
    [r] = make_scraper(IndividualScraper, env).parse(fx("individual_jsonld.html"), "https://ials2027.example.org/")
    assert r.extraction_method == "structured"
    assert r.deadline_text.startswith("January 20, 2027") and r.notification_text == "March 10, 2027"
    assert "Scopus" in r.indexing_text            # raw claim text preserved
    assert any("IEEE Computer Society" in s for s in r.sponsors_text)


def test_individual_heuristic_keeps_red_flag_text_raw(env, fx):
    [r] = make_scraper(IndividualScraper, env).parse(fx("individual_heuristic.html"), "https://gcir2027.example.net/")
    assert r.extraction_method == "heuristic" and r.year == 2027
    assert "Guaranteed acceptance" in r.indexing_text or "Scopus" in r.indexing_text
    assert r.deadline_text == "Sep 1, 2027"
    assert r.location_text is None                 # not stated on the page -> null, never invented


def test_individual_collects_raw_claim_snippets_including_red_flags(env, fx):
    [r] = make_scraper(IndividualScraper, env).parse(fx("individual_heuristic.html"), "https://gcir2027.example.net/")
    joined = " ".join(r.claim_snippets)
    assert "Guaranteed acceptance within 48 hours" in joined and "Scopus" in joined and "mandatory" in joined
