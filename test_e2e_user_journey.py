"""Phase 4: Complete End-to-End User Journey Integration Test.

Tests the full 10-step Researchly.io researcher workflow:
  Step 1:  Researcher lands on Researchly.io (health check & directory summary)
  Step 2:  Researcher browses and filters conferences (workshops, upcoming, open)
  Step 3:  Researcher opens a conference detail page (e.g. neurips-2026)
  Step 4:  Researcher inspects credibility assessment, findings, and evidence
  Step 5:  Researcher submits paper abstract and keywords to AI Match engine
  Step 6:  Researcher reviews categorized recommendations and match explanations
  Step 7:  Researcher shortlists a top recommended conference
  Step 8:  Researcher views tracked conferences with deadline urgency metrics
  Step 9:  Researcher updates application pipeline status to 'Submitted' with dates & notes
  Step 10: Researcher simulates browser reload / re-login and verifies persisted records
"""

import os
import sys
import uuid
from datetime import date, datetime

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from fastapi.testclient import TestClient
from researchly.api.main import app, repo


def run_e2e_user_journey():
    print("=" * 70)
    print("  RESEARCHLY.IO — END-TO-END USER JOURNEY VERIFICATION (PHASE 4)")
    print("=" * 70)

    client = TestClient(app)
    # Generate unique researcher session for this test run
    researcher_id = f"researcher_e2e_{uuid.uuid4().hex[:8]}"
    auth_headers = {"X-User-Id": researcher_id}

    # Ensure clean state for this researcher
    cleanup_res = client.get("/api/tracking", headers=auth_headers)
    for app_rec in cleanup_res.json():
        client.delete(f"/api/tracking/{app_rec['conference_id']}", headers=auth_headers)

    # -------------------------------------------------------------------------
    # STEP 1: Land on Researchly.io
    # -------------------------------------------------------------------------
    print("\n[Step 1] Researcher opens Researchly.io dashboard...")
    health_res = client.get("/api/health")
    assert health_res.status_code == 200
    health_data = health_res.json()
    assert health_data["status"] == "healthy"
    assert health_data["conferences"] >= 20, f"Expected at least 20 conferences in DB, got {health_data['conferences']}"
    print(f"  [OK] System online: {health_data['conferences']} conferences, {health_data['assessments']} credibility assessments.")

    # -------------------------------------------------------------------------
    # STEP 2: Browse & Filter Conferences
    # -------------------------------------------------------------------------
    print("\n[Step 2] Researcher browses conference catalog with multi-axis filters...")
    # 2a. Default upcoming conferences
    upcoming_res = client.get("/api/conferences")
    assert upcoming_res.status_code == 200
    upcoming = upcoming_res.json()
    print(f"  [OK] Active/Upcoming conferences: {len(upcoming)} conferences returned")

    # 2b. Filter by event_type=workshop
    workshop_res = client.get("/api/conferences?event_type=workshop&include_historical=true")
    assert workshop_res.status_code == 200
    workshops = workshop_res.json()
    assert len(workshops) > 0
    assert all(w["event_type"].lower() == "workshop" for w in workshops)
    print(f"  [OK] Filter 'workshop': {len(workshops)} workshops matched")

    # 2c. Filter by submission_status=Open
    open_res = client.get("/api/conferences?submission_status=Open")
    assert open_res.status_code == 200
    open_confs = open_res.json()
    print(f"  [OK] Filter 'submission_status=Open': {len(open_confs)} conference(s) open for paper submissions")

    # -------------------------------------------------------------------------
    # STEP 3: Open Conference Detail Page
    # -------------------------------------------------------------------------
    target_conf_id = "neurips-2026"
    print(f"\n[Step 3] Researcher views conference detail for '{target_conf_id}'...")
    detail_res = client.get(f"/api/conferences/{target_conf_id}")
    assert detail_res.status_code == 200
    conf = detail_res.json()
    assert conf["id"] == target_conf_id
    assert conf["name"] == "NeurIPS"
    assert conf["edition_or_year"] == "2026"
    print(f"  [OK] Retrieved profile: {conf['name']} ({conf['edition_or_year']}) | Location: {conf['location']}")

    # -------------------------------------------------------------------------
    # STEP 4: Review Credibility Assessment & Evidence
    # -------------------------------------------------------------------------
    print(f"\n[Step 4] Researcher verifies credibility assessment for '{target_conf_id}'...")
    cred_res = client.get(f"/api/credibility/{target_conf_id}")
    assert cred_res.status_code == 200
    cred = cred_res.json()
    assert cred["assessed"] is True
    assert cred["risk_level"] in ["Low", "Medium", "High", "Insufficient Evidence"]
    assert len(cred["positive_indicators"]) > 0 or len(cred["findings"]) > 0
    print(f"  [OK] Credibility status: Risk={cred['risk_level']} | Findings={len(cred.get('findings', []))} | Evidence={len(cred.get('evidence', []))}")

    # -------------------------------------------------------------------------
    # STEP 5: Submit Paper to AI Match
    # -------------------------------------------------------------------------
    print("\n[Step 5] Researcher submits paper abstract to AI Match Engine...")
    paper_payload = {
        "title": "Scalable Self-Supervised Vision Transformers for Zero-Shot Medical Imaging",
        "abstract": "We introduce a novel self-supervised learning framework using contrastive vision transformers for high-resolution anatomical segmentation and representation learning.",
        "keywords": ["computer vision", "transformers", "self-supervised learning", "deep learning", "representation learning"],
        "research_domain": "Computer Vision",
        "preferred_location": "USA"
    }
    match_res = client.post("/api/match", json=paper_payload)
    assert match_res.status_code == 200
    match_data = match_res.json()
    assert match_data["total_conferences_evaluated"] > 0
    print(f"  [OK] Matching completed across {match_data['total_conferences_evaluated']} conferences")

    # -------------------------------------------------------------------------
    # STEP 6: Review Matching Conferences
    # -------------------------------------------------------------------------
    print("\n[Step 6] Researcher reviews ranked match recommendations...")
    all_recommendations = (
        match_data["upcoming_open_deadline"] +
        match_data["upcoming_passed_deadline"] +
        match_data["upcoming_unknown_deadline"] +
        match_data["historical_completed"] +
        match_data["date_unknown"]
    )
    assert len(all_recommendations) > 0, "Expected at least one matching conference recommendation"
    top_rec = all_recommendations[0]
    assert "relevance_score" in top_rec
    assert "match_explanation" in top_rec
    print(f"  [OK] Top match: {top_rec['conference_name']} | Relevance: {top_rec['relevance_score']:.1%} | Rank: #{top_rec['relevance_rank']}")
    print(f"       Explanation: {top_rec['match_explanation'][:80]}...")

    # Choose a conference to track from recommendations
    shortlist_candidate = all_recommendations[0]["conference_id"]

    # -------------------------------------------------------------------------
    # STEP 7: Shortlist Conference
    # -------------------------------------------------------------------------
    print(f"\n[Step 7] Researcher shortlists recommended conference '{shortlist_candidate}'...")
    shortlist_res = client.post(
        "/api/tracking",
        headers=auth_headers,
        json={
            "conference_id": shortlist_candidate,
            "status": "Shortlisted",
            "notes": "Targeted from AI Match recommendation for self-supervised ViT paper"
        }
    )
    assert shortlist_res.status_code == 201, f"Failed to shortlist: {shortlist_res.text}"
    tracked_item = shortlist_res.json()
    assert tracked_item["conference_id"] == shortlist_candidate
    assert tracked_item["status"] == "Shortlisted"
    print(f"  [OK] Conference '{shortlist_candidate}' added to researcher's shortlist")

    # Test duplicate prevention (HTTP 409 Conflict)
    dup_res = client.post(
        "/api/tracking",
        headers=auth_headers,
        json={"conference_id": shortlist_candidate, "status": "Shortlisted"}
    )
    assert dup_res.status_code == 409, f"Expected 409 Conflict on duplicate tracking, got {dup_res.status_code}"
    print("  [OK] Duplicate shortlisting prevented with HTTP 409 Conflict")

    # -------------------------------------------------------------------------
    # STEP 8: View Shortlist & Deadline Urgency
    # -------------------------------------------------------------------------
    print("\n[Step 8] Researcher reviews Shortlist & Tracking table...")
    track_list_res = client.get("/api/tracking", headers=auth_headers)
    assert track_list_res.status_code == 200
    tracking_list = track_list_res.json()
    assert len(tracking_list) == 1
    rec = tracking_list[0]
    assert rec["conference_id"] == shortlist_candidate
    assert "deadline_urgency" in rec
    print(f"  [OK] Conference tracked: {rec.get('conference_name')} | Status: {rec['status']} | Deadline: {rec.get('submission_deadline')}")
    print(f"       Urgency Metric: {rec.get('deadline_urgency')} ({rec.get('days_until_deadline')} days)")

    # -------------------------------------------------------------------------
    # STEP 9: Advance Pipeline Status & Record Submission
    # -------------------------------------------------------------------------
    print(f"\n[Step 9] Researcher transitions status to 'Submitted' with paper dates & notes...")
    submission_date = date.today().isoformat()
    patch_res = client.patch(
        f"/api/tracking/{shortlist_candidate}",
        headers=auth_headers,
        json={
            "status": "Submitted",
            "submitted_at": submission_date,
            "decision_at": "2026-12-15",
            "notes": "Paper submitted to primary track with rebuttal preparation notes."
        }
    )
    assert patch_res.status_code == 200
    updated_rec = patch_res.json()
    assert updated_rec["status"] == "Submitted"
    assert updated_rec["submitted_at"] is not None
    assert "rebuttal preparation" in updated_rec["notes"]
    print(f"  [OK] Status updated to '{updated_rec['status']}' | Submitted: {updated_rec['submitted_at'][:10]} | Decision: {updated_rec['decision_at'][:10]}")

    # -------------------------------------------------------------------------
    # STEP 10: Simulate Page Refresh / Re-login & Verify Persistence
    # -------------------------------------------------------------------------
    print("\n[Step 10] Researcher simulates page refresh / re-login...")
    # Fresh HTTP request using the same researcher session ID
    reloaded_res = client.get("/api/tracking", headers=auth_headers)
    assert reloaded_res.status_code == 200
    reloaded_list = reloaded_res.json()
    assert len(reloaded_list) == 1
    persisted = reloaded_list[0]
    assert persisted["conference_id"] == shortlist_candidate
    assert persisted["status"] == "Submitted"
    assert persisted["submitted_at"] is not None
    assert persisted["decision_at"] is not None
    assert "rebuttal preparation" in persisted["notes"]
    print("  [OK] Persistent state verified: status, dates, and notes retained across sessions")

    # Verify second researcher sees completely isolated empty pipeline
    other_researcher_headers = {"X-User-Id": "other_researcher_999"}
    other_res = client.get("/api/tracking", headers=other_researcher_headers)
    assert other_res.status_code == 200
    assert len(other_res.json()) == 0, "Data leakage! Other researcher saw tracked records"
    print("  [OK] Multi-user data isolation verified: second researcher sees clean pipeline")

    # Cleanup test session
    client.delete(f"/api/tracking/{shortlist_candidate}", headers=auth_headers)
    print("  [OK] Test session cleaned up successfully")

    print("\n" + "=" * 70)
    print("  [SUCCESS] COMPLETE 10-STEP USER JOURNEY VERIFIED WITHOUT ERRORS")
    print("=" * 70)


if __name__ == "__main__":
    run_e2e_user_journey()

