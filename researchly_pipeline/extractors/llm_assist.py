"""Optional LLM-assisted extraction, designed so the model can NOT introduce facts.

Contract: the model must return, for each field, {"evidence": "<exact quote from the page>"}.
We keep a field only if the quote really occurs in the page text, then derive the VALUE ourselves
from that quote with the normal parsers. Anything not grounded is dropped (-> null).
Records produced this way are flagged extraction_method="llm_assisted" (confidence weight 0.5).
"""
from __future__ import annotations

import json
import os
import re
from typing import Callable, Optional

import httpx

FIELDS = ["name", "dates", "location", "submission_deadline", "notification_date", "camera_ready", "publisher"]

PROMPT = """Extract conference call-for-papers facts from the page text below.
Return ONLY JSON: {{"<field>": {{"evidence": "<exact substring copied from the text>"}} }}
Fields: {fields}. Omit a field if the text does not state it. Never infer or guess. Never paraphrase evidence.

PAGE TEXT:
{text}
"""

LLMFn = Callable[[str], str]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def ground(response_json: str, page_text: str) -> dict[str, str]:
    """Keep only fields whose evidence quote appears verbatim (whitespace/case-insensitive) in the page."""
    try:
        data = json.loads(response_json)
    except (json.JSONDecodeError, TypeError):
        m = re.search(r"\{.*\}", response_json or "", re.S)
        try:
            data = json.loads(m.group(0)) if m else {}
        except json.JSONDecodeError:
            return {}
    haystack = _norm(page_text)
    kept: dict[str, str] = {}
    for field in FIELDS:
        item = data.get(field) if isinstance(data, dict) else None
        quote = item.get("evidence") if isinstance(item, dict) else None
        if isinstance(quote, str) and len(quote) >= 3 and _norm(quote) in haystack:
            kept[field] = quote.strip()
    return kept


def extract(page_text: str, llm: LLMFn, max_chars: int = 12000) -> dict[str, str]:
    prompt = PROMPT.format(fields=", ".join(FIELDS), text=page_text[:max_chars])
    return ground(llm(prompt), page_text[:max_chars])


DEFAULT_MODEL = "gemini-2.5-flash"  # override with GEMINI_MODEL; the model name is recorded in per-field provenance


def model_name() -> str:
    return os.getenv("GEMINI_MODEL") or DEFAULT_MODEL


def parse_json(response: str):
    """Best-effort JSON from a model response (tolerates code fences / leading prose). Never raises."""
    try:
        return json.loads(response)
    except (json.JSONDecodeError, TypeError):
        m = re.search(r"[\[{].*[\]}]", response or "", re.S)
        try:
            return json.loads(m.group(0)) if m else None
        except json.JSONDecodeError:
            return None


def gemini_llm(model: Optional[str] = None, api_key: Optional[str] = None, timeout: float = 30.0) -> Optional[LLMFn]:
    """Return a callable backed by the Gemini REST API, or None if no key is configured (clean skip)."""
    model = model or model_name()
    key = api_key or os.getenv("GEMINI_API_KEY")
    if not key:
        return None

    def call(prompt: str) -> str:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}}
        r = httpx.post(url, params={"key": key}, json=body, timeout=timeout)
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]

    return call


# --- optional discovery: Gemini + Google Search grounding ---------------------------------------------------------
# Results are ONLY candidate URLs. They are fetched by the normal Fetcher (robots.txt, rate limit) and any evidence
# still needs a quote verified against the fetched page. Nothing the model writes here becomes data.

DISCOVERY_PROMPT = """Find the official web pages for the academic conference "{name}" ({acronym} {year}), official
site {site}: (1) its proceedings page, (2) its publisher's page for these proceedings, (3) its organiser's page about it.
Return ONLY JSON: {{"urls": ["https://..."]}} with at most 3 URLs you found via search. Return [] if unsure."""

_URL = re.compile(r"https?://[^\s\"'<>)\]]+")
_REDIRECT_HOSTS = ("vertexaisearch.cloud.google.com", "google.com/url")


def candidate_urls(response_json: dict) -> list[str]:
    """URLs written in the answer text plus grounding-chunk URIs; Google redirect links are dropped."""
    out: list[str] = []
    try:
        cand = response_json["candidates"][0]
    except (KeyError, IndexError, TypeError):
        return []
    text = " ".join(p.get("text", "") for p in cand.get("content", {}).get("parts", []) if isinstance(p, dict))
    data = parse_json(text)
    urls = data.get("urls", []) if isinstance(data, dict) else _URL.findall(text)
    for ch in (cand.get("groundingMetadata") or {}).get("groundingChunks", []) or []:
        u = (ch.get("web") or {}).get("uri") if isinstance(ch, dict) else None
        if u:
            urls.append(u)
    for u in urls:
        if isinstance(u, str) and u.startswith(("http://", "https://")) and not any(h in u for h in _REDIRECT_HOSTS):
            u = u.rstrip(".,;")
            if u not in out:
                out.append(u)
    return out[:3]


def gemini_search_discovery(model: Optional[str] = None, api_key: Optional[str] = None, timeout: float = 40.0):
    """-> callable(conference) -> list[str], or None without a key. Opt-in via ENABLE_SEARCH_DISCOVERY=true."""
    model = model or model_name()
    key = api_key or os.getenv("GEMINI_API_KEY")
    if not key:
        return None

    def discover(c) -> list[str]:
        prompt = DISCOVERY_PROMPT.format(name=c.canonical_name, acronym=c.acronym or "", year=c.year, site=c.website_url)
        body = {"contents": [{"parts": [{"text": prompt}]}], "tools": [{"google_search": {}}],
                "generationConfig": {"temperature": 0}}
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        r = httpx.post(url, params={"key": key}, json=body, timeout=timeout)
        r.raise_for_status()
        return candidate_urls(r.json())

    return discover
