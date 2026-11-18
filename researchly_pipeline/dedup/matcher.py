"""Fuzzy de-duplication + precedence-based merge. Never merges across years."""
from __future__ import annotations

from typing import Optional
from urllib.parse import urlparse

from rapidfuzz import fuzz

import confidence
from models import SOURCE_PRECEDENCE, Conference
from normalizer.names import initials_match, match_key
from normalizer.records import conference_id

THRESHOLD = 90  # rapidfuzz token_sort_ratio on normalized names


def _rank(src: str) -> int:
    return SOURCE_PRECEDENCE.index(src)


def _conflict(a: Conference, b: Conference) -> bool:
    ca, cb = (a.location.country or "").lower(), (b.location.country or "").lower()
    return bool(ca and cb and ca != cb)


def is_duplicate(a: Conference, b: Conference) -> bool:
    if a.year != b.year or _conflict(a, b):
        return False
    ratio = fuzz.token_sort_ratio(match_key(a.canonical_name), match_key(b.canonical_name))
    if ratio >= THRESHOLD:
        return True
    # Additive rule: identical acronym + same year + no location conflict (e.g. 'ICML' vs full name).
    # Guard against acronym collisions: also require similar wording OR that the acronym spells the full name.
    same_acr = bool(a.acronym and b.acronym and a.acronym.lower() == b.acronym.lower())
    return same_acr and (ratio >= 40 or initials_match(a.acronym, b.canonical_name) or initials_match(b.acronym, a.canonical_name))


def _first(vals):
    for v in vals:
        if v not in (None, "", [], {}):
            return v
    return None


def merge(group: list[Conference]) -> Conference:
    g = sorted(group, key=lambda c: (_rank(c.provenance.primary_source), -c.provenance.confidence))
    p = g[0]
    out = p.model_copy(deep=True)
    for f in ("acronym", "edition", "publisher"):
        setattr(out, f, _first(getattr(c, f) for c in g))
    for f in ("city", "country", "venue"):
        setattr(out.location, f, _first(getattr(c.location, f) for c in g))
    out.location.is_virtual = any(c.location.is_virtual for c in g) and not out.location.country
    for f in ("conference_start", "conference_end", "submission_deadline", "notification_date", "camera_ready", "deadline_timezone"):
        setattr(out.dates, f, _first(getattr(c.dates, f) for c in g))
    out.canonical_name = p.canonical_name
    out.website_url = _first(c.website_url for c in g if c.provenance.primary_source != "wikicfp") or p.website_url
    union = lambda xs: list(dict.fromkeys(x for sub in xs for x in sub))  # noqa: E731
    out.topics = union(c.topics for c in g)
    out.sponsors.claimed = union(c.sponsors.claimed for c in g)
    out.sponsors.verified_source = _first(c.sponsors.verified_source for c in g)
    seen, tracks = set(), []
    for t in (t for c in g for t in c.tracks):
        if t.name not in seen:
            seen.add(t.name)
            tracks.append(t)
    out.tracks = tracks
    rk = {(r.system, r.value, r.source_url): r for c in g for r in c.ranking_claims}
    out.ranking_claims = list(rk.values())
    order = {"unknown": 0, "claimed": 1, "verified": 2}
    for k in ("scopus", "wos", "dblp"):
        best = max((getattr(c.indexing_claims, k) for c in g), key=order.__getitem__)
        setattr(out.indexing_claims, k, best)
    out.claim_snippets = union(c.claim_snippets for c in g)[:8]
    members = {}
    for m in (m for c in g for m in c.committee):  # first listing of a name wins (group is in precedence order)
        members.setdefault(m.name.lower(), m)
    out.committee = list(members.values())
    out.fees = _first(c.fees for c in g if c.fees.amount is not None or c.fees.notes) or out.fees
    urls = union(c.provenance.source_urls for c in g)
    out.provenance.source_urls = urls
    out.provenance.scraped_at = max(c.provenance.scraped_at for c in g)
    out.dedup.merged_from = union([c.dedup.merged_from for c in g])
    out.dedup.canonical_source = p.provenance.primary_source
    out.conference_id = conference_id(out.canonical_name, out.year, p.provenance.source_urls[0])
    # corroboration = distinct hosts that mention the event (stable across re-runs of already-merged records)
    n_hosts = len({urlparse(u).netloc for u in out.dedup.merged_from})
    out.provenance.confidence = confidence.score(out, n_sources=n_hosts)
    return out


def deduplicate(records: list[Conference]) -> list[Conference]:
    """Single-link clustering (union-find over is_duplicate), then merge each cluster."""
    n = len(records)
    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(n):
        for j in range(i + 1, n):
            if records[i].conference_id == records[j].conference_id or is_duplicate(records[i], records[j]):
                parent[find(j)] = find(i)
    clusters: dict[int, list[Conference]] = {}
    for i, r in enumerate(records):
        clusters.setdefault(find(i), []).append(r)
    return [merge(g) if len(g) > 1 else g[0] for g in clusters.values()]
