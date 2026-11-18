"""Risk phrases on a conference's own pages, decided by CODE.

Two uses:
  scan(text)                      deterministic pattern scan of a fetched page (no LLM), returns verbatim quotes;
  confirms(category, quote)       the gate for LLM-proposed risk phrases: the category must be confirmed by these
                                  patterns on the (already verbatim-verified) quote, so the model cannot mislabel.

Patterns are deliberately narrow. Common, legitimate wording does not match: "at least one author must register",
"authors have 48 hours to respond to reviews" (rebuttal), "registration fee: $500".
"""
from __future__ import annotations

import re

CATEGORIES = ("guaranteed_acceptance", "publish_in_days", "fast_review", "fee_only", "no_named_committee")
FAIL = {"guaranteed_acceptance", "publish_in_days"}          # engine: fail; the rest: warn

_U = r"(hours?|hrs?|h|days?|business days|working days)"
PATTERNS: dict[str, list[re.Pattern]] = {
    "guaranteed_acceptance": [
        re.compile(r"guarantee[ds]?\s+(of\s+)?(your\s+)?(paper\s+|manuscript\s+)?(acceptance|publication)", re.I),
        re.compile(r"(acceptance|publication)\s+(is\s+)?guaranteed", re.I),
        re.compile(r"\b100\s*%\s+(acceptance|publication)", re.I),
    ],
    "publish_in_days": [
        re.compile(rf"publish(ed|ing)?\s+(with)?in\s+\d{{1,2}}\s*{_U}\b", re.I),
        re.compile(rf"publication\s+(with)?in\s+\d{{1,2}}\s*{_U}\b", re.I),
    ],
    "fast_review": [
        re.compile(rf"(review|acceptance|decision|notification)s?\s+(process\s+|result\s+)?(with)?in\s+(?P<n>\d{{1,2}})\s*(?P<u>{_U})\b", re.I),
        re.compile(r"(fast|rapid|quick|express)[- ]?track\s+(review|acceptance|publication)", re.I),
    ],
    "fee_only": [
        re.compile(r"accept(ed|ance)\s+(\w+\s+){0,3}(upon|after|on)\s+(receipt\s+of\s+)?(the\s+)?payment", re.I),
        re.compile(r"pay\s+to\s+publish", re.I),
        re.compile(r"no\s+(peer\s+)?review\s+(is\s+)?(required|needed)", re.I),
    ],
    "no_named_committee": [
        re.compile(r"(program|technical|organi[sz]ing)\s+committee\s*(members?\s*)?(:|-|will be|is|are)?\s*"
                   r"(to be announced|tba|tbd|coming soon|will be announced|will be updated)", re.I),
    ],
}
MAX_FAST_DAYS = 7


def _fast_ok(m: re.Match) -> bool:
    """fast_review only when the stated period is genuinely short (<= 7 days / <= 168 h)."""
    n, u = m.groupdict().get("n"), (m.groupdict().get("u") or "").lower()
    if n is None:
        return True                                         # "fast-track review"
    hours = int(n) if u.startswith("h") else int(n) * 24
    return hours <= MAX_FAST_DAYS * 24


def _match(category: str, text: str):
    for rx in PATTERNS[category]:
        for m in rx.finditer(text):
            if category != "fast_review" or _fast_ok(m):
                return m
    return None


def confirms(category: str, quote: str) -> bool:
    return category in PATTERNS and _match(category, quote or "") is not None


def _window(text: str, m: re.Match, width: int = 120) -> str:
    """Verbatim context around a match, cut at sentence-ish boundaries, max ~300 chars."""
    a = max(0, m.start() - width)
    b = min(len(text), m.end() + width)
    left = max(text.rfind(". ", a, m.start()), text.rfind("\n", a, m.start()))
    right_c = [i for i in (text.find(". ", m.end(), b), text.find("\n", m.end(), b)) if i != -1]
    a = left + 2 if left != -1 else a
    b = min(right_c) + 1 if right_c else b
    return text[a:b].strip()


def scan(text: str) -> list[tuple[str, str]]:
    """-> [(category, verbatim quote)], at most one per category."""
    out = []
    for cat in CATEGORIES:
        m = _match(cat, text or "")
        if m:
            out.append((cat, _window(text, m)))
    return out
