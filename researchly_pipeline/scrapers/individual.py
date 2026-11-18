"""Individual conference sites: (a) JSON-LD Event, (b) 'Important Dates' heuristics, (c) optional grounded LLM."""
from __future__ import annotations

import re
from typing import Optional

from bs4 import BeautifulSoup

from extractors import llm_assist
from extractors.committee import extract_committee
from extractors.dates import extract_important_dates
from extractors.jsonld import extract_events
from models import RawRecord
from normalizer.records import parse_location
from normalizer.names import clean_ws, extract_acronym, extract_edition, extract_year
from scrapers.base import BaseScraper, register

# Sponsorship CUE immediately followed by a NAMED organisation (capitalised word / acronym, optional "the").
_SPONSOR_RX = re.compile(r"\b(?i:(?:technically\s+)?co-?sponsored\s+by|sponsored\s+by|in\s+cooperation\s+with|organi[sz]ed\s+by)"
                         r"\s+(?i:the\s+)?[A-Z][\w&.'-]*")
_SPONSOR_NEG = re.compile(r"\b(not|no|never|nor|unless|without)\b", re.I)
_SPONSOR_CALL = re.compile(r"sponsor(ship)?\s+(applications?|opportunit|prospectus|portal|packages?)|become\s+a\s+sponsor|"
                           r"call\s+for\s+sponsors|interested\s+in\s+sponsoring", re.I)
_BODY_TAGS = ["p", "li", "td", "dd"]
_CHROME = ["nav", "header", "footer"]
_ACRONYM_TOKEN = re.compile(r"^\s*([A-Z][A-Za-z]{1,10})\s+['’]?(?:19|20)\d{2}\s*$")
_INDEX_RX = re.compile(r"\b(scopus|web of science|wos|dblp|ei compendex|sci/?e?)\b", re.I)
_REDFLAG_RX = re.compile(r"guarantee[ds]?\s+(paper\s+)?acceptance|acceptance\s+(guaranteed|within)|\b(24|48|72)\s*(h|hours)\b|fast[- ]?track|mandatory\s+(author|publication|processing)\s+fee|pay\s+to\s+publish", re.I)
_FEE_RX = re.compile(r"\b(registration fee|author fee|publication fee|apc|fee[s]?:)", re.I)


def sentences(soup: BeautifulSoup) -> list[str]:
    """Block-aware sentence split: headings/cells never get glued onto the following sentence."""
    out: list[str] = []
    for line in soup.get_text("\n", strip=True).split("\n"):
        for s in re.split(r"(?<=[.!?])\s+", line):
            s = " ".join(s.split())
            if s:
                out.append(s[:300])
    return out


def matching(sents: list[str], rx: re.Pattern, n: int = 5) -> list[str]:
    return [s for s in sents if rx.search(s)][:n]


def _is_link_only(el) -> bool:
    text = el.get_text("", strip=True)
    links = "".join(a.get_text("", strip=True) for a in el.find_all("a"))
    return bool(text) and text == links


def sponsor_sentences(soup: BeautifulSoup, n: int = 5) -> list[str]:
    """Sentences from body text (<p>/<li>/<td>/<dd>, outside nav/header/footer, not link-only) that name a sponsor.

    Kept: a sponsorship cue + a named organisation. Dropped: negations ("not sponsored by", "no sponsor"),
    calls for sponsors ("Sponsor applications close", "Become a sponsor"), navigation labels ("Sponsors").
    """
    out: list[str] = []
    for el in soup.find_all(_BODY_TAGS):
        if el.find(_BODY_TAGS) or el.find_parent(_CHROME) or _is_link_only(el):
            continue                                   # innermost blocks only; never site chrome or bare links
        for s in re.split(r"(?<=[.!?])\s+", " ".join(el.get_text(" ", strip=True).split())):
            if _SPONSOR_RX.search(s) and not _SPONSOR_NEG.search(s) and not _SPONSOR_CALL.search(s) and s[:300] not in out:
                out.append(s[:300])
    return out[:n]


def acronym_from_meta(soup: BeautifulSoup) -> Optional[str]:
    """'ACL 2026' in og:site_name or <title> -> 'ACL'. Anything that is not exactly ACRONYM + year -> None."""
    og = soup.find("meta", attrs={"property": "og:site_name"})
    for v in ((og.get("content") if og else None), soup.title.get_text() if soup.title else None):
        m = _ACRONYM_TOKEN.match(v or "")
        if m and sum(c.isupper() for c in m.group(1)) >= 2:
            return m.group(1)
    return None


