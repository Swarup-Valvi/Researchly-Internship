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


_VENUE_WORDS = re.compile(r"\b(institute|university|universit[äàé]|centre|center|hall|hotel|expo|convention|campus)\b", re.I)
# First-level regions that ccfddl writes between city and country ("Detroit, Michigan, USA"). Without this the
# "second-last part is the city" rule would make "Michigan" the city. Small, explicit list: US states + DC,
# Canadian provinces/territories, Australian states/territories, plus their common abbreviations.
_REGIONS = {r.lower() for r in (
    "Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware Florida Georgia Hawaii Idaho Illinois "
    "Indiana Iowa Kansas Kentucky Louisiana Maine Maryland Massachusetts Michigan Minnesota Mississippi Missouri "
    "Montana Nebraska Nevada Ohio Oklahoma Oregon Pennsylvania Tennessee Texas Utah Vermont Virginia Washington "
    "Wisconsin Wyoming Alberta Manitoba Ontario Quebec Québec Saskatchewan Yukon Nunavut Queensland Tasmania Victoria").split()} | {
    "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "rhode island",
    "south carolina", "south dakota", "west virginia", "district of columbia", "d.c.", "dc",
    "british columbia", "new brunswick", "newfoundland and labrador", "nova scotia", "prince edward island",
    "northwest territories", "new south wales", "south australia", "western australia", "northern territory",
    "australian capital territory",
    "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me",
    "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa",
    "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy", "bc", "on", "qc", "ab", "mb", "sk", "ns",
    "nsw", "qld", "vic", "tas", "act"}


def _country(token: str) -> Optional[str]:
    """Country for the LAST comma part. Empty when it is clearly not a country (a region, venue, digits)."""
    t = token.strip().strip(".")
    if not t or any(ch.isdigit() for ch in t) or t.lower() in _REGIONS or _VENUE_WORDS.search(t):
        return None
    return COUNTRY_ALIASES.get(t.lower(), t)


def parse_location(text: Optional[str], is_virtual: Optional[bool]) -> Location:
    """Comma-split place text -> Location. Never guesses a missing part.

    3+ parts: last = country, second-last = city (or, if it is a state/province, the part before it), the rest =
    venue. 2 parts: city + country, unless the first part has a venue word (Institute, University, Centre/Center,
    Hall, Hotel, EXPO, Convention, Campus): then it is the venue and the city stays empty. 1 part: a known
    country alias -> country; a venue word -> venue; otherwise city. Trailing "(Hybrid)"-style notes are stripped.
    Several sites separated by ";" -> everything empty.
    """
    virtual = bool(is_virtual) or bool(text and re.search(r"\b(virtual|online|remote)\b", text, re.I))
    if not text or virtual and re.fullmatch(r"\s*(virtual|online|remote)\s*", text, re.I):
        return Location(is_virtual=virtual)
    text = re.sub(r"(\s*\([^()]*\))+\s*$", "", text)          # "Vienna, Austria (Hybrid)" -> "Vienna, Austria"
    if ";" in text:
        # Several sites ("Sydney, Australia; Atlanta, USA; Paris, France", NeurIPS 2026): one city/country would
        # misrepresent the event, so all stay empty (same decision as for the NeurIPS site parser).
        return Location(is_virtual=virtual)
    parts = [p.strip() for p in re.split(r",|\s[–-]\s", text) if p.strip()]
    city = venue = country = None
    if len(parts) >= 3:
        country = _country(parts[-1])
        rest = parts[:-1]
        if len(rest) >= 2 and rest[-1].strip(".").lower() in _REGIONS:
            rest = rest[:-1]                                     # drop the state/province, keep the city before it
        city = rest[-1]
        venue = ", ".join(rest[:-1]) or None
        if _VENUE_WORDS.search(city) and not venue:
            city, venue = None, city
    elif len(parts) == 2:
        country = _country(parts[1])
        if _VENUE_WORDS.search(parts[0]):
            venue = parts[0]
        else:
            city = parts[0]
    elif len(parts) == 1:
        p0 = parts[0]
        country = COUNTRY_ALIASES.get(p0.lower().strip("."))
        if not country:
            if _VENUE_WORDS.search(p0):
                venue = p0
            else:
                city = p0
    return Location(city=city, country=country, venue=venue, is_virtual=virtual)


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
        dblp_key=raw.dblp_key,
        series_years=sorted(set(raw.series_years)),
        provenance=Provenance(primary_source=raw.source, source_urls=urls,
                              scraped_at=raw.scraped_at or datetime.now(timezone.utc).isoformat(timespec="seconds"),
                              extraction_method=raw.extraction_method, confidence=0.0, dataset_version=raw.dataset_version),
        raw_snapshot_ref=raw.raw_snapshot_ref,
        dedup=Dedup(merged_from=urls, canonical_source=raw.source))
    conf.provenance.confidence = confidence.score(conf)
    return conf, None
