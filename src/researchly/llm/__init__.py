"""Dual Gemini + DeepSeek AI enrichment and queue processing engine.

Credentials come from the environment. Providers stay disabled when those
credentials are absent. Successful extractions are cached by content hash.
Failed attempts stay retryable and are never marked processed.
"""

from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
import threading
import time
import urllib.request
import urllib.error
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from ..core.models import (
    RawConferenceData,
    AcademicLevel,
    EventType,
    PaperOpportunityStatus,
    SubmissionLifecycleStatus,
)
from ..core.normalizer import normalize_conference
from ..core.pdf_extractor import text_from_stored_pdf
from ..storage.repository import SQLiteConferenceRepository
from ..storage.raw_store import RawCollectionStore, RawScrapeRecord

logger = logging.getLogger("researchly.llm.enrichment")

_ALLOWED_EVENT_TYPES = {item.value for item in EventType if item != EventType.UNKNOWN}
_ALLOWED_LEVELS = {item.value for item in AcademicLevel if item != AcademicLevel.UNKNOWN}
_NULL_TOKENS = {"", "null", "none", "n/a", "na", "unknown", "unspecified"}
_CREDIBILITY_KEYS = {
    "indexing",
    "indexed",
    "indexed_in",
    "indexed_in_scopus",
    "scopus",
    "sci",
    "scie",
    "esci",
    "wos",
    "web_of_science",
    "predatory",
    "is_predatory",
    "credibility",
    "credibility_status",
    "risk_level",
    "publisher_legitimate",
    "legitimate_publisher",
    "bealls",
    "impact_factor",
}
_EVENT_EVIDENCE = (
    ("workshop", "workshop"),
    ("symposium", "symposium"),
    ("colloquium", "colloquium"),
    ("doctoral consortium", "colloquium"),
    ("seminar", "seminar"),
    ("webinar", "seminar"),
    ("summit", "summit"),
    ("conference", "conference"),
    ("congress", "conference"),
)
_LEVEL_EVIDENCE = (
    ("student", "student"),
    ("doctoral", "student"),
    ("graduate", "student"),
    ("phd", "student"),
    ("undergraduate", "student"),
    ("university", "university"),
    ("college", "university"),
    ("department", "university"),
    ("interdisciplinary", "interdisciplinary"),
    ("multidisciplinary", "interdisciplinary"),
    ("cross-disciplinary", "interdisciplinary"),
)


def _redact(text: str) -> str:
    """Remove credential material from a log or stored error string."""
    cleaned = text or ""
    for env_name in ("GEMINI_API_KEY", "DEEPSEEK_API_KEY"):
        secret = os.environ.get(env_name) or ""
        if secret:
            cleaned = cleaned.replace(secret, "[REDACTED]")
    cleaned = re.sub(r"(key=)[^&\s]+", r"\1[REDACTED]", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"(Bearer\s+)\S+", r"\1[REDACTED]", cleaned, flags=re.IGNORECASE)
    return cleaned[:300]


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


@dataclass
class LLMExtractionResult:
    """Structured output produced by an LLM extraction run."""
    raw_name: Optional[str] = None
    raw_edition_or_year: Optional[str] = None
    raw_topics: List[str] = field(default_factory=list)
    raw_submission_deadline: Optional[str] = None
    raw_start_date: Optional[str] = None
    raw_end_date: Optional[str] = None
    raw_location: Optional[str] = None
    raw_format: Optional[str] = None
    raw_publisher: Optional[str] = None
    raw_organizer: Optional[str] = None
    raw_fees: Optional[str] = None
    raw_official_website: Optional[str] = None
    event_type: Optional[str] = None
    academic_level: Optional[str] = None
    has_paper_submission: Optional[bool] = None
    submission_url: Optional[str] = None
    extraction_confidence: float = 0.0
    model_used: str = "stub"
    is_stub: bool = False
    raw_response: Optional[str] = None


