"""Program-committee extraction. Fixture is HAND-WRITTEN with fictional people (see its header comment)."""
import json

from extractors.committee import extract_committee
from normalizer.records import normalize
from scrapers.individual import IndividualScraper
from tests.conftest import make_scraper

EXPECTED = [
    {"name": "Alice Fictional", "affiliation": "University of Nowhere"},
    {"name": "Bruno de la Testa", "affiliation": "Instituto Ficticio"},
    {"name": "Chen Placeholder", "affiliation": "Example Institute of Technology"},
    {"name": "Dana Sample", "affiliation": "Fictional Research Lab"},
    {"name": "Emeka Mock", "affiliation": "Lagos Example University"},
    {"name": "Frida Nobody", "affiliation": None},                   # not stated -> null, never inferred
    {"name": "Goran Invented", "affiliation": "Example State University"},
    {"name": "Hana Imaginary", "affiliation": "Example College"},
    {"name": "Ivo Madeup", "affiliation": "Example Polytechnic"},
]


def test_extracts_pc_names_and_stated_affiliations_only(fx):
    assert extract_committee(fx("individual_committee.html")) == EXPECTED


def test_never_keeps_contact_data(fx):
    blob = json.dumps(extract_committee(fx("individual_committee.html")))
    for leaked in ("@", "example.edu", "https://", "555", "0000-0002", "ORCID", "chairs@"):
        assert leaked not in blob


def test_other_committees_nav_and_placeholders_are_ignored(fx):
    names = {m["name"] for m in extract_committee(fx("individual_committee.html"))}
    assert not names & {"Olga Organiser", "Steve Steering", "TBA", "Name"}


def test_no_committee_section_gives_empty_list(fx):
    assert extract_committee(fx("individual_acl2026.html")) == []


def test_contact_label_needs_colon_except_orcid():
    html = "<h2>Program Committee</h2><ul><li>Kai Example, Web Science Institute</li></ul>"
    assert extract_committee(html) == [{"name": "Kai Example", "affiliation": "Web Science Institute"}]


def test_committee_flows_into_validated_conference_record(env, fx):
    [raw] = make_scraper(IndividualScraper, env).parse(fx("individual_committee.html"), "https://fict2027.example.org/")
    conf, err = normalize(raw)
    assert err is None
    assert [m.model_dump() for m in conf.committee] == EXPECTED
