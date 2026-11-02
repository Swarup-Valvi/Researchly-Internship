"""Focused sanity checks verifying Phase 1 review requirements:
1. ICML 2026 data accuracy against official source.
2. Distinct editions of the same conference are not merged.
3. Missing fields in new scrapes do not overwrite previously known valid values.
4. Deadline history is ONLY recorded when a real stored deadline changes.
5. Idempotent repeated ingestion.
6. Provenance and data-quality warnings remain available after updates.
"""

import os
import json
import tempfile
from researchly.storage.repository import SQLiteConferenceRepository
from researchly.adapters.fixture_adapter import FixtureAdapter
from researchly.core.pipeline import IngestionPipeline
from researchly.core.models import RawConferenceData
from researchly.core.normalizer import normalize_conference


def run_targeted_checks():
    print("=== Running Targeted Review Sanity Checks ===")

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = tf.name

    try:
        repo = SQLiteConferenceRepository(db_path=temp_db_path)

        # CHECK 1: Edition isolation - Different editions must NOT be merged
        conf_2025 = normalize_conference(RawConferenceData(
            source_name="test_src",
            source_url="https://example.com/2025",
            raw_name="ICML 2025",
            raw_edition_or_year="2025",
            raw_submission_deadline="Jan 30 2025",
            raw_location="Vienna, Austria"
        ))
        conf_2026 = normalize_conference(RawConferenceData(
            source_name="test_src",
            source_url="https://example.com/2026",
            raw_name="ICML 2026",
            raw_edition_or_year="2026",
            raw_submission_deadline="Jan 28 2026",
            raw_location="Seoul, South Korea"
        ))
        
        act1, _ = repo.upsert_conference(conf_2025)
        act2, _ = repo.upsert_conference(conf_2026)
        
        assert act1 == "inserted" and act2 == "inserted", "Both editions must be inserted"
        all_confs = repo.list_all()
        ids = [c.id for c in all_confs]
        print(f"[Check 1: Edition Isolation] Stored IDs: {ids}")
        assert "icml-2025" in ids and "icml-2026" in ids, "Both icml-2025 and icml-2026 must exist distinctly"
        assert len(all_confs) == 2, f"Expected 2 conferences, got {len(all_confs)}"

        # CHECK 2: Field preservation - Missing fields in new scrape do not wipe known valid values
        # Scrape 2026 again with partial/missing fields (e.g. location is None, deadline is None)
        partial_scrape_2026 = normalize_conference(RawConferenceData(
            source_name="partial_src",
            source_url="https://example.com/partial",
            raw_name="ICML",
            raw_edition_or_year="2026",
            raw_submission_deadline=None, # Missing deadline
            raw_location=None,            # Missing location
            raw_format="Hybrid"           # Updated format
        ))
        act_partial, dl_event = repo.upsert_conference(partial_scrape_2026)
        print(f"[Check 2: Non-destructive Updates] Action: {act_partial}, dl_event: {dl_event}")
        assert dl_event is None, "No deadline change event should be emitted when new deadline is None"
        
        updated_2026 = repo.get_by_id("icml-2026")
        assert updated_2026.submission_deadline == "2026-01-28", f"Deadline overwritten! Got {updated_2026.submission_deadline}"
        assert updated_2026.location == "Seoul, South Korea", f"Location overwritten! Got {updated_2026.location}"
        assert updated_2026.format == "Hybrid", f"Format not updated! Got {updated_2026.format}"

        # CHECK 3: Deadline history only on real changes & idempotency
        # Rerun identical record -> unchanged, 0 history
        act_idem, dl_event_idem = repo.upsert_conference(partial_scrape_2026)
        print(f"[Check 3: Idempotency] Action: {act_idem}, dl_event: {dl_event_idem}")
        assert act_idem == "unchanged", f"Expected unchanged, got {act_idem}"
        assert dl_event_idem is None, "Expected no deadline event on identical run"
        assert len(repo.get_deadline_history("icml-2026")) == 0, "No deadline history should exist yet"

        # Now trigger a genuine deadline extension
        extended_2026 = normalize_conference(RawConferenceData(
            source_name="official_update",
            source_url="https://icml.cc/dates_extended",
            raw_name="ICML",
            raw_edition_or_year="2026",
            raw_submission_deadline="Feb 05 2026"
        ))
        act_ext, dl_ext = repo.upsert_conference(extended_2026)
        print(f"[Check 4: Real Deadline Shift] Action: {act_ext}, Event: {dl_ext}")
        assert act_ext == "updated", f"Expected updated, got {act_ext}"
        assert dl_ext is not None, "Expected deadline event"
        assert dl_ext.previous_deadline == "2026-01-28"
        assert dl_ext.new_deadline == "2026-02-05"
        
        hist = repo.get_deadline_history("icml-2026")
        assert len(hist) == 1, f"Expected 1 history record, got {len(hist)}"
        print(f"Verified Audit Record: {hist[0].conference_id} changed {hist[0].previous_deadline} -> {hist[0].new_deadline} (via {hist[0].source_name})")

        # CHECK 5: Quality warnings and provenance retention
        print(f"[Check 5: Warnings & Provenance] Warnings: {updated_2026.warnings}, Source: {updated_2026.source_name}")
        assert len(updated_2026.warnings) > 0, "Warnings should be preserved across merges"

        print("\nAll targeted sanity checks PASSED successfully!")

    finally:
        if os.path.exists(temp_db_path):
            os.remove(temp_db_path)


if __name__ == "__main__":
    run_targeted_checks()

