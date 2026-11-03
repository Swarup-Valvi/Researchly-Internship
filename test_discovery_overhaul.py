"""Comprehensive live test of the discovery overhaul with real-world sources."""

import os
import sys
import tempfile
from pathlib import Path

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from researchly.storage.repository import SQLiteConferenceRepository
from researchly.core.pipeline import IngestionPipeline
from researchly.adapters.openreview_adapter import OpenReviewAdapter
from researchly.adapters.wikicfp_adapter import WikiCFPAdapter
from researchly.adapters.public_cfp_feed import PublicCFPFeedAdapter
from researchly.adapters.generic_event_adapter import GenericEventAdapter
from researchly.adapters.official_site_adapter import OfficialSiteAdapter


def test_discovery_overhaul():
    print("=" * 75)
    print("  RESEARCHLY.IO - DISCOVERY ENGINE OVERHAUL TEST SUITE")
    print("=" * 75)

    tmp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    db_path = tmp_file.name
    tmp_file.close()

    try:
        repo = SQLiteConferenceRepository(db_path=db_path)

        adapters = [
            # 1. WikiCFP aggregator
            WikiCFPAdapter(query="machine learning", max_records=6),
            # 2. OpenReview public API
            OpenReviewAdapter(target_years=["2025"], max_venues=8),
            # 3. Public Curated Academic CFP Feeds (ai-deadlines, sec-deadlines)
            PublicCFPFeedAdapter(max_records_per_feed=8),
            # 4. Official academic sites
            OfficialSiteAdapter(),
            # 5. Generic Event adapter (attendance-only summits)
            GenericEventAdapter(urls=[
                "https://ai-summit.com",
            ])
        ]

        print(f"\n[1] Executing Ingestion Pipeline across {len(adapters)} live sources...")
        pipeline = IngestionPipeline(repository=repo, adapters=adapters)
        stats, reports = pipeline.run()

        print("\n--- Ingestion Run Telemetry ---")
        print(f"Total Discovered: {stats.discovered}")
        print(f"Inserted:         {stats.inserted}")
        print(f"Updated:          {stats.updated}")
        print(f"Duplicates:       {stats.duplicates_skipped}")
        print(f"Deadline Shifts:  {stats.deadline_changes}")

        print("\n--- Per-Source Reports ---")
        for r in reports:
            status_str = "SUCCESS" if r.success else "FAILED"
            print(f"[{r.source_name:<22}] {status_str}: {r.records_discovered} discovered, {r.records_inserted} inserted, {r.duplicates_skipped} skipped")
            if r.error_message:
                print(f"    Error/Warning: {r.error_message}")

        # [2] Test Idempotency and Refresh
        print("\n[2] Testing Idempotent Refresh (Run 2 with identical sources)...")
        stats2, reports2 = pipeline.run()
        print(f"Run 2 - Inserted: {stats2.inserted}, Duplicates Skipped: {stats2.duplicates_skipped}")
        assert stats2.inserted == 0, "Idempotency violated: fresh run inserted records that already exist!"
        print("[OK] Idempotency verified: zero duplicate editions inserted on rerun.")

        # [3] Verify Stored Records, Event Types, and Paper Submission Opportunity Filtering
        all_records = repo.list_all()
        print(f"\n[3] Total Stored Unique Records in Database: {len(all_records)}")

        event_types = {}
        opp_statuses = {}
        for r in all_records:
            event_types[r.event_type] = event_types.get(r.event_type, 0) + 1
            opp_statuses[r.paper_opportunity_status] = opp_statuses.get(r.paper_opportunity_status, 0) + 1

        print("\nBreakdown by Event Type:")
        for et, count in event_types.items():
            print(f"  * {et:<15}: {count}")

        print("\nBreakdown by Paper Opportunity Status:")
        for st, count in opp_statuses.items():
            print(f"  * {st:<15}: {count}")

        # [4] Test Database Multi-Dimensional Filtering Queries
        print("\n[4] Testing Database Multi-Dimensional Filtering...")
        
        # Filter workshops only
        workshops = repo.list_all(event_type="workshop")
        print(f"  * Filter 'workshop': {len(workshops)} found")
        for w in workshops[:3]:
            print(f"      - {w.id} ({w.name}): {w.title or 'No title'}")

        # Filter paper submission opportunities (has_paper_submission=True)
        paper_opps = repo.list_all(has_paper_submission=True)
        print(f"  * Filter 'has_paper_submission=True': {len(paper_opps)} found")

        # Filter upcoming conferences
        upcoming = repo.list_all(status="Upcoming")
        print(f"  * Filter 'status=Upcoming': {len(upcoming)} found")

        # [5] Sample Discovered Records Inspection
        print("\n[5] Detailed Record Samples:")
        for r in all_records[:8]:
            opp_icon = "[CFP]" if r.has_paper_submission else "[Attendance-only]"
            dl_str = r.submission_deadline or "None"
            print(f"  [{r.id:<28}] Type: {r.event_type:<10} | {opp_icon:<16} | Status: {r.status:<26} | DL: {dl_str}")

        print("\n" + "=" * 75)
        print("  [SUCCESS] DISCOVERY ENGINE OVERHAUL TEST SUITE PASSED")
        print("=" * 75 + "\n")
    finally:
        import gc
        gc.collect()
        try:
            os.remove(db_path)
        except OSError:
            pass


if __name__ == "__main__":
    test_discovery_overhaul()

