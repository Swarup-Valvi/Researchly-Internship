"""Heuristics for 'Important Dates' blocks: tables, definition lists and bullet lists."""
from __future__ import annotations

import re
from typing import Optional

from bs4 import BeautifulSoup, Tag

LABELS = {
    "submission_deadline": re.compile(r"(paper|full paper|manuscript)?\s*submission(s)?( deadline)?|submission due|paper due|"
                                      r"deadline for submission|abstract (submission|registration)?\s*deadline|^deadline", re.I),
    "notification_date": re.compile(r"notification|acceptance (notice|notification)|author notification", re.I),
    "camera_ready": re.compile(r"camera[- ]?ready|final (version|manuscript|paper)", re.I),
}
_HAS_DATE = re.compile(r"(\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", re.I)


def _pairs(soup: BeautifulSoup) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for tr in soup.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
        if len(cells) >= 2:
            pairs.append((cells[0], " ".join(cells[1:])))
    for dt in soup.find_all("dt"):
        dd = dt.find_next_sibling("dd")
        if dd:
            pairs.append((dt.get_text(" ", strip=True), dd.get_text(" ", strip=True)))
    for li in soup.find_all("li"):
        text = li.get_text(" ", strip=True)
        if ":" in text:
            k, v = text.split(":", 1)
            pairs.append((k.strip(), v.strip()))
    return pairs


def extract_important_dates(html: str) -> dict[str, Optional[str]]:
    """Return {'submission_deadline': raw_text|None, ...}. Raw text; parsing happens in the normalizer.

    The FIRST matching row per field wins (pages list the primary deadline first); a row only counts
    if its value actually looks like a date.
    """
    soup = BeautifulSoup(html, "lxml")
    out: dict[str, Optional[str]] = {k: None for k in LABELS}
    for label, value in _pairs(soup):
        if not value or not _HAS_DATE.search(value):
            continue
        for field, rx in LABELS.items():
            if out[field] is None and rx.search(label):
                out[field] = value
    return out


def find_text_after_heading(html: str, headings: list[str]) -> Optional[Tag]:
    soup = BeautifulSoup(html, "lxml")
    for h in soup.find_all(re.compile(r"^h[1-6]$")):
        if any(x in h.get_text(" ", strip=True).lower() for x in headings):
            return h.find_next(["table", "ul", "dl", "p"])
    return None
