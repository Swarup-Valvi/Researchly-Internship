"""ccfddl source. Fixture = trimmed REAL entries (AAAI, ICDE, NSDI) from ccfddl commit 1f3d38c (MIT, (c) CCFDDL)."""
import json
import shutil

import run
from dedup.matcher import deduplicate
from models import RawRecord
from normalizer.records import normalize
from scrapers.ccfddl import CCFDDLScraper
from tests.conftest import FIX, make_scraper

CCF = FIX / "ccfddl"


def scrape(env, path=CCF, **opts):
    s = make_scraper(CCFDDLScraper, env, options={"ccfddl_path": str(path), "min_year": 2025, **opts})
    return s, s.run()


def by(recs, acr, year):
    [r] = [r for r in recs if r.acronym == acr and r.year == year]
    return r


def test_one_record_per_conference_year_from_min_year(env):
    _, recs = scrape(env)
    assert sorted((r.acronym, r.year) for r in recs) == [
        ("AAAI", 2025), ("AAAI", 2026), ("AAAI", 2027), ("ICDE", 2025), ("ICDE", 2026), ("ICDE", 2027),
        ("NSDI", 2026), ("NSDI", 2027), ("NSDI", 2028)]                       # AAAI 2024 < min_year: excluded


def test_field_mapping_aaai_2027(env):
    _, recs = scrape(env)
    r = by(recs, "AAAI", 2027)
    assert r.source == "ccfddl" and r.extraction_method == "structured"
    assert r.name == "AAAI Conference on Artificial Intelligence"
    assert r.website_url == "https://aaai.org/conference/aaai/aaai-27/"
    assert r.dates_text == "February 16-23, 2027" and r.location_text == "Montréal, Québec, Canada"
    assert r.deadline_text == "2026-07-28 23:59:59 UTC-12"
    assert r.tracks == []
    assert r.source_url == "https://github.com/ccfddl/ccf-deadlines/blob/main/conference/AI/aaai.yml"
    assert r.ranking == [{"system": "CORE", "value": "A*", "source_url": r.source_url},
                         {"system": "CCF", "value": "A", "source_url": r.source_url}]
    assert r.dblp_key == "aaai"
    assert r.dataset_version.startswith("ccfddl@") and r.raw_snapshot_ref.endswith(":conference/AI/aaai.yml")
    c, err = normalize(r)
    assert err is None
    assert c.dates.submission_deadline == "2026-07-28T23:59-12:00" and c.dates.deadline_timezone == "UTC-12"
    assert (c.dates.conference_start, c.dates.conference_end) == ("2027-02-16", "2027-02-23")
    assert c.location.country == "Canada"
    assert c.indexing_claims.model_dump() == {"scopus": "unknown", "wos": "unknown", "dblp": "unknown"}
    assert c.sponsors.claimed == [] and c.publisher is None
    assert c.provenance.dataset_version == r.dataset_version and c.dblp_key == "aaai"


def test_timezones_tracks_tbd_and_unranked(env):
    _, recs = scrape(env)
    icde25, _ = normalize(by(recs, "ICDE", 2025))
    assert icde25.dates.submission_deadline == "2024-08-02T23:59-12:00"            # AoE = UTC-12
    assert [t.model_dump() for t in icde25.tracks] == [{"name": "second round", "deadline": "2024-11-25T23:59-12:00"}]
    icde27, _ = normalize(by(recs, "ICDE", 2027))
    assert icde27.dates.submission_deadline == "2026-06-11"                         # 'PT' is ambiguous: date only
    assert icde27.dates.deadline_timezone is None
    nsdi28 = by(recs, "NSDI", 2028)
    assert nsdi28.deadline_text is None                                             # 'TBD' -> null, never guessed
    assert nsdi28.ranking == [{"system": "CCF", "value": "A", "source_url": nsdi28.source_url}]   # core 'N' -> no claim
    assert by(recs, "NSDI", 2026).tracks == []                                      # extra rounds without a comment: not named


def test_unchanged_dataset_is_skipped_by_sha_and_full_forces(env):
    s1, first = scrape(env)
    assert first
    s2, again = scrape(env)
    assert again == [] and s2.metrics.snapshot()["ccfddl"]["pages_unchanged"] == 1
    s3 = make_scraper(CCFDDLScraper, env, options={"ccfddl_path": str(CCF), "min_year": 2025})
    assert len(s3.run(full=True)) == len(first)