def validate_extraction_result(res: Optional[LLMExtractionResult]) -> Optional[LLMExtractionResult]:
    """Accept only a structurally valid extraction. Unknown stays unknown."""
    if res is None or res.is_stub:
        return None
    name = (res.raw_name or "").strip()
    if not name or name.lower() in _NULL_TOKENS:
        return None
    if res.event_type is not None and res.event_type not in _ALLOWED_EVENT_TYPES:
        return None
    if res.academic_level is not None and res.academic_level not in _ALLOWED_LEVELS:
        return None
    if res.has_paper_submission is not None and not isinstance(res.has_paper_submission, bool):
        return None
    if not isinstance(res.raw_topics, list) or any(not isinstance(topic, str) or not topic.strip() for topic in res.raw_topics):
        return None
    try:
        confidence = float(res.extraction_confidence)
    except (TypeError, ValueError):
        return None
    if confidence < 0 or confidence > 1:
        return None
    res.raw_name = name
    res.raw_topics = [topic.strip() for topic in res.raw_topics]
    res.extraction_confidence = confidence
    return res


def _optional_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError("unexpected boolean")
    if isinstance(value, (int, float)):
        value = str(value)
    if not isinstance(value, str):
        raise ValueError("unexpected type")
    text = value.strip()
    if text.lower() in _NULL_TOKENS:
        return None
    return text


def _optional_url(value: Any) -> Optional[str]:
    text = _optional_text(value)
    if text is None:
        return None
    if text.startswith("http://") or text.startswith("https://"):
        return text
    return None


def parse_llm_payload(parsed: Any, model_name: str, raw_text: str = "") -> Optional[LLMExtractionResult]:
    """Validate provider JSON. Credibility and indexing claims are discarded."""
    if isinstance(parsed, list):
        if len(parsed) == 1 and isinstance(parsed[0], dict):
            parsed = parsed[0]
        else:
            return None
    if not isinstance(parsed, dict):
        return None
    try:
        name = _optional_text(parsed.get("raw_name"))
        if not name:
            return None

        if "event_type" in parsed and parsed.get("event_type") is not None:
            event_type = _optional_text(parsed.get("event_type"))
            if event_type is not None:
                event_type = event_type.lower()
                if event_type not in _ALLOWED_EVENT_TYPES:
                    return None
        else:
            event_type = None

        if "academic_level" in parsed and parsed.get("academic_level") is not None:
            academic_level = _optional_text(parsed.get("academic_level"))
            if academic_level is not None:
                academic_level = academic_level.lower()
                if academic_level not in _ALLOWED_LEVELS:
                    return None
        else:
            academic_level = None

        if "has_paper_submission" not in parsed or parsed.get("has_paper_submission") is None:
            has_paper = None
        elif isinstance(parsed.get("has_paper_submission"), bool):
            has_paper = parsed["has_paper_submission"]
        else:
            return None

        topics_raw = parsed.get("raw_topics", [])
        if topics_raw is None:
            topics: List[str] = []
        elif not isinstance(topics_raw, list):
            return None
        else:
            topics = []
            for topic in topics_raw:
                if not isinstance(topic, str):
                    return None
                topic_text = _optional_text(topic)
                if topic_text:
                    topics.append(topic_text)

        if "extraction_confidence" in parsed and parsed.get("extraction_confidence") is not None:
            confidence = float(parsed["extraction_confidence"])
            if confidence < 0 or confidence > 1:
                return None
        else:
            confidence = 0.0

        result = LLMExtractionResult(
            raw_name=name,
            raw_edition_or_year=_optional_text(parsed.get("raw_edition_or_year")),
            raw_topics=topics,
            raw_submission_deadline=_optional_text(parsed.get("raw_submission_deadline")),
            raw_start_date=_optional_text(parsed.get("raw_start_date")),
            raw_end_date=_optional_text(parsed.get("raw_end_date")),
            raw_location=_optional_text(parsed.get("raw_location")),
            raw_format=_optional_text(parsed.get("raw_format")),
            raw_publisher=_optional_text(parsed.get("raw_publisher")),
            raw_organizer=_optional_text(parsed.get("raw_organizer")),
            raw_fees=_optional_text(parsed.get("raw_fees")),
            raw_official_website=_optional_url(parsed.get("raw_official_website")),
            event_type=event_type,
            academic_level=academic_level,
            has_paper_submission=has_paper,
            submission_url=_optional_url(parsed.get("submission_url")),
            extraction_confidence=confidence,
            model_used=model_name,
            is_stub=False,
            raw_response=raw_text,
        )
    except (TypeError, ValueError):
        return None
    return validate_extraction_result(result)


