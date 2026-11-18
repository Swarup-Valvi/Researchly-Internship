"""Individual conference sites: (a) JSON-LD Event, (b) 'Important Dates' heuristics, (c) optional grounded LLM."""
from __future__ import annotations

import re
from typing import Optional

from bs4 import BeautifulSoup

from extractors import llm_assist
from extractors.dates import extract_important_dates
from extractors.jsonld import extract_events
from models import RawRecord
from normalizer.names import clean_ws, extract_acronym, extract_edition, extract_year
from scrapers.base import BaseScraper, register

_SPONSOR_RX = re.compile(r"\b(sponsor(?:ed|s|ship)?|co-?sponsor(?:ed)?|in cooperation with|organi[sz]ed by)\b", re.I)
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
            h1 = soup.find("h1")
            title = clean_ws(h1.get_text(" ", strip=True)) if h1 else clean_ws(soup.title.get_text()) if soup.title else None
            rec.name = title
            rec.year = extract_year(title) or extract_year(text[:600])
        rec.acronym = extract_acronym(rec.name)
        rec.edition = extract_edition(rec.name)
        rec.deadline_text = dates["submission_deadline"]
        rec.notification_text = dates["notification_date"]
        rec.camera_ready_text = dates["camera_ready"]
        rec.sponsors_text = rec.sponsors_text or matching(sents, _SPONSOR_RX)
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
