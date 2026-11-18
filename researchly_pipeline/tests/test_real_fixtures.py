"""Parse tests against REAL pages (trimmed, fetched 2026-11-18; see the header comment in each fixture).

Values asserted here were read off the live pages by eye. `None` means "not stated on that page" unless the
comment says KNOWN GAP (stated on the page, but our heuristics don't extract it yet).
"""
from extractors.dates import extract_important_dates
from scrapers.individual import IndividualScraper
from tests.conftest import make_scraper


def parse(env, fx, name, url):
    [r] = make_scraper(IndividualScraper, env).parse(fx(name), url)
    return r


def test_acl2026_heuristic_fields(env, fx):
    r = parse(env, fx, "individual_acl2026.html", "https://2026.aclweb.org/")
    assert r.extraction_method == "heuristic"
    assert r.name == "The 64th Annual Meeting of the Association for Computational Linguistics"
    assert r.year == 2026
    assert r.acronym == "ACL"                         # not in the name; from og:site_name "ACL 2026"
    assert r.sponsors_text == []                      # page names no sponsor in body text
    assert r.deadline_text == "January 5, 2026"
    assert r.notification_text == "April 4, 2026"
    assert r.camera_ready_text == "April 19, 2026"
    assert r.dates_text == "July 2–7, 2026"
    assert r.location_text == "San Diego, California, United States"


def test_acl2026_ignores_non_event_jsonld(env, fx):
    html = fx("individual_acl2026.html")
    assert '"@type": "Person"' in html and '"name": "acl"' in html      # the trap is really in the fixture
    r = parse(env, fx, "individual_acl2026.html", "https://2026.aclweb.org/")
    assert r.extraction_method != "structured"
    assert r.name != "acl" and r.name.lower() != "acl"


def test_acl2026_overall_conference_row_is_a_dates_label(fx):
    d = extract_important_dates(fx("individual_acl2026.html"))
    assert d["conference_dates"] == "July 2 - 7, 2026"                  # "Overall Conference", not "Main Conference"


def test_acl2026_dates_fall_back_to_important_dates_row_without_hero(env, fx):
    html = fx("individual_acl2026.html").replace('class="page__lead"', 'class="removed"')
    [r] = make_scraper(IndividualScraper, env).parse(html, "https://2026.aclweb.org/")
    assert r.dates_text == "July 2 - 7, 2026"
    assert r.location_text is None                                      # never invented


def test_empty_h1_falls_back_to_title_then_og_title(env, fx):
    # Variant of the ACL fixture: none of the three real pages has an empty <h1>, so we blank it here.
    html = fx("individual_acl2026.html")
    start, end = html.index("<h1"), html.index("</h1>")
    html = html[:start] + '<h1 class="page__title" id="page-title" itemprop="headline">  </h1>' + html[end + 5:]
    s = make_scraper(IndividualScraper, env)
    [r] = s.parse(html, "https://2026.aclweb.org/")
    assert r.name == "The 64th Annual Meeting of the Association for Computational Linguistics - ACL 2026"   # <title>
    no_title = html.replace(html[html.index("<title>"):html.index("</title>") + 8], "")
    [r] = s.parse(no_title, "https://2026.aclweb.org/")
    assert r.name == "The 64th Annual Meeting of the Association for Computational Linguistics"           # og:title


def test_icml2026_heuristic_fields(env, fx):
    r = parse(env, fx, "individual_icml2026.html", "https://icml.cc/Conferences/2026")
    assert r.name == "ICML 2026" and r.acronym == "ICML" and r.year == 2026
    assert r.location_text == "Seoul, South Korea"
    assert r.dates_text == "July 6th - 11th, 2026"
    # KNOWN GAP: the homepage "Important Dates" card is empty in the served HTML (filled client-side);
    # deadlines live on /Conferences/2026/Dates.
    assert r.deadline_text is None and r.notification_text is None


def test_neurips2026_heuristic_fields(env, fx):
    r = parse(env, fx, "individual_neurips2026.html", "https://neurips.cc/Conferences/2026")
    assert r.name == "NeurIPS 2026" and r.acronym == "NeurIPS" and r.year == 2026
    # Not stated on the homepage: only "Early Registration Deadline" is listed, which is not a submission deadline.
    assert r.deadline_text is None and r.notification_text is None
    # DELIBERATELY NULL (decision 2026-11-18): NeurIPS 2026 is multi-city: Sydney (Main) Dec 6 - 12, Atlanta and
    # Paris (Satellite) Dec 9 - 13, laid out in plain columns with no year on the date lines. Picking one city would
    # misrepresent the event and the dates would need a guessed year, so both stay null until the record schema
    # can represent multiple sites.
    assert r.location_text is None and r.dates_text is None


# --- ICML Dates page (individual_icml2026_dates.html) ------------------------------------------------------------

