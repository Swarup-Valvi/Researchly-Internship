"""Per-record confidence in [0, 1], consumed by the downstream credibility module.

confidence = 0.40 * source_trust + 0.40 * completeness + 0.20 * method_weight
(+ up to 0.10 corroboration bonus when independent sources were merged), capped at 1.0.
"""
from __future__ import annotations

from models import Conference

SOURCE_TRUST = {"ieee": 1.0, "acm": 1.0, "springer": 0.9, "individual": 0.7, "wikicfp": 0.4}
METHOD_WEIGHT = {"structured": 1.0, "heuristic": 0.7, "llm_assisted": 0.5}


def completeness(c: Conference) -> float:
    checks = [
        bool(c.canonical_name), bool(c.year), bool(c.website_url),
        c.dates.conference_start is not None, c.dates.submission_deadline is not None,
        (c.location.country is not None) or c.location.is_virtual, c.publisher is not None, bool(c.topics),
    ]
    return sum(checks) / len(checks)


def score(c: Conference, n_sources: int = 1) -> float:
    base = (0.40 * SOURCE_TRUST[c.provenance.primary_source]
            + 0.40 * completeness(c)
            + 0.20 * METHOD_WEIGHT[c.provenance.extraction_method])
    bonus = min(0.10, 0.05 * max(0, n_sources - 1))
    return round(min(1.0, base + bonus), 3)
