"""Grounded LLM enrichment: fill EMPTY fields from the conference's own website, never from model memory.

For each record with an official website (new, or cached entry older than ENRICH_RECHECK_DAYS):
  fetch it with the normal Fetcher (robots.txt, per-domain rate limit, conditional GET, snapshot)
  -> page text (token-budgeted) -> LLM returns [{field, value, quote}]
  -> VERIFICATION GATE (code, not the model): keep a field only if `quote` occurs verbatim (whitespace/case
     normalised) in the fetched text AND every part of `value` occurs in the quote. Anything else is dropped and
     counted as hallucination_rejected. Unverified values are never written.
  -> merge: fill empty slots only; a differing non-empty slot is kept and the disagreement logged in
     provenance.conflicts. Dates, deadlines, ranks and location are never touched (not in FIELDS).

Indexing claims become "claimed" (what the site says), never "verified". Email local parts are redacted from
stored quotes; only the domain is kept. No committee names/affiliations are involved.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from bs4 import BeautifulSoup

from extractors import llm_assist
from models import Conflict, Conference, EnrichedField, Enrichment, Track
from normalizer import topics as topic_norm
from normalizer.records import parse_fees
from observability import Metrics, log

FIELDS = ["publisher", "proceedings_series", "sponsors", "registration_fee_text", "tracks", "topics",
          "indexing_claims", "contact_email_domain"]
LIST_FIELDS = {"sponsors", "tracks", "topics", "indexing_claims"}
INDEX_NAMES = {"scopus": "scopus", "web of science": "wos", "wos": "wos", "dblp": "dblp"}
MAX_QUOTE = 400

PROMPT = """You extract facts about an academic conference from ITS OWN WEBSITE TEXT below.
Rules:
- Extract ONLY what the text explicitly states. Do not use outside knowledge. Do not infer, guess or summarise.
- For every field you output, copy an exact quote (a contiguous substring of the text, max 300 characters) that
  states it. The value must appear inside that quote.
- If a field is not stated, OMIT it. Returning nothing is correct when the page says nothing.
- indexing_claims: names of indexes the SITE CLAIMS (e.g. "Scopus", "DBLP", "Web of Science"); these are claims only.
- contact_email_domain: only the domain part of a contact email shown on the page (e.g. "example.org").
Fields: {fields}
Value types: publisher, proceedings_series, registration_fee_text, contact_email_domain = string;
sponsors, tracks, topics, indexing_claims = list of strings.
Return ONLY JSON: {{"fields": [{{"field": "<name>", "value": <string or list>, "quote": "<exact quote>"}}]}}

