"""Date parsing. Never invents a year, month or day: unparseable input -> None."""
from __future__ import annotations

import re
from typing import Optional

MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}

# Fixed-offset zones we are willing to convert. Anything else is kept raw.
TZ_OFFSETS = {
    "AOE": "-12:00", "ANYWHERE ON EARTH": "-12:00",
    "UTC": "Z", "GMT": "Z", "Z": "Z",
    "EST": "-05:00", "EDT": "-04:00", "CST": "-06:00", "CDT": "-05:00",
    "MST": "-07:00", "MDT": "-06:00", "PST": "-08:00", "PDT": "-07:00",
    "CET": "+01:00", "CEST": "+02:00", "IST": "+05:30", "JST": "+09:00",
}
_TZ_RE = re.compile(r"\b(AoE|Anywhere on Earth|UTC|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT|CEST|CET|IST|JST)\b"
                    r"(?:\s*([+-]\d{1,2})(?::?(\d{2}))?)?", re.I)
_OFFSET_RE = re.compile(r"\b(?:UTC|GMT)\s*([+-])(\d{1,2})(?::?(\d{2}))?", re.I)
_TIME_RE = re.compile(r"\b(\d{1,2}):(\d{2})\s*(am|pm)?\b", re.I)

_MON = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"


def _clean(text: str) -> str:
    t = text.replace("–", "-").replace("—", "-").replace("\xa0", " ")
    t = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", t, flags=re.I)
    return re.sub(r"\s+", " ", t).strip()


def _month(token: str) -> int:
    return MONTHS[token[:3].lower()]


def _iso(y: int, m: int, d: int) -> Optional[str]:
    if not (1 <= m <= 12 and 1 <= d <= 31):
        return None
    return f"{y:04d}-{m:02d}-{d:02d}"


def detect_timezone(text: str) -> tuple[Optional[str], Optional[str]]:
    """Return (iso_offset, raw_label). raw_label is kept even when we cannot convert."""
    if not text:
        return None, None
    m = _OFFSET_RE.search(text)
    if m:
        sign, hh, mm = m.group(1), int(m.group(2)), int(m.group(3) or 0)
        return f"{sign}{hh:02d}:{mm:02d}", m.group(0).upper().replace(" ", "")
    m = _TZ_RE.search(text)
    if m:
        label = m.group(1).upper()
        return TZ_OFFSETS.get(label), m.group(0).strip()
    return None, None


def parse_date(text: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Parse ONE date (optionally with time). Returns (iso, timezone_label).

    - Requires an explicit 4-digit year; otherwise returns (None, tz).
    - If a time AND a convertible timezone are present -> ISO datetime with offset.
    - Otherwise ISO date only; the raw timezone label (if any) is returned for the caller.
    - Text like "Feb 1, 2026 (Nov 1, 2025)" -> the first date is the current one.
    """
    if not text:
        return None, None
    t = _clean(text)
    t = re.split(r"\(", t, maxsplit=1)[0].strip() or t  # drop "(original deadline)"
    offset, tz_label = detect_timezone(t)
    y = re.search(r"\b(19|20)\d{2}\b", t)
    if not y:
        return None, tz_label
    year = int(y.group(0))
    m = re.search(rf"\b{_MON}\.?\s+(\d{{1,2}})\b", t, re.I)
    d = None
    if m:
        d = _iso(year, _month(m.group(1)), int(m.group(2)))
    else:
        m = re.search(rf"\b(\d{{1,2}})\s+{_MON}\b", t, re.I)
        if m:
            d = _iso(year, _month(m.group(2)), int(m.group(1)))
        else:
            m = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", t)
            if m:
                d = _iso(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    if not d:
        return None, tz_label
    tm = _TIME_RE.search(_OFFSET_RE.sub(" ", _TZ_RE.sub(" ", t)))  # don't read '+5:30' as a clock time
    if tm and offset:
        hh, mi, ap = int(tm.group(1)), int(tm.group(2)), (tm.group(3) or "").lower()
        if ap == "pm" and hh < 12:
            hh += 12
        if ap == "am" and hh == 12:
            hh = 0
        if hh < 24 and mi < 60:
            return f"{d}T{hh:02d}:{mi:02d}{'' if offset == 'Z' else offset}" + ("Z" if offset == "Z" else ""), tz_label
    return d, tz_label


def parse_range(text: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Parse "Jun 1 - Jun 5, 2026", "Jun 1-5, 2026", "15-19 June 2026" or one date."""
    if not text:
        return None, None
    t = _clean(text)
    iso = re.search(r"(\d{4})-(\d{2})-(\d{2})\s*(?:-|/|to)\s*(\d{4})-(\d{2})-(\d{2})", t)
    if iso:
        g = [int(x) for x in iso.groups()]
        return _iso(g[0], g[1], g[2]), _iso(g[3], g[4], g[5])
    m = re.search(
        rf"{_MON}\.?\s+(\d{{1,2}})(?:,?\s*(\d{{4}}))?\s*-\s*(?:{_MON}\.?\s+)?(\d{{1,2}}),?\s*(\d{{4}})", t, re.I)
    if m:
        m1, d1, y1, m2, d2, y2 = m.group(1), int(m.group(2)), m.group(3), m.group(4), int(m.group(5)), int(m.group(6))
        start_year = int(y1) if y1 else y2
        return _iso(start_year, _month(m1), d1), _iso(y2, _month(m2 or m1), d2)
    m = re.search(rf"(\d{{1,2}})(?:\s+{_MON})?\s*-\s*(\d{{1,2}})\s+{_MON}\.?,?\s*(\d{{4}})", t, re.I)
    if m:
        d1, m1, d2, m2, y = int(m.group(1)), m.group(2), int(m.group(3)), m.group(4), int(m.group(5))
        return _iso(y, _month(m1 or m2), d1), _iso(y, _month(m2), d2)
    d, _ = parse_date(t)
    return d, d
