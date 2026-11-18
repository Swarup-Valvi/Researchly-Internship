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
