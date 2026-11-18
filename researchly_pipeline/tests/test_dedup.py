from datetime import datetime, timezone

from dedup.matcher import deduplicate, is_duplicate
from models import RawRecord
from normalizer.records import normalize


def conf(**kw):
    base = dict(source="wikicfp", source_url="http://w/1", name="International Conference on Applied Learning Systems", year=2027,
                location_text="Lisbon, Portugal", extraction_method="structured")
    base.update(kw)
    c, why = normalize(RawRecord(**base))
    assert c, why
    return c


def test_merge_prefers_ieee_and_unions_sources():
    w = conf()
    i = conf(source="ieee", source_url="https://ieee/1", name="IEEE International Conference on Applied Learning Systems",
             publisher="IEEE", deadline_text="Jan 20, 2027", sponsor_listed_by_publisher=True, website_url="https://site.example.org/")
    [m] = deduplicate([w, i])
    assert m.dedup.canonical_source == "ieee" and m.provenance.primary_source == "ieee"
    assert set(m.provenance.source_urls) == {"http://w/1", "https://ieee/1"}
    assert m.dates.submission_deadline == "2027-01-20" and m.website_url == "https://site.example.org/"
    assert m.sponsors.verified_source == "https://ieee/1"


def test_never_merges_across_years():
    a, b = conf(year=2026), conf(year=2027, source_url="http://w/2")
    assert not is_duplicate(a, b) and len(deduplicate([a, b])) == 2


def test_conflicting_country_blocks_merge():
    a = conf(); b = conf(source_url="http://w/2", location_text="Tokyo, Japan")
    assert len(deduplicate([a, b])) == 2


def test_acronym_rule_merges_short_and_full_names():
    a = conf(name="ICALS 2027", acronym="ICALS", source_url="http://w/3")
    b = conf(source="acm", source_url="https://acm/1", name="International Conference on Applied Learning Systems", acronym="ICALS")
    assert len(deduplicate([a, b])) == 1


def test_acronym_collision_with_unrelated_name_does_not_merge():
    a = conf(name="ICALS 2027", acronym="ICALS", source_url="http://w/3")
    b = conf(source="acm", source_url="https://acm/1", name="Symposium on Marine Biology", acronym="ICALS")
    assert len(deduplicate([a, b])) == 2


def test_wikicfp_is_never_authority_for_claims():
    c = conf(indexing_text="Indexed in Scopus", sponsors_text=["IEEE"])
    assert c.indexing_claims.scopus == "unknown" and c.sponsors.verified_source is None


def test_idempotent_ids_on_repeat_merge():
    w, i = conf(), conf(source="ieee", source_url="https://ieee/1", sponsor_listed_by_publisher=True)
    once = deduplicate([w, i])
    twice = deduplicate(once + [w, i])
    assert [c.conference_id for c in once] == [c.conference_id for c in twice]