def _evidence_event_type(explicit: Optional[str], name: str, title: Optional[str]) -> str:
    if explicit in _ALLOWED_EVENT_TYPES:
        return explicit
    combined = f"{name} {title or ''}".lower()
    for needle, value in _EVENT_EVIDENCE:
        if needle in combined:
            return value
    return "unknown"


def _evidence_academic_level(explicit: Optional[str], name: str, title: Optional[str]) -> str:
    if explicit in _ALLOWED_LEVELS:
        return explicit
    combined = f"{name} {title or ''}".lower()
    for needle, value in _LEVEL_EVIDENCE:
        if needle in combined:
            return value
    return "unknown"


class BaseLLMQueueProcessor:
    """Abstract LLM queue processor."""
    queue_name: str = "base"
    max_retries: int = 3
    batch_size: int = 10

    def is_configured(self) -> bool:
        return False

    def _build_prompt(self, raw_content: str, content_type: str, source_url: str) -> str:
        clean_content = raw_content[:4000] if len(raw_content) > 4000 else raw_content
        return f"""You are an academic event data extraction specialist.

Scraped from: {source_url}
Content format: {content_type}

Extract metadata for an academic conference, workshop, symposium, or research event.
STRICT INSTRUCTIONS:
1. Return ONLY a valid JSON object matching the schema below.
2. Use null for ANY unknown or unannounced information. NEVER fabricate dates, deadlines, locations, event type, academic level, or paper-submission status.
3. event_type must be one of "conference", "workshop", "symposium", "colloquium", "seminar", "summit", or null.
4. academic_level must be one of "professional", "university", "student", "interdisciplinary", or null.
5. has_paper_submission must be true only when the text describes a paper or CFP track, false only when the text says there is no paper track, otherwise null.
6. Do NOT make claims about indexing, publisher legitimacy, predatory status, or credibility.

JSON Schema:
{{
  "raw_name": "<event name or acronym, or null if this is not an event>",
  "raw_edition_or_year": "<year or edition, or null>",
  "raw_topics": ["<topic>"],
  "raw_submission_deadline": "<deadline date string, or null>",
  "raw_start_date": "<start date string, or null>",
  "raw_end_date": "<end date string, or null>",
  "raw_location": "<City, Country or null>",
  "raw_format": "<In-Person | Virtual | Hybrid | null>",
  "raw_publisher": "<publisher name or null>",
  "raw_organizer": "<organizer name or null>",
  "raw_fees": "<fee string or null>",
  "raw_official_website": "<official URL or null>",
  "event_type": null,
  "academic_level": null,
  "has_paper_submission": null,
  "submission_url": null,
  "extraction_confidence": 0.0
}}

Content:
---
{clean_content}
---"""

    def extract(self, raw_record: RawScrapeRecord) -> Optional[LLMExtractionResult]:
        raise NotImplementedError


