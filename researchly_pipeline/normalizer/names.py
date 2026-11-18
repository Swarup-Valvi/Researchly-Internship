"""Name / acronym / year / edition normalization. Conservative: returns None rather than guessing."""
from __future__ import annotations

import re
from typing import Optional

STOPWORDS = {"the", "of", "on", "and", "for", "in", "international", "intl", "conference", "annual",
             "symposium", "workshop", "proceedings", "ieee", "acm", "th", "st", "nd", "rd"}
_ORD_WORDS = r"(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|twentieth|thirtieth|fortieth|fiftieth)"


def clean_ws(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    s = re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()
    return s or None


def extract_year(text: Optional[str]) -> Optional[int]:
    if not text:
        return None
    m = re.findall(r"\b(19[5-9]\d|20\d{2})\b", text)
    if m:
        return int(m[-1])
    m = re.search(r"['’](\d{2})\b", text)  # ICML'27
    return 2000 + int(m.group(1)) if m else None


def extract_edition(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    m = re.search(r"\b(\d{1,3})(st|nd|rd|th)\b", text, re.I)
    if m:
        return f"{m.group(1)}{m.group(2).lower()}"
    m = re.search(rf"\b{_ORD_WORDS}\b", text, re.I)
    return m.group(1).lower() if m else None


def extract_acronym(text: Optional[str]) -> Optional[str]:
    """'(ICML 2027)' / 'ICML 2027' / 'ICML'27' -> 'ICML'. Returns None if nothing acronym-like."""
    if not text:
        return None
    m = re.search(r"\(([A-Z][A-Za-z0-9&\-]{1,15})(?:\s*['’]?\s*\d{2,4})?\)", text)
    if m:
        return m.group(1)
    m = re.match(r"^\s*([A-Z][A-Z0-9&\-]{1,14})(?:\s*['’]?\s*(?:19|20)?\d{2})?\s*$", text)
    if m:
        return m.group(1)
    m = re.match(r"^\s*([A-Z][A-Za-z0-9&\-]{1,14})\s+(?:19|20)\d{2}\b", text)
    return m.group(1) if m else None


def canonical_name(raw: Optional[str]) -> Optional[str]:
    """Collapse whitespace, strip a trailing year and bracketed acronym. Keeps wording intact."""
    s = clean_ws(raw)
    if not s:
        return None
    s = re.sub(r"\s*\([A-Za-z0-9&\-' ]{2,20}\)\s*$", "", s)
    s = re.sub(r"[\s,:\-]*\b(19|20)\d{2}\b\s*$", "", s)
    s = re.sub(r"^\s*(\d{1,3}(st|nd|rd|th)|%s)\s+" % _ORD_WORDS, "", s, flags=re.I)
    return clean_ws(s)


def match_key(name: Optional[str]) -> str:
    """Normalized key used only for fuzzy matching."""
    if not name:
        return ""
    s = re.sub(r"[^a-z0-9 ]+", " ", name.lower())
    return " ".join(w for w in s.split() if w not in STOPWORDS and not re.fullmatch(r"(19|20)\d{2}", w))


_SKIP_IN_INITIALS = {"of", "on", "the", "and", "for", "in", "to", "a", "an"}


def initials_match(acronym: Optional[str], full_name: Optional[str]) -> bool:
    """True if the acronym equals the initials of the full name (ignoring small words), e.g. ICALS."""
    if not acronym or not full_name:
        return False
    words = [w for w in re.split(r"[^A-Za-z0-9]+", full_name) if w and w.lower() not in _SKIP_IN_INITIALS]
    return "".join(w[0] for w in words).upper() == re.sub(r"[^A-Za-z0-9]", "", acronym).upper()
