"""Phase 3 Verification: Supabase Authentication, Session Persistence, and Data Isolation.

Tests:
1. Multi-user isolation in application tracking (User A vs User B).
2. JWT Bearer token extraction and authentication.
3. User independence: User A and User B can track the same conference with independent states.
4. User delete isolation: User A deleting a tracking record does not affect User B.
5. Verification of Supabase SQL migration script and Row Level Security (RLS) policies.
"""

import os
import sys
import tempfile
import base64
import json
from pathlib import Path

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from fastapi.testclient import TestClient
from researchly.storage.repository import SQLiteConferenceRepository
from researchly.api.main import app, repo


def test_migration_sql_rls_policies():
    """Verify that the Supabase migration script has all required RLS policies."""
    print("\n[1] Verifying Supabase SQL Migration Script & RLS Policies...")
    migration_path = Path("supabase/migrations/20261103000000_init_user_applications.sql")
    assert migration_path.exists(), f"Migration file not found at {migration_path}"

    content = migration_path.read_text(encoding="utf-8")
    assert "enable row level security" in content.lower(), "Row Level Security must be enabled on user_applications"
    assert "auth.uid() = user_id" in content, "RLS policies must isolate data using auth.uid() = user_id"
    assert "for select" in content, "SELECT policy missing in RLS"
    assert "for insert" in content, "INSERT policy missing in RLS"
    assert "for update" in content, "UPDATE policy missing in RLS"
    assert "for delete" in content, "DELETE policy missing in RLS"
    assert "references auth.users(id)" in content, "Foreign key to auth.users missing"

    print("  [OK] Supabase SQL migration file validated with full RLS policies.")


def test_multi_user_data_isolation():
    """Verify that User A and User B have complete data isolation in the API."""
    print("\n[2] Testing Multi-User Data Isolation in Application Tracking...")
    client = TestClient(app)

    user_a = "usr_alice_101"
    user_b = "usr_bob_202"

    headers_a = {"X-User-Id": user_a}
    headers_b = {"X-User-Id": user_b}

    # Ensure clean slate for both test users
    for h in [headers_a, headers_b]:
        res = client.get("/api/tracking", headers=h)
        for app_rec in res.json():
            client.delete(f"/api/tracking/{app_rec['conference_id']}", headers=h)

    # 1. User A tracks icml-2026 as 'Shortlisted'
    post_res = client.post(
        "/api/tracking",
        headers=headers_a,
        json={"conference_id": "icml-2026", "status": "Shortlisted", "notes": "Alice paper target"},
    )
    assert post_res.status_code == 201, f"Failed to track for User A: {post_res.text}"
    print("  [OK] User A tracked icml-2026 as 'Shortlisted'")

    # 2. User B queries tracking list -> MUST BE EMPTY (User B cannot see User A's data)
    res_b = client.get("/api/tracking", headers=headers_b)
    assert res_b.status_code == 200
    b_records = res_b.json()
    assert len(b_records) == 0, f"Data leakage! User B received User A records: {b_records}"
    print("  [OK] User B tracking list is empty (User A data strictly isolated)")

    # 3. User B queries icml-2026 directly -> MUST RETURN 404
    detail_b = client.get("/api/tracking/icml-2026", headers=headers_b)
    assert detail_b.status_code == 404, "Data leakage! User B was able to fetch User A tracking record"
    print("  [OK] User B cannot access User A's record via direct endpoint (404 Not Found)")

    # 4. User B tracks the SAME conference icml-2026 independently as 'Preparing'
    post_res_b = client.post(
        "/api/tracking",
        headers=headers_b,
        json={"conference_id": "icml-2026", "status": "Preparing", "notes": "Bob independent notes"},
    )
    assert post_res_b.status_code == 201, f"User B should be able to track icml-2026 independently: {post_res_b.text}"
    print("  [OK] User B independently tracked icml-2026 as 'Preparing'")

    # 5. User A updates status to 'Submitted'
    patch_res_a = client.patch(
        "/api/tracking/icml-2026",
        headers=headers_a,
        json={"status": "Submitted", "notes": "Alice submitted paper"},
    )
    assert patch_res_a.status_code == 200
    assert patch_res_a.json()["status"] == "Submitted"

    # Verify User B's status is UNTOUCHED
    check_b = client.get("/api/tracking/icml-2026", headers=headers_b)
    assert check_b.status_code == 200
    assert check_b.json()["status"] == "Preparing", "User A update corrupted User B's record!"
    assert check_b.json()["notes"] == "Bob independent notes"
    print("  [OK] Status updates are strictly isolated per user")

    # 6. User A deletes their tracking record
    del_a = client.delete("/api/tracking/icml-2026", headers=headers_a)
    assert del_a.status_code == 204

    # Verify User A record is gone, but User B record STILL EXISTS
    assert client.get("/api/tracking/icml-2026", headers=headers_a).status_code == 404
    check_b_after = client.get("/api/tracking/icml-2026", headers=headers_b)
    assert check_b_after.status_code == 200
    assert check_b_after.json()["conference_id"] == "icml-2026"
    print("  [OK] Deleting User A record leaves User B record completely intact")

    # Cleanup User B
    client.delete("/api/tracking/icml-2026", headers=headers_b)


def test_jwt_bearer_authentication():
    """Verify that Supabase-style JWT Bearer tokens are properly resolved."""
    print("\n[3] Testing JWT Bearer Token Authentication...")
    client = TestClient(app)

    user_jwt_id = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
    # Create standard 3-part JWT with sub claim
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps({"sub": user_jwt_id, "email": "researcher@mit.edu"}).encode()).decode().rstrip("=")
    signature = "dummy_signature_for_test"
    jwt_token = f"{header}.{payload}.{signature}"

    headers = {"Authorization": f"Bearer {jwt_token}"}

    # Clean existing
    res = client.get("/api/tracking", headers=headers)
    for r in res.json():
        client.delete(f"/api/tracking/{r['conference_id']}", headers=headers)

    # Track via JWT
    post_res = client.post(
        "/api/tracking",
        headers=headers,
        json={"conference_id": "neurips-2026", "status": "Interested"},
    )
    assert post_res.status_code == 201
    assert post_res.json()["user_id"] == user_jwt_id
    print(f"  [OK] Successfully authenticated via JWT sub claim: {user_jwt_id}")

    # Fetch back via JWT
    get_res = client.get("/api/tracking/neurips-2026", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["conference_id"] == "neurips-2026"
    print("  [OK] Session persisted and query retrieved using JWT Bearer token")

    # Cleanup
    client.delete("/api/tracking/neurips-2026", headers=headers)


if __name__ == "__main__":
    print("=" * 65)
    print("  RESEARCHLY.IO - PHASE 3 SUPABASE AUTH & ISOLATION TEST SUITE")
    print("=" * 65)

    test_migration_sql_rls_policies()
    test_multi_user_data_isolation()
    test_jwt_bearer_authentication()

    print("\n" + "=" * 65)
    print("  [SUCCESS] ALL PHASE 3 AUTH & ISOLATION TESTS PASSED")
    print("=" * 65)

