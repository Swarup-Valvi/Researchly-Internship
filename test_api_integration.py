"""End-to-end integration tests for Researchly.io backend API."""

import os
import sys

# Ensure src is in python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from fastapi.testclient import TestClient
from researchly.api.main import app

client = TestClient(app)


def test_api_health():
    print("Testing /api/health...")
    response = client.get("/api/health")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    data = response.json()
    assert data["status"] == "healthy"
    assert data["conferences"] >= 5
    print(f"  [OK] Health check: {data}")


def test_list_conferences_and_filters():
    print("\nTesting /api/conferences filtering...")
    
    # 1. Default (exclude historical)
    res = client.get("/api/conferences")
    assert res.status_code == 200
    upcoming = res.json()
    print(f"  [OK] Default conferences (excluding historical): {len(upcoming)} items")
    assert len(upcoming) > 0

    # 2. Include historical
    res_hist = client.get("/api/conferences?include_historical=true")
    assert res_hist.status_code == 200
    all_confs = res_hist.json()
    print(f"  [OK] All conferences (including historical): {len(all_confs)} items")
    assert len(all_confs) >= len(upcoming)

    # 3. Filter event_type
    res_ws = client.get("/api/conferences?event_type=workshop&include_historical=true")
    assert res_ws.status_code == 200
    workshops = res_ws.json()
    print(f"  [OK] Filter event_type=workshop: {len(workshops)} items")
    for w in workshops:
        assert w["event_type"].lower() == "workshop"

    # 4. Filter submission_status=Open
    res_open = client.get("/api/conferences?submission_status=Open&include_historical=true")
    assert res_open.status_code == 200
    open_items = res_open.json()
    print(f"  [OK] Filter submission_status=Open: {len(open_items)} items")


def test_conference_detail_and_credibility():
    print("\nTesting /api/conferences/{id} and /api/credibility/{id}...")
    sample_id = "neurips-2026"

    # Conference detail
    res = client.get(f"/api/conferences/{sample_id}")
    assert res.status_code == 200
    conf = res.json()
    assert conf["id"] == sample_id
    assert conf["name"] == "NeurIPS"
    print(f"  [OK] Conference detail for {sample_id}: {conf['name']} ({conf['edition_or_year']})")

    # Credibility
    res_cred = client.get(f"/api/credibility/{sample_id}")
    assert res_cred.status_code == 200
    cred = res_cred.json()
    assert cred["conference_id"] == sample_id
    assert cred["risk_level"] in ["Low", "Medium", "High", "Insufficient Evidence"]
    assert len(cred["findings"]) > 0 or len(cred["positive_indicators"]) > 0 or cred["assessed"]
    print(f"  [OK] Credibility assessment: Risk={cred['risk_level']}, Findings={len(cred.get('findings', []))}, Evidence={len(cred.get('evidence', []))}")


def test_ai_matching():
    print("\nTesting /api/match...")
    payload = {
        "title": "Deep Learning for Computer Vision and Representation",
        "abstract": "We explore convolutional and vision transformer models for image classification and feature learning.",
        "keywords": ["computer vision", "deep learning", "representation learning"],
        "research_domain": "Computer Vision",
        "preferred_location": "USA"
    }
    res = client.post("/api/match", json=payload)
    assert res.status_code == 200
    match_data = res.json()
    total = (
        len(match_data["upcoming_open_deadline"]) +
        len(match_data["upcoming_passed_deadline"]) +
        len(match_data["upcoming_unknown_deadline"]) +
        len(match_data["historical_completed"]) +
        len(match_data["date_unknown"])
    )
    print(f"  [OK] Matching evaluated {match_data['total_conferences_evaluated']} conferences, returned {total} recommendations")
    assert total > 0


def test_tracking_crud_lifecycle():
    print("\nTesting /api/tracking CRUD lifecycle...")
    test_conf_id = "icml-2026"

    # Ensure clean state
    client.delete(f"/api/tracking/{test_conf_id}")

    # 1. Create tracking record
    create_res = client.post("/api/tracking", json={"conference_id": test_conf_id, "status": "Shortlisted", "notes": "Target conference"})
    assert create_res.status_code == 201
    created = create_res.json()
    assert created["conference_id"] == test_conf_id
    assert created["status"] == "Shortlisted"
    print(f"  [OK] Tracked conference: {created['conference_id']} with status '{created['status']}'")

    # 2. Get tracking record
    get_res = client.get(f"/api/tracking/{test_conf_id}")
    assert get_res.status_code == 200
    assert get_res.json()["status"] == "Shortlisted"

    # 3. Duplicate tracking prevention (409)
    dup_res = client.post("/api/tracking", json={"conference_id": test_conf_id, "status": "Interested"})
    assert dup_res.status_code == 409
    print(f"  [OK] Duplicate tracking prevented with HTTP 409 Conflict")

    # 4. Update status & dates
    patch_res = client.patch(f"/api/tracking/{test_conf_id}", json={
        "status": "Submitted",
        "submitted_at": "2026-05-01",
        "notes": "Paper submitted via OpenReview"
    })
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["status"] == "Submitted"
    assert updated["submitted_at"] == "2026-05-01"
    print(f"  [OK] Updated tracking status to '{updated['status']}' with submission date")

    # 5. List applications
    list_res = client.get("/api/tracking")
    assert list_res.status_code == 200
    apps = list_res.json()
    assert any(a["conference_id"] == test_conf_id for a in apps)
    print(f"  [OK] Tracking list contains {len(apps)} application(s)")

    # 6. Delete tracking record
    del_res = client.delete(f"/api/tracking/{test_conf_id}")
    assert del_res.status_code == 204
    print(f"  [OK] Successfully removed {test_conf_id} from tracking (HTTP 204)")


def run_all():
    print("=" * 65)
    print("  RESEARCHLY.IO — API & FRONTEND INTEGRATION VERIFICATION")
    print("=" * 65)
    test_api_health()
    test_list_conferences_and_filters()
    test_conference_detail_and_credibility()
    test_ai_matching()
    test_tracking_crud_lifecycle()
    print("\n" + "=" * 65)
    print("  [SUCCESS] ALL API & WORKFLOW INTEGRATION TESTS PASSED")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    run_all()

