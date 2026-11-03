"""Minimal, focused sanity check for the Phase 1 Ingestion Pipeline."""

import os
import json
import tempfile
from researchly.storage.repository import SQLiteConferenceRepository
from researchly.adapters.fixture_adapter import FixtureAdapter
from researchly.core.pipeline import IngestionPipeline


def run_sanity_checks():
    print("=== Running Researchly Ingestion Pipeline Sanity Checks ===")

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = tf.name

    try:
        repo = SQLiteConferenceRepository(db_path=temp_db_path)

        # 1. First run with base sample fixture
        fixture_adapter = FixtureAdapter("fixtures/sample_conferences.json")
        pipeline = IngestionPipeline(repository=repo, adapters=[fixture_adapter])

        stats_run1, reports1 = pipeline.run()
        print(f"\n[Run 1 - Seed Ingest]")
        print(f"Discovered: {stats_run1.discovered}, Inserted: {stats_run1.inserted}, Updates: {stats_run1.updated}, Duplicates Skipped: {stats_run1.duplicates_skipped}")
        assert stats_run1.inserted == 4, f"Expected 4 inserted, got {stats_run1.inserted}"
        assert all(r.success for r in reports1), f"Expected all success, got {reports1}"

        # 2. Idempotency check: run again without data changes
        stats_run2, reports2 = pipeline.run()
        print(f"\n[Run 2 - Idempotency Check]")
        print(f"Discovered: {stats_run2.discovered}, Inserted: {stats_run2.inserted}, Updates: {stats_run2.updated}, Duplicates Skipped: {stats_run2.duplicates_skipped}")
        assert stats_run2.inserted == 0, "Expected 0 inserted on second run"
        assert stats_run2.updated == 0, "Expected 0 updated on second run"
        assert stats_run2.duplicates_skipped == 4, f"Expected 4 skipped duplicates, got {stats_run2.duplicates_skipped}"

        # 3. Deadline change detection
        # Create an updated fixture where NeurIPS deadline is extended from May 21 to May 28
        with open("fixtures/sample_conferences.json", "r") as f:
            data = json.load(f)

        data[0]["raw_submission_deadline"] = "May 28 2026 (Extended AoE)"
        
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f_temp:
            json.dump(data, f_temp)
            updated_fixture_path = f_temp.name

        updated_adapter = FixtureAdapter(updated_fixture_path, source_name="updated_fixture")
        pipeline_updated = IngestionPipeline(repository=repo, adapters=[updated_adapter])

        stats_run3, reports3 = pipeline_updated.run()
        print(f"\n[Run 3 - Deadline Change Detection]")
        print(f"Discovered: {stats_run3.discovered}, Inserted: {stats_run3.inserted}, Updates: {stats_run3.updated}, Duplicates Skipped: {stats_run3.duplicates_skipped}, Deadline Changes: {stats_run3.deadline_changes}")
        assert stats_run3.deadline_changes == 1, f"Expected 1 deadline change, got {stats_run3.deadline_changes}"
        assert stats_run3.updated == 1, f"Expected 1 update, got {stats_run3.updated}"
        assert stats_run3.duplicates_skipped == 3, f"Expected 3 unchanged, got {stats_run3.duplicates_skipped}"

        history = repo.get_deadline_history("neurips-2026")
        assert len(history) == 1, f"Expected 1 history entry, got {len(history)}"
        print(f"Verified Audit Log: {history[0].conference_id} changed from '{history[0].previous_deadline}' to '{history[0].new_deadline}'")

        # 4. Check normalization & data quality warning handling
        emerging = repo.get_by_id("emerging-ai-workshop-2026")
        assert emerging is not None, "emerging-ai-workshop-2026 should exist"
        print(f"\n[Data Quality Warnings Checked for {emerging.id}]")
        print(f"Warnings recorded: {emerging.warnings}")
        assert any("Submission deadline missing" in w for w in emerging.warnings), "Expected deadline warning"
        assert any("Official website URL missing" in w for w in emerging.warnings), "Expected website warning"

        print("\nAll sanity checks PASSED successfully!")

    finally:
        try:
            import gc
            gc.collect()
            if os.path.exists(temp_db_path):
                os.remove(temp_db_path)
        except Exception:
            pass
if __name__ == "__main__":
    run_sanity_checks()

