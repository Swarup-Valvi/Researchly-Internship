"""Program-committee members (NAME + stated AFFILIATION) from public CFP / committee pages.

Privacy rules (enforced here, tested in tests/test_committee.py):
  * Only a person's name and the affiliation printed next to it are kept. Nothing else.
  * Emails, URLs, phone numbers, ORCID/IDs are stripped before parsing and never stored.
  * Affiliation is None when the page does not state one; it is never inferred.
"""
from __future__ import annotations

import re
from typing import Optional

from bs4 import BeautifulSoup, Tag

HEADINGS = re.compile(r"\b(technical\s+)?program(me)?\s+committee\b|\bTPC\b|\bPC\s+members\b|\bprogram\s+committee\s+members\b", re.I)
# Chairs/organisers are listed under other headings; we only want the reviewing PC.
_STOP_HEADINGS = re.compile(r"organi[sz]ing|steering|advisory|local|publicity|web\s*master|sponsor", re.I)

_EMAIL = re.compile(r"[\w.+-]+\s*(@|\(at\)|\[at\])\s*[\w-]+(\.[\w-]+)+", re.I)
_URL = re.compile(r"(https?://|www\.)\S+", re.I)
_PHONE = re.compile(r"\+?\d[\d\s().-]{6,}\d")
_ORCID = re.compile(r"\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b")
_NAME = re.compile(r"^[A-ZÀ-ÖØ-Þ][\w'’.-]*(?:\s+(?:[A-ZÀ-ÖØ-Þ][\w'’.-]*|van|von|de|der|den|da|di|del|la|le|bin|al|el)){1,5}$")
# "ORCID" alone, other labels only with a colon, so "Web Science Institute" keeps its "Web".
_CONTACT_LABEL = re.compile(r"\borcid\b\s*:?|\b(e-?mail|tel(ephone)?|phone|homepage|web(site)?)\s*:", re.I)
_SEP = re.compile(r"\s*(?:,|\s[-–—|]\s|\()\s*", re.U)
MAX_MEMBERS = 300


def _scrub(text: str) -> str:
    for rx in (_EMAIL, _URL, _ORCID, _PHONE, _CONTACT_LABEL):
        text = rx.sub(" ", text)
    text = re.sub(r"\s*([,;])(\s*[,;])+", r"\1", " ".join(text.split()))   # "X, , Y" left by removals -> "X, Y"
    return text.strip(" ,;-–—|")


def _split(entry: str) -> Optional[dict]:
    """'Jane Doe, University X' / 'Jane Doe (University X)' / 'Jane Doe - University X' -> {name, affiliation}."""
    entry = _scrub(entry).strip(" ;,.")
    if not entry or len(entry) > 200:
        return None
    parts = _SEP.split(entry, maxsplit=1)
    name = parts[0].strip(" ;,.")
    aff = parts[1].strip(" ;,.)(") if len(parts) > 1 else None
    if not _NAME.match(name) or any(ch.isdigit() for ch in name) or len(name) > 60:
        return None
    return {"name": name, "affiliation": aff or None}


def _section_nodes(h: Tag):
    """Yield sibling elements after heading `h` until the next heading of the same or higher level."""
    level = int(h.name[1])
    for sib in h.find_all_next():
        if re.fullmatch(r"h[1-6]", sib.name or "") and int(sib.name[1]) <= level:
            return
        yield sib


def extract_committee(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    for t in soup(["script", "style", "nav", "header", "footer"]):
        t.decompose()
    out: list[dict] = []
    seen: set[str] = set()
    for h in soup.find_all(re.compile(r"^h[1-6]$")):
        title = h.get_text(" ", strip=True)
        if not HEADINGS.search(title) or _STOP_HEADINGS.search(title):
            continue
        for node in _section_nodes(h):
            entries: list[str] = []
            if node.name == "li" or node.name == "dd":
                entries = [node.get_text(" ", strip=True)]
            elif node.name == "tr":
                cells = [c.get_text(" ", strip=True) for c in node.find_all(["td", "th"])]
                cells = [c for c in cells if c]
                if len(cells) >= 2:
                    entries = [f"{cells[0]}, {cells[1]}"]
                elif cells:
                    entries = cells
            elif node.name == "p" and not node.find(["li", "tr"]):
                # "Name, Affiliation<br>Name, Affiliation" blocks
                entries = node.get_text("\n", strip=True).split("\n")
            for e in entries:
                m = _split(e)
                if m and m["name"].lower() not in seen:
                    seen.add(m["name"].lower())
                    out.append(m)
                    if len(out) >= MAX_MEMBERS:
                        return out
    return out
