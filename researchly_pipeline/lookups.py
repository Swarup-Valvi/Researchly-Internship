"""Live evidence lookups run BY THE PIPELINE for new or changed records (not at API request time).

  dblp       DBLP SPARQL endpoint (sparql.dblp.org, robots: Allow /sparql, Crawl-delay 10) by the dataset's
             dblp_key: does the stream conf/<key> exist, and in how many distinct years has it published?
             (dblp.org/search/venue is disallowed by robots.txt and venue pages sit behind a bot challenge.)
  rdap       domain registration date via rdap.org (redirects to the registry's RDAP server).
  committee  OpenAlex author search for a deterministic sample of <= 10 program-committee members.
             PRIVACY: only AGGREGATE COUNTS are returned/stored; names stay inside this module.

All requests go through the normal Fetcher (robots.txt, per-domain token bucket, Crawl-delay, retries) with the
`lookups` settings from sources.yaml. Results are cached on the record (`lookups`, with an input hash) and reused
until the inputs change or the TTL expires. A lookup never raises: failures become {ok: false, error}.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote, urlparse

from models import Conference, Lookup, Lookups
from observability import Metrics, log

SPARQL = "https://sparql.dblp.org/sparql"
DBLP_KEY = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
TTL_DAYS = {"dblp": 30, "rdap": 30, "committee": 7}
COMMITTEE_SAMPLE = 10


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _json(fetcher, url: str):
    res = fetcher.get(url)
    if res.skipped_reason:
        return None, "disallowed by robots.txt"
    if not res.ok:
        return None, res.error or f"HTTP {res.status}"
    try:
        return json.loads(res.text), None
    except json.JSONDecodeError:
        return None, "response is not JSON (bot challenge or error page)"


# --- DBLP -----------------------------------------------------------------------------------------------------------

def dblp_query(key: str) -> str:
    s = f"<https://dblp.org/streams/conf/{key}>"
    return ("PREFIX dblp: <https://dblp.org/rdf/schema#> "
            "SELECT ?title (COUNT(DISTINCT ?y) AS ?years) (MIN(?y) AS ?first) (MAX(?y) AS ?last) WHERE { "
            f"OPTIONAL {{ {s} dblp:streamTitle ?title }} "
            f"OPTIONAL {{ ?p dblp:publishedInStream {s} ; dblp:yearOfPublication ?y . }} }} GROUP BY ?title")


def dblp_lookup(key: Optional[str], fetcher) -> Lookup:
    if not key or not DBLP_KEY.match(key):
        return Lookup(ok=False, error="no dblp_key", checked_at=_now())
    url = f"{SPARQL}?query={quote(dblp_query(key))}"
    data, err = _json(fetcher, url)
    if err:
        return Lookup(ok=False, error=err, checked_at=_now())
    try:
        b = (data["results"]["bindings"] or [{}])[0]
    except (KeyError, TypeError):
        return Lookup(ok=False, error="unexpected SPARQL response", checked_at=_now())
    val = lambda k: (b.get(k) or {}).get("value")                                   # noqa: E731
    years = int(val("years") or 0)
    found = bool(val("title")) and years > 0
    return Lookup(ok=True, checked_at=_now(), evidence_url=f"https://dblp.org/db/conf/{key}/",
                  data={"key": key, "found": found, "title": val("title"), "years_with_publications": years,
                        "first_year": int(val("first")) if val("first") else None,
                        "last_year": int(val("last")) if val("last") else None})


# --- RDAP -----------------------------------------------------------------------------------------------------------

SECOND_LEVEL = {"co", "ac", "edu", "gov", "org", "com", "net"}
SHARED_HOSTS = ("github.io", "sites.google.com", "wordpress.com", "wixsite.com", "blogspot.com", "netlify.app",
                "vercel.app", "weebly.com")


def registrable_domain(host: str) -> str:
    parts = host.lower().split(".")
    if len(parts) <= 2:
        return host.lower()
    return ".".join(parts[-3:] if len(parts[-1]) == 2 and parts[-2] in SECOND_LEVEL else parts[-2:])


def rdap_lookup(website: Optional[str], fetcher) -> Lookup:
    host = urlparse(website or "").hostname
    if not host:
        return Lookup(ok=False, error="no website", checked_at=_now())
    if any(host == h or host.endswith("." + h) for h in SHARED_HOSTS):
        return Lookup(ok=False, error="shared hosting domain (age says nothing)", checked_at=_now())
    domain = registrable_domain(host)
    url = f"https://rdap.org/domain/{domain}"
    data, err = _json(fetcher, url)
    if err:
        return Lookup(ok=False, error=err, checked_at=_now())
    reg = next((e.get("eventDate") for e in data.get("events", []) if e.get("eventAction") == "registration"), None)
    try:
        when = datetime.fromisoformat(str(reg).replace("Z", "+00:00"))
    except ValueError:
        return Lookup(ok=False, error="no registration date in RDAP response", checked_at=_now())
    return Lookup(ok=True, checked_at=_now(), evidence_url=url,
                  data={"domain": domain, "registered_at": when.isoformat(),
                        "age_days": (datetime.now(timezone.utc) - when).days})


# --- OpenAlex (committee aggregates) --------------------------------------------------------------------------------

def norm_name(s: Optional[str]) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


STOP = {"university", "universidad", "universite", "universitat", "universita", "of", "the", "and", "for", "de", "di",
        "da", "del", "la", "department", "dept", "inc", "ltd"}


def _key_tokens(s: Optional[str]) -> list[str]:
    return [t for t in norm_name(s).split() if len(t) > 2 and t not in STOP]


def same_name(a: str, b: str) -> bool:
    x, y = norm_name(a).split(), norm_name(b).split()
    if not x or not y:
        return False
    return sorted(x) == sorted(y) or (x[-1] == y[-1] and x[0][0] == y[0][0])


def same_institution(stated: str, cand: str) -> bool:
    """Same rule as backend lookups.sameInstitution: strict, a missed match is preferable to a false one."""
    a, b = list(dict.fromkeys(_key_tokens(stated))), list(dict.fromkeys(_key_tokens(cand)))
    if not a or not b:
        return False
    if len(a) == len(b) and all(t in b for t in a):
        return True
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    return len(short) >= 2 and all(t in long_ for t in short)


def sample_members(members: list, n: int = COMMITTEE_SAMPLE) -> list:
    if len(members) <= n:
        return list(members)
    step = len(members) / n
    return [members[int(i * step)] for i in range(n)]


def _institutions(author: dict) -> list[str]:
    names = [i.get("display_name") for i in author.get("last_known_institutions") or [] if isinstance(i, dict)]
    names += [(a.get("institution") or {}).get("display_name") for a in author.get("affiliations") or [] if isinstance(a, dict)]
    return list(dict.fromkeys(n for n in names if n))


def committee_lookup(committee: list, fetcher, cache: dict) -> Lookup:
    members = [m for m in committee if getattr(m, "name", None)]
    if not members:
        return Lookup(ok=False, error="no committee listed", checked_at=_now())
    mailto = os.getenv("OPENALEX_MAILTO", "").strip()
    results = []
    for m in sample_members(members):
        ck = f"{norm_name(m.name)}|{norm_name(m.affiliation)}"
        hit = cache.get(ck)
        if hit and hit.get("at", "") >= (datetime.now(timezone.utc) - timedelta(days=TTL_DAYS["committee"])).isoformat():
            results.append(hit)
            continue
        url = f"https://api.openalex.org/authors?search={quote(m.name)}&per-page=10" + (f"&mailto={quote(mailto)}" if mailto else "")
        data, err = _json(fetcher, url)
        if err:
            results.append({"ok": False})
            continue
        cands = [a for a in data.get("results", []) if same_name(m.name, a.get("display_name", ""))]
        inst = any(same_institution(m.affiliation, i) for a in cands for i in _institutions(a)) if m.affiliation else None
        r = {"ok": True, "resolved": bool(cands), "has_aff": bool(m.affiliation), "inst": inst, "at": _now()}
        cache[ck] = r                       # cache key = normalised name; stored only in local state.json (gitignored)
        results.append(r)
    done = [r for r in results if r.get("ok")]
    if not done:
        return Lookup(ok=False, error=f"all {len(results)} OpenAlex lookups failed", checked_at=_now())
    with_aff = [r for r in done if r["has_aff"]]
    return Lookup(ok=True, checked_at=_now(), evidence_url="https://api.openalex.org/authors",
                  data={"listed": len(members), "sampled": len(results), "looked_up": len(done),
                        "failed_lookups": len(results) - len(done), "resolved": sum(r["resolved"] for r in done),
                        "with_stated_affiliation": len(with_aff), "institution_matches": sum(bool(r["inst"]) for r in with_aff)})


# --- driver ---------------------------------------------------------------------------------------------------------

def input_hash(c: Conference) -> str:
    host = urlparse(c.website_url or "").hostname or ""
    names = sorted(norm_name(m.name) for m in c.committee)
    return hashlib.sha256(json.dumps([c.dblp_key, registrable_domain(host) if host else "", names]).encode()).hexdigest()[:16]


def _fresh(lk: Optional[Lookup], kind: str, now: datetime) -> bool:
    return bool(lk and lk.checked_at >= (now - timedelta(days=TTL_DAYS[kind])).isoformat(timespec="seconds"))


def run_lookups(confs: list[Conference], *, fetcher, store, metrics: Metrics, logger: logging.Logger,
                max_per_run: int = 200, only: Optional[set[str]] = None, now: Optional[datetime] = None) -> dict:
    """Mutates confs in place. A record is looked up when new, when its inputs changed, or when a result is stale."""
    now_dt = now or datetime.now(timezone.utc)
    oa_cache = store.state.setdefault("openalex_authors", {})
    rep = {"looked_up": 0, "reused": 0, "skipped_budget": 0}
    for c in confs:
        if only is not None and c.conference_id not in only:
            continue
        h = input_hash(c)
        lk = c.lookups if c.lookups and c.lookups.input_hash == h else Lookups(input_hash=h)
        todo = [k for k in ("dblp", "rdap", "committee") if not _fresh(getattr(lk, k), k, now_dt)]
        if not todo:
            rep["reused"] += 1
            continue
        if rep["looked_up"] >= max_per_run:
            rep["skipped_budget"] += 1
            continue
        rep["looked_up"] += 1
        if "dblp" in todo:
            lk.dblp = dblp_lookup(c.dblp_key, fetcher)
        if "rdap" in todo:
            lk.rdap = rdap_lookup(c.website_url, fetcher)
        if "committee" in todo:
            lk.committee = committee_lookup(c.committee, fetcher, oa_cache)
        c.lookups = lk
        for k in todo:
            metrics.inc("lookups", f"{k}_{'ok' if getattr(lk, k).ok else 'failed'}")
        log(logger, logging.DEBUG, "lookups", conference=c.acronym, ran=todo)
    return rep


def settings_from_env() -> dict:
    try:
        n = max(0, int(os.getenv("MAX_LOOKUPS_PER_RUN", 200)))
    except ValueError:
        n = 200
    return {"disabled": os.getenv("DISABLE_LIVE_LOOKUPS", "").strip().lower() == "true", "max_per_run": n}
