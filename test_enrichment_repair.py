"""Stubbed tests for AI enrichment retries, validation, and API fields."""

from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))

from researchly.core.models import NormalizedConference
from researchly.core.scheduler import ScrapingScheduler
from researchly.llm import (
    DualLLMEnricher,
    LLMExtractionResult,
    parse_llm_payload,
)
from researchly.storage.raw_store import RawCollectionStore
from researchly.storage.repository import SQLiteConferenceRepository


def _valid_result(**overrides) -> LLMExtractionResult:
    result = LLMExtractionResult(
        raw_name="NeurIPS",
        raw_edition_or_year="2026",
        raw_topics=["machine learning"],
        raw_submission_deadline="May 20, 2026",
        raw_location="San Diego, USA",
        raw_official_website="https://neurips.cc",
        event_type="conference",
        academic_level="professional",
        has_paper_submission=True,
        submission_url="https://neurips.cc/submit",
        extraction_confidence=0.91,
        model_used="gemini-test",
    )
    for key, value in overrides.items():
        setattr(result, key, value)
    return result


class _StubProcessor:
    def __init__(self, name: str, configured: bool = True, result=None):
        self.queue_name = name
        self.model_name = f"{name}-test"
        self._configured = configured
        self._result = result
        self.calls = []

    def is_configured(self) -> bool:
        return self._configured

    def extract(self, raw_record):
        self.calls.append(raw_record.raw_content)
        if isinstance(self._result, Exception):
            raise self._result
        return self._result


class EnrichmentRepairTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.db_path = self._tmp.name
        self._tmp.close()
        self.store = RawCollectionStore(self.db_path)

    def tearDown(self):
        try:
            os.unlink(self.db_path)
        except OSError:
            pass

    def _enricher(self, gemini_result=None, deepseek_result=None, cooldown=120, gemini_on=True, deepseek_on=True):
        enricher = DualLLMEnricher(db_path=self.db_path, retry_cooldown_seconds=cooldown)
        enricher.gemini = _StubProcessor("gemini", gemini_on, gemini_result)
        enricher.deepseek = _StubProcessor("deepseek", deepseek_on, deepseek_result)
        return enricher

    def _save(self, content: str, source_name="public_cfp_feed", content_type="html", url="https://example.edu/cfp"):
        return self.store.save(url, source_name, content, content_type=content_type)

    def _processed_at(self, row_id: int):
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute("SELECT processed_at FROM raw_scrape_cache WHERE id = ?", (row_id,)).fetchone()
        return row[0]

    def test_successful_enrichment_persists_level_and_provider(self):
        row_id = self._save("NeurIPS 2026 call for papers in San Diego.")
        enricher = self._enricher(_valid_result())
        outcome = enricher.process_unprocessed_records(max_records=5)

        self.assertEqual(outcome["status"], "completed")
        self.assertEqual(outcome["successfully_enriched"], 1)
        self.assertIsNotNone(self._processed_at(row_id))
        stored = SQLiteConferenceRepository(self.db_path).get_by_id("neurips-2026")
        self.assertIsNotNone(stored)
        self.assertEqual(stored.academic_level, "professional")
        self.assertEqual(stored.extracted_by_llm, "gemini-test")
        self.assertEqual(stored.source_name, "public_cfp_feed")
        self.assertEqual(stored.source_url, "https://example.edu/cfp")
        self.assertTrue(stored.has_paper_submission)

    def test_unknown_fields_stay_unknown(self):
        self._save("Horizon Forum gathering note without a CFP.")
        result = _valid_result(
            raw_name="Horizon Forum",
            raw_edition_or_year="2027",
            raw_topics=[],
            raw_submission_deadline=None,
            raw_location=None,
            raw_official_website=None,
            event_type=None,
            academic_level=None,
            has_paper_submission=None,
            submission_url=None,
            model_used="deepseek-test",
        )
        enricher = self._enricher(None, result)
        enricher.process_unprocessed_records(max_records=1)
        stored = SQLiteConferenceRepository(self.db_path).get_by_id("horizon-forum-2027")
        self.assertEqual(stored.academic_level, "unknown")
        self.assertEqual(stored.event_type, "unknown")
        self.assertFalse(stored.has_paper_submission)
        self.assertEqual(stored.paper_opportunity_status, "unverified")
        self.assertEqual(stored.submission_status, "Submission status unverified")
        self.assertEqual(stored.extracted_by_llm, "deepseek-test")

    def test_cache_hit_does_not_call_provider_again(self):
        row_id = self._save("NeurIPS 2026 call for papers.")
        enricher = self._enricher(_valid_result(), cooldown=0)
        enricher.process_unprocessed_records(max_records=1)
        self.assertEqual(len(enricher.gemini.calls), 1)

        with sqlite3.connect(self.db_path) as conn:
            conn.execute("UPDATE raw_scrape_cache SET processed_at = NULL WHERE id = ?", (row_id,))
            conn.commit()

        outcome = enricher.process_unprocessed_records(max_records=1)
        self.assertEqual(outcome["cache_hits"], 1)
        self.assertEqual(len(enricher.gemini.calls), 1)
        self.assertEqual(len(enricher.deepseek.calls), 0)
        self.assertIsNotNone(self._processed_at(row_id))

    def test_both_providers_failing_stays_retryable_without_tight_loop(self):
        row_id = self._save("Some scraped page about an event.")
        enricher = self._enricher(None, None, cooldown=3600)
        first = enricher.process_unprocessed_records(max_records=1)
        self.assertEqual(first["failed"], 1)
        self.assertIsNone(self._processed_at(row_id))
        self.assertEqual(len(enricher.gemini.calls), 1)

        second = enricher.process_unprocessed_records(max_records=1)
        self.assertEqual(second["status"], "no_pending_records")
        self.assertEqual(len(enricher.gemini.calls), 1)
        self.assertIsNone(self._processed_at(row_id))

        enricher.retry_cooldown_seconds = 0
        third = enricher.process_unprocessed_records(max_records=1)
        self.assertEqual(third["failed"], 1)
        self.assertEqual(len(enricher.gemini.calls), 2)
        self.assertIsNone(self._processed_at(row_id))
        counts = enricher.status()
        self.assertGreaterEqual(counts["failed"], 1)
        self.assertGreaterEqual(counts["pending"], 1)

    def test_missing_credentials_do_not_consume_pending_records(self):
        saved_gemini = os.environ.pop("GEMINI_API_KEY", None)
        saved_deepseek = os.environ.pop("DEEPSEEK_API_KEY", None)
        try:
            row_id = self._save("Pending page that must stay pending.")
            enricher = DualLLMEnricher(db_path=self.db_path)
            outcome = enricher.process_unprocessed_records(max_records=5)
            self.assertEqual(outcome["status"], "providers_unconfigured")
            self.assertIsNone(self._processed_at(row_id))
            self.assertEqual(enricher.status()["failed"], 0)
            self.assertEqual(enricher.status()["pending"], 1)
        finally:
            if saved_gemini is not None:
                os.environ["GEMINI_API_KEY"] = saved_gemini
            if saved_deepseek is not None:
                os.environ["DEEPSEEK_API_KEY"] = saved_deepseek

    def test_invalid_output_is_rejected_and_credibility_is_not_stored(self):
        self.assertIsNone(parse_llm_payload({"event_type": "conference"}, "gemini-test"))
        self.assertIsNone(parse_llm_payload(
            {"raw_name": "Bad Event", "event_type": "scopus-indexed", "academic_level": "professional"},
            "gemini-test",
        ))
        self.assertIsNone(parse_llm_payload(
            {"raw_name": "Bad Event", "has_paper_submission": "yes"},
            "gemini-test",
        ))
        parsed = parse_llm_payload(
            {
                "raw_name": "Quiet Symposium",
                "raw_edition_or_year": "2026",
                "credibility": "legitimate",
                "indexed_in_scopus": True,
                "risk_level": "low",
            },
            "gemini-test",
        )
        self.assertIsNotNone(parsed)
        self.assertFalse(hasattr(parsed, "credibility"))
        self.assertIsNone(parsed.academic_level)
        self.assertIsNone(parsed.event_type)

        row_id = self._save("not an event page")
        rejected = LLMExtractionResult(raw_name="Bad Event", event_type="scopus-indexed", model_used="gemini-test")
        enricher = self._enricher(rejected, rejected, cooldown=0)
        outcome = enricher.process_unprocessed_records(max_records=1)
        self.assertEqual(outcome["successfully_enriched"], 0)
        self.assertIsNone(self._processed_at(row_id))
        with sqlite3.connect(self.db_path) as conn:
            conferences = conn.execute("SELECT COUNT(*) FROM conferences").fetchone()[0]
            evidence = conn.execute("SELECT COUNT(*) FROM evidence_items").fetchone()[0]
        self.assertEqual(conferences, 0)
        self.assertEqual(evidence, 0)

    def test_does_not_overwrite_verified_values_or_provenance(self):
        repo = SQLiteConferenceRepository(self.db_path)
        existing = NormalizedConference(
            id="neurips-2026",
            name="NeurIPS",
            edition_or_year="2026",
            title="Conference on Neural Information Processing Systems",
            topics=["machine learning"],
            submission_deadline="2026-05-15",
            location="San Diego, USA",
            format="In-Person",
            publisher="NeurIPS Foundation",
            organizer="NeurIPS Foundation",
            official_website_url="https://neurips.cc",
            source_name="official_site",
            source_url="https://neurips.cc/Conferences/2026",
            first_discovered_at="2026-01-01T00:00:00Z",
            last_checked_at="2026-01-01T00:00:00Z",
            event_type="conference",
            academic_level="student",
            paper_opportunity_status="confirmed",
            has_paper_submission=True,
            submission_status="Open",
            event_status="Upcoming",
            status="Upcoming — deadline open",
        )
        repo.upsert_conference(existing)
        self._save("NeurIPS listing with missing fields.")
        weaker = _valid_result(
            raw_location=None,
            raw_publisher=None,
            raw_submission_deadline=None,
            event_type=None,
            academic_level=None,
            has_paper_submission=None,
            raw_official_website=None,
            model_used="gemini-test",
        )
        enricher = self._enricher(weaker)
        enricher.process_unprocessed_records(max_records=1)
        stored = repo.get_by_id("neurips-2026")
        self.assertEqual(stored.source_name, "official_site")
        self.assertEqual(stored.source_url, "https://neurips.cc/Conferences/2026")
        self.assertEqual(stored.location, "San Diego, USA")
        self.assertEqual(stored.publisher, "NeurIPS Foundation")
        self.assertEqual(stored.submission_deadline, "2026-05-15")
        self.assertEqual(stored.academic_level, "student")
        self.assertTrue(stored.has_paper_submission)
        self.assertEqual(stored.extracted_by_llm, "gemini-test")

    def test_pdf_text_is_used_without_downloading(self):
        row_id = self._save("%PDF-1.4\nstored-bytes", content_type="pdf", url="https://example.edu/cfp.pdf")

        def _explode(*_args, **_kwargs):
            raise AssertionError("enrichment must not download PDFs")

        with patch("researchly.core.pdf_extractor.fetch_and_extract_pdf", _explode), patch(
            "researchly.llm.text_from_stored_pdf",
            return_value="Student Research Workshop 2026 submission deadline June 2, 2026",
        ):
            enricher = self._enricher(_valid_result(
                raw_name="Student Research Workshop",
                raw_edition_or_year="2026",
                event_type="workshop",
                academic_level="student",
            ))
            enricher.process_unprocessed_records(max_records=1)

        self.assertIn("Student Research Workshop", enricher.gemini.calls[0])
        stored = SQLiteConferenceRepository(self.db_path).get_by_id("student-research-workshop-2026")
        self.assertEqual(stored.academic_level, "student")
        self.assertEqual(stored.event_type, "workshop")
        self.assertIsNotNone(self._processed_at(row_id))

        self._save("%PDF-1.4\nnot-a-real-pdf", content_type="pdf", url="https://example.edu/other.pdf")
        enricher = self._enricher(_valid_result(), cooldown=0)
        before = len(enricher.gemini.calls)
        enricher.process_unprocessed_records(max_records=5)
        self.assertEqual(len(enricher.gemini.calls), before)

    def test_provider_fallback_and_single_flight(self):
        self._save("Needs the backup provider.")
        enricher = self._enricher(None, _valid_result(model_used="deepseek-test"))
        outcome = enricher.process_unprocessed_records(max_records=1)
        self.assertEqual(outcome["deepseek_extractions"], 1)
        self.assertEqual(len(enricher.gemini.calls), 1)
        self.assertEqual(len(enricher.deepseek.calls), 1)

        def _slow_extract(rec):
            time.sleep(0.4)
            return _valid_result()

        enricher.gemini.extract = _slow_extract
        self._save("Second page for overlap.", url="https://example.edu/second")
        results = []

        def _run():
            results.append(enricher.process_unprocessed_records(max_records=1))

        thread = threading.Thread(target=_run)
        thread.start()
        time.sleep(0.05)
        results.append(enricher.process_unprocessed_records(max_records=1))
        thread.join(timeout=2)
        self.assertTrue(any(item.get("status") == "rejected" for item in results))

    def test_batch_limit_is_capped_at_ten(self):
        for index in range(12):
            self._save(f"Event page {index}", url=f"https://example.edu/cfp/{index}")
        enricher = self._enricher(_valid_result(raw_edition_or_year=None), _valid_result(model_used="deepseek-test", raw_edition_or_year=None))
        outcome = enricher.process_unprocessed_records(max_records=50)
        self.assertLessEqual(outcome["total_evaluated"], 10)
        self.assertEqual(outcome["successfully_enriched"], outcome["total_evaluated"])