_DATE_LINE = re.compile(r"\b(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b", re.I)


def page_name(soup: BeautifulSoup) -> Optional[str]:
    """First non-empty <h1>, else <title>, else og:title. An empty <h1> never wins over a real title."""
    for h1 in soup.find_all("h1"):
        t = clean_ws(h1.get_text(" ", strip=True))
        if t:
            return t
    if soup.title and clean_ws(soup.title.get_text()):
        return clean_ws(soup.title.get_text())
    og = soup.find("meta", attrs={"property": "og:title"})
    return clean_ws(og.get("content") or "") or None if og else None


def hero_line(soup: BeautifulSoup, selector: Optional[str], want_date: bool) -> Optional[str]:
    """First line of the first element matching `selector` that is (want_date) / is not a date.

    Lines are split on <br>/block boundaries, so a lead like "San Diego, CA<br>July 2-7, 2026" yields one value each.
    """
    if not selector:
        return None
    for el in soup.select(selector):
        for line in el.get_text("\n", strip=True).split("\n"):
            line = clean_ws(line)
            if line and bool(_DATE_LINE.search(line)) == want_date:
                return line
    return None


@register
class IndividualScraper(BaseScraper):
    name = "individual"

    def __init__(self, *a, llm=None, **kw) -> None:
        super().__init__(*a, **kw)
        self.llm = llm

    def parse(self, html: str, url: str) -> list[RawRecord]:
        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text(" ", strip=True)
        sents = sentences(soup)
        events = extract_events(html)
        dates = extract_important_dates(html)
        rec = RawRecord(source="individual", source_url=url, website_url=url, extraction_method="heuristic")
        if events and events[0].get("name"):
            ev = events[0]
            rec.name = clean_ws(ev["name"])
            rec.website_url = ev.get("url") or url
            rec.dates_text = f"{ev.get('start') or ''} - {ev.get('end') or ''}".strip(" -") or None
            rec.location_text, rec.is_virtual = ev.get("location_text"), ev.get("is_virtual")
            rec.sponsors_text = ev.get("sponsors", [])
            rec.extraction_method = "structured"
            rec.year = extract_year(ev.get("start") or ev["name"])
        else:
            title = page_name(soup)
            rec.name = title
            rec.year = extract_year(title) or extract_year(text[:600])
            loc = hero_line(soup, self.sel.get("location"), want_date=False)
            # Hero/lead lines can be taglines: accept only text that parses to a country.
            rec.location_text = loc if loc and parse_location(loc, None).country else None
            rec.dates_text = hero_line(soup, self.sel.get("dates"), want_date=True) or dates.get("conference_dates")
        rec.acronym = extract_acronym(rec.name) or acronym_from_meta(soup)
        rec.edition = extract_edition(rec.name)
        rec.deadline_text = dates["submission_deadline"]
        rec.notification_text = dates["notification_date"]
        rec.camera_ready_text = dates["camera_ready"]
        rec.sponsors_text = rec.sponsors_text or sponsor_sentences(soup)
        rec.committee = extract_committee(html)
        idx = matching(sents, _INDEX_RX)
        rec.indexing_text = " ".join(idx) or None  # raw claim sentences preserved verbatim
        fee = matching(sents, _FEE_RX, 1)
        rec.fees_text = fee[0] if fee else None
        # Raw sentences kept for audit and for the credibility engine (indexing / fee / sponsor / red-flag wording).
        rec.claim_snippets = list(dict.fromkeys(idx + fee + matching(sents, _REDFLAG_RX) + rec.sponsors_text))[:8]
        if not rec.dates_text:
            m2 = re.search(r"(?:conference|event)\s+dates?\s*[:\-]\s*([^\n.]{5,60})", text, re.I)
            rec.dates_text = clean_ws(m2.group(1)) if m2 else None
        # Optional grounded LLM pass, only for gaps the heuristics left.
        if self.llm and (not rec.deadline_text or not rec.dates_text or not rec.location_text):
            got = llm_assist.extract(text, self.llm)
            used = False
            for field, attr in (("submission_deadline", "deadline_text"), ("dates", "dates_text"), ("location", "location_text"),
                                ("notification_date", "notification_text"), ("camera_ready", "camera_ready_text"),
                                ("publisher", "publisher")):
                if field in got and not getattr(rec, attr):
                    setattr(rec, attr, got[field])
                    used = True
            if used:
                rec.extraction_method = "llm_assisted"
        return [rec] if rec.name else []