WEBSITE TEXT ({url}):
{text}
"""

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)")


def norm(s: Any) -> str:
    s = unicodedata.normalize("NFKC", str(s)).replace("’", "'").replace("‘", "'")
    s = s.replace("“", '"').replace("”", '"').replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", s).strip().lower()


def page_text(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for t in soup(["script", "style", "noscript", "svg", "template"]):
        t.decompose()
    return re.sub(r"\s+", " ", soup.get_text(" ", strip=True)).strip()


def redact_quote(q: str) -> str:
    return _EMAIL.sub(lambda m: f"<redacted>@{m.group(1)}", q)


def verify(item: Any, haystack_norm: str) -> Optional[tuple[str, Any, str]]:
    """Return (field, value, quote) if the item passes the gate, else None."""
    if not isinstance(item, dict):
        return None
    f, value, quote = item.get("field"), item.get("value"), item.get("quote")
    if f not in FIELDS or not isinstance(quote, str) or not (3 <= len(quote.strip()) <= MAX_QUOTE):
        return None
    q = norm(quote)
    if q not in haystack_norm:
        return None                                                    # quote not on the page
    if f in LIST_FIELDS:
        if isinstance(value, str):
            value = [value]
        if not isinstance(value, list) or not value or not all(isinstance(v, str) and v.strip() for v in value):
            return None
        value = list(dict.fromkeys(v.strip() for v in value))
        if not all(norm(v) in q for v in value):
            return None                                                # value not supported by the quote
        if f == "indexing_claims":
            if not all(norm(v) in INDEX_NAMES for v in value):
                return None
            value = sorted({INDEX_NAMES[norm(v)] for v in value})
    else:
        if not isinstance(value, str) or not value.strip() or norm(value) not in q:
            return None
        value = value.strip()
        if f == "contact_email_domain":
            dom = value.lower().lstrip("@")
            if not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", dom) or f"@{dom}" not in q:
                return None                                            # must be the domain of an address in the quote
            value = dom
    return f, value, redact_quote(quote.strip())


def verify_response(response: str, text: str) -> tuple[list[tuple[str, Any, str]], int]:
    """-> (verified items, rejected count). A malformed response rejects everything it contained."""
    data = llm_assist.parse_json(response)
    items = data.get("fields") if isinstance(data, dict) else data if isinstance(data, list) else None
    if not isinstance(items, list):
        return [], 0 if not response or not str(response).strip() else 1
    hay = norm(text)
    kept, rejected, seen = [], 0, set()
    for it in items:
        v = verify(it, hay)
        if v is None or v[0] in seen:
            rejected += v is None
            continue
        seen.add(v[0])
        kept.append(v)
    return kept, rejected


# --- merge -----------------------------------------------------------------------------------------------------

def _current(c: Conference, f: str) -> Any:
    return {
        "publisher": c.publisher, "proceedings_series": c.proceedings_series, "sponsors": c.sponsors.claimed,
        "registration_fee_text": c.fees.notes, "tracks": [t.name for t in c.tracks], "topics": c.topics,
        "indexing_claims": sorted(k for k, v in c.indexing_claims.model_dump().items() if v != "unknown"),
        "contact_email_domain": c.contact_email_domain,
    }[f]


def _same(a: Any, b: Any) -> bool:
    if isinstance(a, list) or isinstance(b, list):
        return {norm(x) for x in (a or [])} == {norm(x) for x in (b or [])}
    return norm(a) == norm(b)


def apply_fields(c: Conference, verified: list[EnrichedField], now: str) -> tuple[list[EnrichedField], int]:
    """Fill empty slots; log conflicts. Returns (applied fields, conflict count)."""
    applied, conflicts = [], 0
    for ef in verified:
        f, value, cur = ef.field, ef.value, _current(c, ef.field)
        if cur not in (None, "", []):
            if f == "indexing_claims" and set(value) <= set(cur):
                continue                                               # already claimed: nothing new, no conflict
            if not _same(cur, value) and not any(x.field == f and _same(x.discarded, value) for x in c.provenance.conflicts):
                c.provenance.conflicts.append(Conflict(field=f, kept=cur, kept_source=c.provenance.primary_source,
                                                       discarded=value, discarded_source="llm_grounded",
                                                       quote=ef.quote, detected_at=now))
                conflicts += 1
            continue
        if f == "publisher":
            c.publisher = value
        elif f == "proceedings_series":
            c.proceedings_series = value
        elif f == "sponsors":
            c.sponsors.claimed = list(value)
        elif f == "registration_fee_text":
            c.fees = parse_fees(value)
        elif f == "tracks":
            c.tracks = [Track(name=v) for v in value]
        elif f == "topics":
            c.topics = topic_norm.normalize_topics(value) or list(value)
        elif f == "indexing_claims":
            for k in value:
                setattr(c.indexing_claims, k, "claimed")              # a claim by the site, never "verified"
        elif f == "contact_email_domain":
            c.contact_email_domain = value
        applied.append(ef)
    return applied, conflicts


# --- driver ------------------------------------------------------------------------------------------------------

@dataclass
class EnrichReport:
    sites: list[dict] = field(default_factory=list)   # {conference, year, url, status, ...}
    llm_calls: int = 0
    hallucination_rejected: int = 0
    fields_applied: int = 0
    conflicts: int = 0

    def add(self, c: Conference, url: str, status: str, **kw) -> None:
        self.sites.append({"conference": c.acronym or c.canonical_name, "year": c.year, "url": url, "status": status, **kw})


def _site_url(c: Conference) -> Optional[str]:
    """The conference's own website, or None when we only have the dataset/source URL (nothing to read)."""
    u = c.website_url
    if not u or u in c.provenance.source_urls or "github.com/ccfddl/" in u:
        return None
    return u