class SchedulerAndApiTests(unittest.TestCase):
    def test_scheduler_interval_overlap_and_errors(self):
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as handle:
            db_path = handle.name
        try:
            scheduler = ScrapingScheduler(db_path=db_path, interval_hours=6.0)
            self.assertEqual(scheduler.interval_seconds, 21600)
            scheduler._is_running_job = True
            rejected = scheduler.trigger_scrape()
            self.assertEqual(rejected["status"], "rejected")
            scheduler._is_running_job = False
            with patch("researchly.core.scheduler.IngestionPipeline.run", side_effect=RuntimeError("source down")):
                failed = scheduler.trigger_scrape()
            self.assertEqual(failed["status"], "failed")
            self.assertFalse(scheduler._is_running_job)
            status = scheduler.get_status()
            self.assertEqual(status["interval_hours"], 6.0)
        finally:
            os.unlink(db_path)

    def test_api_exposes_enrichment_fields_without_calling_providers(self):
        saved_gemini = os.environ.get("GEMINI_API_KEY")
        saved_deepseek = os.environ.get("DEEPSEEK_API_KEY")
        os.environ["GEMINI_API_KEY"] = ""
        os.environ["DEEPSEEK_API_KEY"] = ""
        from fastapi.testclient import TestClient
        from researchly.api import main as api

        probe_id = "zz-enrichment-api-probe"
        probe = NormalizedConference(
            id=probe_id,
            name="ZZ Enrichment Probe",
            edition_or_year="2026",
            source_name="official_site",
            source_url="https://example.edu/probe",
            first_discovered_at="2026-01-01T00:00:00Z",
            last_checked_at="2026-01-01T00:00:00Z",
            academic_level="student",
            extracted_by_llm="gemini-test",
            event_type="workshop",
            has_paper_submission=False,
            paper_opportunity_status="attendance_only",
        )
        api.repo.upsert_conference(probe)
        try:
            with TestClient(api.app) as client:
                health = client.get("/api/health")
                self.assertEqual(health.status_code, 200)

                status = client.get("/api/enrichment/status")
                self.assertEqual(status.status_code, 200)
                body = status.json()
                for key in ("pending", "processed", "failed", "cached"):
                    self.assertIn(key, body)
                self.assertNotIn("api_key", status.text.lower())
                self.assertNotIn("GEMINI_API_KEY", status.text)
                self.assertFalse(body["gemini_configured"])
                self.assertFalse(body["deepseek_configured"])

                listed = client.get("/api/conferences", params={"event_type": "workshop", "include_historical": True})
                self.assertEqual(listed.status_code, 200)
                match = next(item for item in listed.json() if item["id"] == probe_id)
                self.assertEqual(match["academic_level"], "student")
                self.assertEqual(match["extracted_by_llm"], "gemini-test")

                single = client.get(f"/api/conferences/{probe_id}")
                self.assertEqual(single.status_code, 200)
                self.assertEqual(single.json()["academic_level"], "student")
                self.assertEqual(single.json()["extracted_by_llm"], "gemini-test")

                credibility = client.get(f"/api/credibility/{probe_id}")
                self.assertEqual(credibility.status_code, 200)

                too_many = client.post("/api/enrichment/run", params={"limit": 11})
                self.assertEqual(too_many.status_code, 400)
                triggered = client.post("/api/enrichment/run", params={"limit": 1})
                self.assertEqual(triggered.status_code, 200)
                self.assertEqual(triggered.json()["status"], "providers_unconfigured")

                api.enricher._running = True
                busy = client.post("/api/enrichment/run", params={"limit": 1})
                self.assertEqual(busy.status_code, 409)
                api.enricher._running = False
        finally:
            api.enricher._running = False
            with sqlite3.connect(api.db_path) as conn:
                conn.execute("DELETE FROM conferences WHERE id = ?", (probe_id,))
                conn.commit()
            if saved_gemini is None:
                os.environ.pop("GEMINI_API_KEY", None)
            else:
                os.environ["GEMINI_API_KEY"] = saved_gemini
            if saved_deepseek is None:
                os.environ.pop("DEEPSEEK_API_KEY", None)
            else:
                os.environ["DEEPSEEK_API_KEY"] = saved_deepseek


if __name__ == "__main__":
    unittest.main()