class GeminiQueueProcessor(BaseLLMQueueProcessor):
    """Google Gemini LLM extraction queue."""
    queue_name: str = "gemini"

    def __init__(
        self,
        model_name: str = "gemini-3.1-flash-lite",
        max_retries: int = 3,
        batch_size: int = 10,
    ):
        self.model_name = model_name
        self.max_retries = max_retries
        self.batch_size = batch_size

    def is_configured(self) -> bool:
        return bool(os.environ.get("GEMINI_API_KEY"))

    def extract(self, raw_record: RawScrapeRecord) -> Optional[LLMExtractionResult]:
        if not self.is_configured():
            logger.debug("Gemini not configured; skipping extraction.")
            return None

        api_key = os.environ["GEMINI_API_KEY"]
        prompt = self._build_prompt(raw_record.raw_content, raw_record.content_type, raw_record.source_url)
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent"
        payload = json.dumps({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"},
        }).encode("utf-8")

        for attempt in range(self.max_retries):
            try:
                req = urllib.request.Request(
                    url,
                    data=payload,
                    headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = json.loads(resp.read().decode("utf-8"))

                candidates = data.get("candidates", [])
                if not candidates or not isinstance(candidates, list):
                    return None
                parts = candidates[0].get("content", {}).get("parts", [])
                if not parts or not isinstance(parts, list):
                    return None
                text = parts[0].get("text", "")
                if not text:
                    return None
                parsed = json.loads(text)
                return parse_llm_payload(parsed, self.model_name, text)
            except Exception as exc:
                wait_sec = 2 ** attempt
                logger.warning(
                    "Gemini extraction attempt %d failed: %s (retrying in %ds)",
                    attempt + 1,
                    _redact(str(exc)),
                    wait_sec,
                )
                if attempt + 1 < self.max_retries:
                    time.sleep(wait_sec)

        return None


class DeepSeekQueueProcessor(BaseLLMQueueProcessor):
    """DeepSeek LLM extraction queue."""
    queue_name: str = "deepseek"

    def __init__(
        self,
        model_name: str = "deepseek-chat",
        max_retries: int = 3,
        batch_size: int = 10,
    ):
        self.model_name = model_name
        self.max_retries = max_retries
        self.batch_size = batch_size

    def is_configured(self) -> bool:
        return bool(os.environ.get("DEEPSEEK_API_KEY"))

    def extract(self, raw_record: RawScrapeRecord) -> Optional[LLMExtractionResult]:
        if not self.is_configured():
            logger.debug("DeepSeek not configured; skipping extraction.")
            return None

        api_key = os.environ["DEEPSEEK_API_KEY"]
        prompt = self._build_prompt(raw_record.raw_content, raw_record.content_type, raw_record.source_url)
        url = "https://api.deepseek.com/chat/completions"
        payload = json.dumps({
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
            "max_tokens": 1024,
        }).encode("utf-8")

        for attempt in range(self.max_retries):
            try:
                req = urllib.request.Request(
                    url,
                    data=payload,
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = json.loads(resp.read().decode("utf-8"))

                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                if not content:
                    return None
                parsed = json.loads(content)
                return parse_llm_payload(parsed, self.model_name, content)
            except urllib.error.HTTPError as exc:
                if exc.code == 402:
                    logger.warning("DeepSeek API returned 402 Payment Required. Falling back.")
                    return None
                wait_sec = 2 ** attempt
                logger.warning(
                    "DeepSeek attempt %d failed: %s (retrying in %ds)",
                    attempt + 1,
                    _redact(str(exc)),
                    wait_sec,
                )
                if attempt + 1 < self.max_retries:
                    time.sleep(wait_sec)
            except Exception as exc:
                wait_sec = 2 ** attempt
                logger.warning(
                    "DeepSeek attempt %d failed: %s (retrying in %ds)",
                    attempt + 1,
                    _redact(str(exc)),
                    wait_sec,
                )
                if attempt + 1 < self.max_retries:
                    time.sleep(wait_sec)

        return None


class DualLLMEnricher:
    """Coordinates Gemini and DeepSeek with fallback, caching, and retry limits."""

    def __init__(
        self,
        db_path: str = "researchly.db",
        preferred_provider: str = "gemini",
        retry_cooldown_seconds: int = 120,
    ):
        self.db_path = db_path
        self.preferred_provider = preferred_provider
        self.retry_cooldown_seconds = max(0, int(retry_cooldown_seconds))
        self.gemini = GeminiQueueProcessor()
        self.deepseek = DeepSeekQueueProcessor()
        self.raw_store = RawCollectionStore(db_path=db_path)
        self.repo = SQLiteConferenceRepository(db_path=db_path)
        self._run_lock = threading.Lock()
        self._running = False
        self._init_llm_cache_table()

    def _init_llm_cache_table(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS llm_extraction_cache (
                    content_hash TEXT PRIMARY KEY,
                    provider TEXT NOT NULL,
                    extracted_at TEXT NOT NULL,
                    confidence REAL,
                    result_json TEXT NOT NULL
                );
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS llm_enrichment_attempts (
                    content_hash TEXT PRIMARY KEY,
                    attempt_count INTEGER NOT NULL DEFAULT 0,
                    last_attempt_at TEXT,
                    last_error TEXT
                );
            """)
            conn.commit()

    def status(self) -> Dict[str, Any]:
        """Counts for pending, processed, failed, and cached records. No secrets."""
        cutoff = self._cooldown_cutoff()
        with sqlite3.connect(self.db_path) as conn:
            pending = conn.execute(
                "SELECT COUNT(*) FROM raw_scrape_cache WHERE processed_at IS NULL"
            ).fetchone()[0]
            processed = conn.execute(
                "SELECT COUNT(*) FROM raw_scrape_cache WHERE processed_at IS NOT NULL"
            ).fetchone()[0]
            failed = conn.execute(
                """
                SELECT COUNT(*) FROM raw_scrape_cache r
                JOIN llm_enrichment_attempts a ON a.content_hash = r.content_hash
                WHERE r.processed_at IS NULL AND a.attempt_count > 0
                """
            ).fetchone()[0]
            in_cooldown = conn.execute(
                """
                SELECT COUNT(*) FROM raw_scrape_cache r
                JOIN llm_enrichment_attempts a ON a.content_hash = r.content_hash
                WHERE r.processed_at IS NULL
                  AND a.attempt_count > 0
                  AND a.last_attempt_at IS NOT NULL
                  AND a.last_attempt_at > ?
                """,
                (cutoff,),
            ).fetchone()[0]
            cached = conn.execute("SELECT COUNT(*) FROM llm_extraction_cache").fetchone()[0]
        return {
            "pending": pending,
            "processed": processed,
            "failed": failed,
            "cached": cached,
            "in_cooldown": in_cooldown,
            "enrichment_running": self._running,
            "gemini_configured": self.gemini.is_configured(),
            "deepseek_configured": self.deepseek.is_configured(),
        }

    def process_unprocessed_records(self, max_records: int = 5) -> Dict[str, Any]:
        """Enrich a small batch. Failed rows stay unprocessed and are cooled down."""
        try:
            limit = int(max_records)
        except (TypeError, ValueError):
            limit = 5
        limit = max(1, min(limit, 10))

        with self._run_lock:
            if self._running:
                return {
                    "status": "rejected",
                    "reason": "An enrichment job is already running.",
                }
            self._running = True

        try:
            return self._process_limited(limit)
        finally:
            with self._run_lock:
                self._running = False

    def _process_limited(self, limit: int) -> Dict[str, Any]:
        if not self.gemini.is_configured() and not self.deepseek.is_configured():
            return {
                "status": "providers_unconfigured",
                "total_evaluated": 0,
                "successfully_enriched": 0,
                "cache_hits": 0,
                "gemini_extractions": 0,
                "deepseek_extractions": 0,
                "failed": 0,
            }

        cutoff = self._cooldown_cutoff()
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT r.* FROM raw_scrape_cache r
                LEFT JOIN llm_enrichment_attempts a ON a.content_hash = r.content_hash
                WHERE r.processed_at IS NULL
                  AND (a.last_attempt_at IS NULL OR a.last_attempt_at <= ?)
                ORDER BY r.id ASC
                LIMIT ?
                """,
                (cutoff, limit),
            ).fetchall()

        if not rows:
            return {"status": "no_pending_records", "processed": 0, "successfully_enriched": 0}

        records = [self.raw_store._to_model(row) for row in rows]
        gemini_count = 0
        deepseek_count = 0
        cache_hits = 0
        success_count = 0
        failed_count = 0

        for idx, rec in enumerate(records):
            prepared = self._prepare_record(rec)
            if prepared is None:
                self._record_failure(rec.content_hash, "pdf_extraction_unavailable")
                failed_count += 1
                continue

            cached_res = self._get_cached_result(rec.content_hash)
            if cached_res:
                cache_hits += 1
                self._apply_extraction_to_conference(cached_res, prepared)
                self.raw_store.mark_processed(rec.id)
                self._clear_failure(rec.content_hash)
                success_count += 1
                continue

            primary = self.gemini if (idx % 2 == 0 or not self.deepseek.is_configured()) else self.deepseek
            secondary = self.deepseek if primary is self.gemini else self.gemini
            res, used = self._extract_with_fallback(primary, secondary, prepared)
            if used == "gemini":
                gemini_count += 1
            elif used == "deepseek":
                deepseek_count += 1

            if res:
                self._save_cached_result(rec.content_hash, res)
                self._apply_extraction_to_conference(res, prepared)
                self.raw_store.mark_processed(rec.id)
                self._clear_failure(rec.content_hash)
                success_count += 1
            else:
                self._record_failure(rec.content_hash, "providers_failed")
                failed_count += 1

        return {
            "status": "completed",
            "total_evaluated": len(records),
            "successfully_enriched": success_count,
            "cache_hits": cache_hits,
            "gemini_extractions": gemini_count,
            "deepseek_extractions": deepseek_count,
            "failed": failed_count,
        }

    def _prepare_record(self, rec: RawScrapeRecord) -> Optional[RawScrapeRecord]:
        """Use stored PDF text when the raw row itself contains a PDF."""
        pdf_text = text_from_stored_pdf(rec.raw_content, rec.content_type)
        if pdf_text is None:
            return rec
        if not pdf_text.strip():
            return None
        return replace(rec, raw_content=pdf_text, content_type="text")

    def _extract_with_fallback(self, primary, secondary, rec: RawScrapeRecord):
        first = self._call_processor(primary, rec)
        if first:
            return first, primary.queue_name
        second = self._call_processor(secondary, rec)
        if second:
            return second, secondary.queue_name
        return None, None

    @staticmethod
    def _call_processor(processor, rec: RawScrapeRecord) -> Optional[LLMExtractionResult]:
        if not processor.is_configured():
            return None
        try:
            extracted = processor.extract(rec)
        except Exception as exc:
            logger.warning("%s extraction failed: %s", processor.queue_name, _redact(str(exc)))
            return None
        validated = validate_extraction_result(extracted)
        if validated and not validated.model_used:
            validated.model_used = processor.queue_name
        return validated

    def _cooldown_cutoff(self) -> str:
        moment = datetime.utcnow() - timedelta(seconds=self.retry_cooldown_seconds)
        return moment.isoformat() + "Z"

    def _record_failure(self, content_hash: str, reason: str) -> None:
        safe_reason = _redact(reason)[:120]
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO llm_enrichment_attempts (content_hash, attempt_count, last_attempt_at, last_error)
                VALUES (?, 1, ?, ?)
                ON CONFLICT(content_hash) DO UPDATE SET
                    attempt_count = attempt_count + 1,
                    last_attempt_at = excluded.last_attempt_at,
                    last_error = excluded.last_error
                """,
                (content_hash, _now_iso(), safe_reason),
            )
            conn.commit()

    def _clear_failure(self, content_hash: str) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM llm_enrichment_attempts WHERE content_hash = ?", (content_hash,))
            conn.commit()

    def _get_cached_result(self, content_hash: str) -> Optional[LLMExtractionResult]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM llm_extraction_cache WHERE content_hash = ?",
                (content_hash,),
            ).fetchone()
            if not row:
                return None
            try:
                payload = json.loads(row["result_json"])
            except (TypeError, json.JSONDecodeError):
                return None
        payload["extraction_confidence"] = row["confidence"] if row["confidence"] is not None else 0.0
        return parse_llm_payload(payload, row["provider"] or "cache")

    def _save_cached_result(self, content_hash: str, res: LLMExtractionResult):
        data_dict = {
            "raw_name": res.raw_name,
            "raw_edition_or_year": res.raw_edition_or_year,
            "raw_topics": res.raw_topics,
            "raw_submission_deadline": res.raw_submission_deadline,
            "raw_start_date": res.raw_start_date,
            "raw_end_date": res.raw_end_date,
            "raw_location": res.raw_location,
            "raw_format": res.raw_format,
            "raw_publisher": res.raw_publisher,
            "raw_organizer": res.raw_organizer,
            "raw_fees": res.raw_fees,
            "raw_official_website": res.raw_official_website,
            "event_type": res.event_type,
            "academic_level": res.academic_level,
            "has_paper_submission": res.has_paper_submission,
            "submission_url": res.submission_url,
        }
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO llm_extraction_cache
                    (content_hash, provider, extracted_at, confidence, result_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    content_hash,
                    res.model_used,
                    _now_iso(),
                    res.extraction_confidence,
                    json.dumps(data_dict),
                ),
            )
            conn.commit()

    def _apply_extraction_to_conference(self, res: LLMExtractionResult, rec: RawScrapeRecord):
        """Insert or fill gaps. Original provenance and stronger stored values stay."""
        metadata = {
            "extracted_by_llm": res.model_used,
            "extraction_confidence": res.extraction_confidence,
        }
        if res.event_type:
            metadata["event_type"] = res.event_type
        if res.academic_level:
            metadata["academic_level"] = res.academic_level
        if res.has_paper_submission is not None:
            metadata["has_paper_submission"] = res.has_paper_submission
        if res.submission_url:
            metadata["submission_url"] = res.submission_url

        raw_conf = RawConferenceData(
            source_name=rec.source_name,
            source_url=rec.source_url,
            raw_name=res.raw_name or "UNKNOWN",
            raw_edition_or_year=res.raw_edition_or_year,
            raw_topics=res.raw_topics,
            raw_submission_deadline=res.raw_submission_deadline,
            raw_start_date=res.raw_start_date,
            raw_end_date=res.raw_end_date,
            raw_location=res.raw_location,
            raw_format=res.raw_format,
            raw_publisher=res.raw_publisher,
            raw_organizer=res.raw_organizer,
            raw_fees=res.raw_fees,
            raw_official_website=res.raw_official_website,
            extra_metadata=metadata,
        )
        norm = normalize_conference(raw_conf)
        norm.event_type = _evidence_event_type(res.event_type, norm.name, norm.title)
        norm.academic_level = _evidence_academic_level(res.academic_level, norm.name, norm.title)
        norm.extracted_by_llm = res.model_used
        self._apply_paper_evidence(norm, res)

        existing = self.repo.get_by_id(norm.id)
        if existing is not None:
            norm = self._prefer_existing_verified(norm, existing)
        self.repo.upsert_conference(norm)

    @staticmethod
    def _apply_paper_evidence(norm, res: LLMExtractionResult) -> None:
        if res.has_paper_submission is False:
            norm.has_paper_submission = False
            norm.paper_opportunity_status = PaperOpportunityStatus.ATTENDANCE_ONLY.value
            norm.submission_status = SubmissionLifecycleStatus.NOT_ACCEPTING.value
            return
        if res.has_paper_submission is True or norm.submission_deadline or res.submission_url:
            norm.has_paper_submission = True
            if norm.submission_deadline:
                norm.paper_opportunity_status = PaperOpportunityStatus.CONFIRMED.value
            elif norm.paper_opportunity_status == PaperOpportunityStatus.UNVERIFIED.value:
                norm.paper_opportunity_status = PaperOpportunityStatus.INCOMPLETE.value
            return
        norm.has_paper_submission = False
        norm.paper_opportunity_status = PaperOpportunityStatus.UNVERIFIED.value
        norm.submission_status = SubmissionLifecycleStatus.UNVERIFIED.value

    @staticmethod
    def _prefer_existing_verified(norm, existing):
        """Keep original provenance and do not replace known values with weaker AI output."""
        norm.source_name = existing.source_name
        norm.source_url = existing.source_url
        norm.first_discovered_at = existing.first_discovered_at

        def keep(old, new, weak=()):
            if old is None:
                return new
            if isinstance(old, str) and old.strip().lower() in {"", "unknown", *weak}:
                return new
            return old

        norm.name = keep(existing.name, norm.name, weak=("UNKNOWN",))
        norm.edition_or_year = keep(existing.edition_or_year, norm.edition_or_year)
        norm.title = keep(existing.title, norm.title)
        norm.location = keep(existing.location, norm.location)
        norm.format = keep(existing.format, norm.format, weak=("Unknown",))
        norm.publisher = keep(existing.publisher, norm.publisher)
        norm.organizer = keep(existing.organizer, norm.organizer)
        norm.registration_fees = keep(existing.registration_fees, norm.registration_fees)
        norm.official_website_url = keep(existing.official_website_url, norm.official_website_url)
        norm.submission_url = keep(existing.submission_url, norm.submission_url)
        norm.start_date = keep(existing.start_date, norm.start_date)
        norm.end_date = keep(existing.end_date, norm.end_date)
        if existing.submission_deadline:
            norm.submission_deadline = existing.submission_deadline
            norm.raw_submission_deadline_str = existing.raw_submission_deadline_str
            norm.event_status = existing.event_status
            norm.submission_status = existing.submission_status
            norm.status = existing.status
        norm.event_type = keep(existing.event_type, norm.event_type)
        norm.academic_level = keep(existing.academic_level, norm.academic_level)
        if existing.paper_opportunity_status not in (None, "", "unverified"):
            norm.paper_opportunity_status = existing.paper_opportunity_status
            norm.has_paper_submission = existing.has_paper_submission
            if existing.submission_deadline:
                norm.submission_status = existing.submission_status
        if not norm.extracted_by_llm:
            norm.extracted_by_llm = existing.extracted_by_llm
        norm.topics = list(dict.fromkeys((existing.topics or []) + (norm.topics or [])))
        norm.warnings = list(dict.fromkeys((existing.warnings or []) + (norm.warnings or [])))
        return norm