def test_icml2026_dates_page_submission_and_notification(fx):
    d = extract_important_dates(fx("individual_icml2026_dates.html"))
    # Full-paper deadline, not "Abstract Submission Deadline" (Jan 23) nor "Paper Submission Opens" (Jan 08).
    assert d["submission_deadline"] == "Jan 28 '26 (Anywhere on Earth)"
    # "Author Notification", not "Financial Aid Notification" (Jun 01), which is listed earlier on the page.
    assert d["notification_date"] == "Apr 30 '26 (Anywhere on Earth)"
    assert d["camera_ready"] is None                   # not stated on this page
    assert d["conference_dates"] is None               # only "Main Conference" (Jul 7-9), a sub-range, not the event


def test_dates_table_skips_spacer_cells_and_non_paper_rows():
    html = """<table>
      <tr><td class="borderNone"></td><td>Deadline to set your Dietary Preference</td><td>Jun 03 '26</td></tr>
      <tr><td class="borderNone"></td><td>Deadline for Reviews</td><td>Mar 12 '26</td></tr>
      <tr><td class="borderNone"></td><td>Volunteer Notification</td><td>Jun 01 '26</td></tr>
    </table>"""
    assert extract_important_dates(html) == {"submission_deadline": None, "notification_date": None,
                                             "camera_ready": None, "conference_dates": None}


# --- sponsors: real false positives seen on the live pages (2026-11-18) -------------------------------------------

REAL_SPONSOR_FALSE_POSITIVES = """<html><head><title>x 2026</title></head><body>
<nav><ul><li><a href="/sponsors/">Sponsors</a></li></ul></nav>
<div><a class="btn btn-outline-dark" href="/sponsors/sponsors-list?year=2026">View 2026 Sponsors</a></div>
<div><a class="btn btn-outline-dark d-flex align-items-center" href="/sponsors/sponsors-list?year=2026">View ICML 2026 Sponsors</a></div>
<p class="mb-2"><strong>Sponsor applications for NeurIPS 2026 close November 4, 2026.</strong></p>
<ul><li><strong>Notice Regarding Satellite Meetings</strong> ICML 2026 does <strong>not</strong> have any official satellite
meetings, satellite conferences, or affiliated satellite events. Any event that describes itself as an "ICML satellite,"
"ICML satellite meeting," or uses similar language is <strong>not </strong>organized, endorsed, sponsored, or officially
affiliated with ICML 2026 unless it is explicitly listed on this website.</li></ul>
<p>This event is not sponsored by IEEE.</p>
<p>Become a sponsor: sponsorship opportunities are organized by the Sponsorship Chairs.</p>
<footer><p>Organized by Example Foundation.</p></footer>
</body></html>"""


def test_real_sponsor_false_positives_yield_no_sponsors(env):
    [r] = make_scraper(IndividualScraper, env).parse(REAL_SPONSOR_FALSE_POSITIVES, "https://x.test/")
    assert r.sponsors_text == []


def test_sponsor_positive_cases(env):
    html = REAL_SPONSOR_FALSE_POSITIVES.replace(
        "</body>", "<p>The conference is technically co-sponsored by the IEEE Computer Society. Lunch is provided.</p>"
                   "<table><tr><td>Held in cooperation with ACM SIGAI.</td></tr></table></body>")
    [r] = make_scraper(IndividualScraper, env).parse(html, "https://x.test/")
    assert r.sponsors_text == ["The conference is technically co-sponsored by the IEEE Computer Society.",
                               "Held in cooperation with ACM SIGAI."]


def test_sponsor_cue_without_named_org_is_ignored(env):
    html = "<html><head><title>x 2026</title></head><body><p>Kindly sponsored by our friends.</p></body></html>"
    [r] = make_scraper(IndividualScraper, env).parse(html, "https://x.test/")
    assert r.sponsors_text == []


# --- acronym & location guards ------------------------------------------------------------------------------------

def test_acronym_from_meta_only_when_it_is_acronym_plus_year(env, fx):
    html = fx("individual_acl2026.html").replace('content="ACL 2026" property="og:site_name"',
                                                  'content="Welcome to 2026" property="og:site_name"')
    html = html.replace("- ACL 2026</title>", "- Annual Meeting 2026</title>")
    [r] = make_scraper(IndividualScraper, env).parse(html, "https://2026.aclweb.org/")
    assert r.acronym is None


def test_tagline_in_page_lead_is_not_a_location(env, fx):
    html = fx("individual_acl2026.html").replace("San Diego, California, United States<br/>",
                                                  "Bringing language technology to everyone<br/>")
    [r] = make_scraper(IndividualScraper, env).parse(html, "https://2026.aclweb.org/")
    assert r.location_text is None
    assert r.dates_text == "July 2–7, 2026"            # the date line in the same lead is still used