def test_changed_dataset_is_processed_and_ids_are_stable_across_commits(env, tmp_path):
    _, first = scrape(env)
    copy = tmp_path / "ccfddl"
    shutil.copytree(CCF, copy)
    p = copy / "conference/AI/aaai.yml"
    p.write_text(p.read_text().replace("place: Singapore EXPO", "place: Singapore EXPO, Singapore"))
    _, second = scrape(env, path=copy)
    assert second, "new content hash -> processed again"
    a1, _ = normalize(by(first, "AAAI", 2027))
    a2, _ = normalize(by(second, "AAAI", 2027))
    assert a1.conference_id == a2.conference_id                                     # SHA is not part of the identity
    assert a1.provenance.dataset_version != a2.provenance.dataset_version


def test_dedup_merges_ccfddl_with_other_sources_without_duplicates(env):
    _, recs = scrape(env)
    ccf, _ = normalize(by(recs, "AAAI", 2027))
    site, _ = normalize(RawRecord(source="individual", source_url="https://aaai.org/conference/aaai/aaai-27/",
                                  website_url="https://aaai.org/conference/aaai/aaai-27/",
                                  name="The 41st AAAI Conference on Artificial Intelligence (AAAI-27)", acronym="AAAI", year=2027,
                                  publisher="AAAI Press"))
    wiki, _ = normalize(RawRecord(source="wikicfp", source_url="http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=1",
                                  name="AAAI Conference on Artificial Intelligence", acronym="AAAI", year=2027))
    other_year, _ = normalize(by(recs, "AAAI", 2026))
    out = deduplicate([wiki, ccf, site, other_year])
    aaai27 = [c for c in out if c.year == 2027]
    assert len(aaai27) == 1 and len(out) == 2                                       # never merged across years
    m = aaai27[0]
    assert m.provenance.primary_source == "individual"                              # individual > ccfddl > wikicfp
    assert m.dblp_key == "aaai" and m.publisher == "AAAI Press"
    assert {(r.system, r.value) for r in m.ranking_claims} == {("CORE", "A*"), ("CCF", "A")}
    assert m.provenance.dataset_version and len(m.dedup.merged_from) == 3


def test_cli_dry_run_over_fixture_is_schema_valid(tmp_path):
    a = run.build_parser().parse_args(["--source", "ccfddl", "--fixtures", str(FIX), "--storage", str(tmp_path / "s"),
                                       "--output", str(tmp_path / "c.json")])
    s = run.run_pipeline(a)
    assert s["schema_invalid"] == 0 and s["output_records"] >= 6
    data = json.loads((tmp_path / "c.json").read_text())
    assert all(r["provenance"]["primary_source"] == "ccfddl" for r in data)
    s2 = run.run_pipeline(a)                                                        # same dataset: skipped, output kept
    assert s2["raw_records"] == 0 and s2["output_records"] == s["output_records"]


def test_attendance_note_is_not_part_of_the_country():
    from normalizer.records import parse_location
    loc = parse_location("Vienna, Austria (Hybrid)", None)                     # real ccfddl place string (ACL 2025)
    assert (loc.city, loc.country) == ("Vienna", "Austria")
    assert parse_location("San Diego, California, United States (Hybrid)", None).country == "United States"


def loc(text):
    from normalizer.records import parse_location
    l = parse_location(text, None)
    return (l.venue, l.city, l.country)


def test_location_alt_2026_venue_city_country():
    assert loc("Fields Institute, Toronto, Canada") == ("Fields Institute", "Toronto", "Canada")      # real ccfddl ALT 2026


def test_location_aaai_2026_lone_venue_has_no_city_or_country():
    assert loc("Singapore EXPO") == ("Singapore EXPO", None, None)                                     # real ccfddl AAAI 2026


def test_location_rules():
    assert loc("COEX Convention Center, Seoul, South Korea") == ("COEX Convention Center", "Seoul", "South Korea")
    assert loc("Lisbon, Portugal") == (None, "Lisbon", "Portugal")                                     # 2 parts: city, country
    assert loc("Example University, Portugal") == ("Example University", None, "Portugal")             # 2 parts with venue word
    assert loc("Detroit, Michigan, USA") == (None, "Detroit", "United States")                         # state is not the city
    assert loc("PHILADELPHIA, PENNSYLVANIA, USA") == (None, "PHILADELPHIA", "United States")
    assert loc("Montréal, Québec, Canada") == (None, "Montréal", "Canada")
    assert loc("Paris") == (None, "Paris", None)                                                       # country not stated: empty
    assert loc("Atlanta, Georgia") == (None, "Atlanta", None)                                          # region is not a country
    assert loc("Sydney, Australia; Atlanta, USA; Paris, France") == (None, None, None)                 # real NeurIPS 2026: multi-site


def test_ccfddl_records_get_venue_city_country(env):
    _, recs = scrape(env)
    c, _ = normalize(by(recs, "AAAI", 2026))
    assert (c.location.venue, c.location.city, c.location.country) == ("Singapore EXPO", None, None)