def enrich_records(confs: list[Conference], *, fetcher, store, llm: Optional[Callable[[str], str]], metrics: Metrics,
                   logger: logging.Logger, max_per_run: int = 50, model: Optional[str] = None, reviewed: bool = False,
                   recheck_days: int = 7, max_chars: int = 12000, only: Optional[set[str]] = None,
                   now: Optional[datetime] = None) -> EnrichReport:
    """Mutates `confs` in place. `only` restricts to these conference_ids (e.g. a demo subset)."""
    rep, src = EnrichReport(), "enrichment"
    now_dt = now or datetime.now(timezone.utc)
    now_s = now_dt.isoformat(timespec="seconds")
    model = model or llm_assist.model_name()
    cache: dict = store.state.setdefault("enrichment", {})
    budget = max_per_run
    for c in confs:
        if only is not None and c.conference_id not in only:
            continue
        url = _site_url(c)
        if not url:
            rep.add(c, c.website_url, "skipped_no_official_site")
            continue
        if not reviewed:
            rep.add(c, url, "skipped_not_reviewed", reason="enrichment tos_reviewed is false in sources.yaml")
            continue
        if llm is None:
            rep.add(c, url, "skipped_no_api_key", reason="GEMINI_API_KEY not set; nothing fetched")
            continue
        entry = cache.get(url)
        fresh = entry and entry.get("checked_at", "") >= (now_dt - timedelta(days=recheck_days)).isoformat(timespec="seconds")
        if fresh:
            _reuse(c, entry, now_s, rep, url, metrics)
            continue
        if budget <= 0:
            rep.add(c, url, "skipped_budget", reason=f"MAX_ENRICH_PER_RUN={max_per_run} reached")
            continue
        budget -= 1
        st = store.url_state(url)
        res = fetcher.get(url, st.get("etag") if entry else None, st.get("last_modified") if entry else None)
        if res.skipped_reason:
            c.enrichment = Enrichment(status="skipped_robots", checked_at=now_s)
            metrics.inc(src, "pages_skipped_robots")
            rep.add(c, url, "skipped_robots", reason="disallowed by robots.txt")
            continue
        if res.not_modified and entry:
            entry["checked_at"] = now_s
            _reuse(c, entry, now_s, rep, url, metrics)
            continue
        if not res.ok:
            c.enrichment = Enrichment(status="skipped_fetch_error", checked_at=now_s)
            metrics.inc(src, "pages_failed")
            rep.add(c, url, "skipped_fetch_error", reason=res.error or f"HTTP {res.status}")
            continue
        metrics.inc(src, "pages_fetched")
        store.save_snapshot(src, url, res.content)
        digest = hashlib.sha256(res.content).hexdigest()
        store.set_url_state(url, etag=res.etag, last_modified=res.last_modified, sha256=digest, fetched_at=now_s)
        if entry and entry.get("content_hash") == digest:
            entry["checked_at"] = now_s
            _reuse(c, entry, now_s, rep, url, metrics)
            continue
        text = page_text(res.text)[:max_chars]
        rep.llm_calls += 1
        metrics.inc(src, "llm_calls")
        try:
            response = llm(PROMPT.format(fields=", ".join(FIELDS), url=url, text=text))
        except Exception as exc:  # noqa: BLE001  (network/API errors must not crash the run)
            c.enrichment = Enrichment(status="llm_error", checked_at=now_s, content_hash=digest, model=model)
            rep.add(c, url, "llm_error", reason=type(exc).__name__)
            log(logger, logging.WARNING, "llm call failed", url=url, error=type(exc).__name__)
            continue
        kept, rejected = verify_response(response, text)
        verified = [EnrichedField(field=f, value=v, quote=q, source_url=url, model=model, extracted_at=now_s) for f, v, q in kept]
        applied, conflicts = apply_fields(c, verified, now_s)
        status = "enriched" if applied else "no_verified_fields"
        c.enrichment = Enrichment(status=status, checked_at=now_s, content_hash=digest, model=model, fields=applied,
                                  hallucination_rejected=rejected)
        cache[url] = {"content_hash": digest, "checked_at": now_s, "model": model, "rejected": rejected,
                      "fields": [v.model_dump() for v in verified]}
        rep.hallucination_rejected += rejected
        rep.fields_applied += len(applied)
        rep.conflicts += conflicts
        metrics.inc(src, "hallucination_rejected", rejected)
        metrics.inc(src, "fields_verified", len(verified))
        metrics.inc(src, "fields_applied", len(applied))
        metrics.inc(src, "conflicts", conflicts)
        rep.add(c, url, status, applied=[a.field for a in applied], rejected=rejected, conflicts=conflicts)
    return rep


def _reuse(c: Conference, entry: dict, now_s: str, rep: EnrichReport, url: str, metrics: Metrics) -> None:
    """Content unchanged: re-apply the cached VERIFIED fields; no LLM call."""
    verified = [EnrichedField(**f) for f in entry.get("fields", [])]
    applied, conflicts = apply_fields(c, verified, now_s)
    c.enrichment = Enrichment(status="cached_unchanged", checked_at=entry.get("checked_at", now_s), content_hash=entry.get("content_hash"),
                              model=entry.get("model"), fields=applied, hallucination_rejected=0)
    metrics.inc("enrichment", "cache_hits")
    rep.conflicts += conflicts
    rep.add(c, url, "cached_unchanged", applied=[a.field for a in applied])


def settings_from_env() -> dict:
    def _int(name: str, default: int) -> int:
        try:
            return max(0, int(os.getenv(name, default)))
        except ValueError:
            return default
    return {"enabled": os.getenv("ENABLE_LLM_ENRICHMENT", "").strip().lower() == "true",
            "max_per_run": _int("MAX_ENRICH_PER_RUN", 50), "recheck_days": _int("ENRICH_RECHECK_DAYS", 7)}
