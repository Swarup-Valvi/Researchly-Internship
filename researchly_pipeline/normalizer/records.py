"""RawRecord -> Conference. The only place that decides what ends up in the output."""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Optional

import confidence
from models import (CommitteeMember, Conference, Dates, Dedup, Fees, IndexingClaims, Location, Provenance, RankingClaim,
                    RawRecord, Sponsors, Track)
from normalizer import names, topics
from normalizer.dates import detect_timezone, parse_date, parse_range

COUNTRY_ALIASES = {"usa": "United States", "us": "United States", "u.s.a.": "United States", "united states of america": "United States",
                   "uk": "United Kingdom", "u.k.": "United Kingdom", "england": "United Kingdom", "korea": "South Korea",
                   "republic of korea": "South Korea", "p.r. china": "China", "prc": "China"}
_NEG = re.compile(r"\b(not|no|never|non)[\s-]{0,3}(indexed|index)\b", re.I)


def conference_id(canonical_name: str, year: int, primary_source_url: str) -> str:
    return hashlib.sha256(f"{canonical_name}|{year}|{primary_source_url}".encode()).hexdigest()


def parse_location(text: Optional[str], is_virtual: Optional[bool]) -> Location:
    virtual = bool(is_virtual) or bool(text and re.search(r"\b(virtual|online|remote)\b", text, re.I))
    if not text or virtual and re.fullmatch(r"\s*(virtual|online|remote)\s*", text, re.I):
        return Location(is_virtual=virtual)
    parts = [p.strip() for p in re.split(r",|–|\s-\s", text) if p.strip()]
    country = None
    if parts:
        last = parts[-1]
        country = COUNTRY_ALIASES.get(last.lower().strip("."), last)
    city = parts[0] if len(parts) >= 2 else None
    if len(parts) == 1:  # a lone token is ambiguous: keep as country only if it is a known alias, else venue-less null
        country = COUNTRY_ALIASES.get(parts[0].lower().strip("."))
        city = None if country else parts[0]
    return Location(city=city, country=country, venue=None, is_virtual=virtual)


def _with_venue(loc: Location, venue: Optional[str]) -> Location:
    loc.venue = venue or loc.venue
    return loc


def parse_fees(text: Optional[str]) -> Fees:
    if not text:
        return Fees()
    m = re.search(r"(US\$|\$|USD|EUR|€|GBP|£|INR|₹)\s?(\d[\d,]*(?:\.\d+)?)", text)
    if not m:
        return Fees(notes=text)
    cur = {"$": "USD", "US$": "USD", "€": "EUR", "£": "GBP", "₹": "INR"}.get(m.group(1), m.group(1))
    return Fees(currency=cur, amount=float(m.group(2).replace(",", "")), notes=text)


def parse_claims(text: Optional[str], source: str) -> IndexingClaims:
    """Raw claim text -> 'claimed'. WikiCFP is never an authority; nothing is ever marked 'verified' here."""
    if not text or source == "wikicfp" or _NEG.search(text):
        return IndexingClaims()
    t = text.lower()
    return IndexingClaims(
        scopus="claimed" if "scopus" in t else "unknown",
        wos="claimed" if ("web of science" in t or "wos" in t or re.search(r"\bsci[e]?\b", t)) else "unknown",
        dblp="claimed" if "dblp" in t else "unknown")


def normalize(raw: RawRecord) -> tuple[Optional[Conference], Optional[str]]:
    """Return (Conference, None) or (None, reason). Never fabricates a name or year."""
    cname = names.canonical_name(raw.name)
    if not cname:
        return None, "missing name"
    if not raw.year:
        return None, "missing year (not inferred)"
    start, end = parse_range(raw.dates_text)
    deadline, tz = parse_date(raw.deadline_text)
    notif, _ = parse_date(raw.notification_text)
    cam, _ = parse_date(raw.camera_ready_text)
    if not tz and raw.deadline_text:
        _, tz = detect_timezone(raw.deadline_text)
    tracks = [Track(name=t["name"], deadline=parse_date(t.get("deadline_text"))[0]) for t in raw.tracks if t.get("name")]
    rankings = [RankingClaim(system=r["system"], value=r["value"], source_url=r.get("source_url") or raw.source_url) for r in raw.ranking
                if r.get("system") and r.get("value")]
    authoritative = raw.source in ("ieee", "acm", "springer") and raw.sponsor_listed_by_publisher
    website = raw.website_url or raw.source_url
    urls = list(dict.fromkeys([raw.source_url, *raw.extra_source_urls]))
    conf = Conference(
        conference_id=conference_id(cname, raw.year, raw.source_url),
        canonical_name=cname, acronym=raw.acronym or names.extract_acronym(raw.name), year=raw.year,
        edition=raw.edition, website_url=website,
        location=_with_venue(parse_location(raw.location_text, raw.is_virtual), raw.venue),
        dates=Dates(conference_start=start, conference_end=end, submission_deadline=deadline, notification_date=notif,
                    camera_ready=cam, deadline_timezone=tz),
        topics=topics.normalize_topics(raw.topics), tracks=tracks, publisher=raw.publisher,
        sponsors=Sponsors(claimed=[s for s in raw.sponsors_text if s],
                          verified_source=raw.source_url if authoritative else None),
        indexing_claims=parse_claims(raw.indexing_text, raw.source), ranking_claims=rankings, fees=parse_fees(raw.fees_text), claim_snippets=list(dict.fromkeys(raw.claim_snippets))[:8],
        committee=[CommitteeMember(name=m["name"], affiliation=m.get("affiliation")) for m in raw.committee if m.get("name")],
        provenance=Provenance(primary_source=raw.source, source_urls=urls,
                              scraped_at=raw.scraped_at or datetime.now(timezone.utc).isoformat(timespec="seconds"),
                              extraction_method=raw.extraction_method, confidence=0.0),
        raw_snapshot_ref=raw.raw_snapshot_ref,
        dedup=Dedup(merged_from=urls, canonical_source=raw.source))
    conf.provenance.confidence = confidence.score(conf)
    return conf, None
