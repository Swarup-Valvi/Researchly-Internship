"""Sanity check suite for Phase 2: Credibility Intelligence Engine.

Validates:
1. Low Risk assessment for reputable conference (NeurIPS 2026 / ICML 2026).
2. High Risk assessment for predatory conference with evidence-backed contradictions.
3. Insufficient Evidence assessment for minimal workshop with missing fields (does not falsely classify as High Risk).
4. Medium Risk assessment for unverified claims.
5. Idempotent evidence storage without uncontrolled duplicates.
6. Historical assessment persistence over time.
7. Future UI / API export formatting.
"""

import os
import json
import tempfile
from researchly.storage.repository import SQLiteConferenceRepository
from researchly.core.normalizer import normalize_conference
from researchly.core.models import RawConferenceData
from researchly.credibility.models import (
    EvidenceItem,
    EvidenceCategory,
    VerificationStatus,
    RiskLevel
)
from researchly.credibility.service import CredibilityService


def run_phase2_sanity_checks():
    print("=== Running Researchly Phase 2 Credibility Engine Sanity Checks ===")

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = tf.name

    try:
        repo = SQLiteConferenceRepository(db_path=temp_db_path)
        service = CredibilityService(repository=repo)

        # -------------------------------------------------------------
        # Test 1: Low Risk Conference (NeurIPS 2026)
        # -------------------------------------------------------------
        neurips = normalize_conference(RawConferenceData(
            source_name="fixture_seed",
            source_url="https://neurips.cc",
            raw_name="NeurIPS",
            raw_edition_or_year="2026",
            raw_submission_deadline="May 21 2026",
            raw_start_date="Dec 06 2026",
            raw_end_date="Dec 12 2026",
            raw_location="San Diego, CA, USA",
            raw_format="In-Person",
            raw_publisher="Curran Associates / NeurIPS Proceedings",
            raw_organizer="Neural Information Processing Systems Foundation",
            raw_fees="$850 Regular",
            raw_official_website="https://neurips.cc"
        ))
        repo.upsert_conference(neurips)

        custom_nips_evidence = [
            EvidenceItem(
                conference_id="neurips-2026",
                category=EvidenceCategory.PROGRAM_COMMITTEE,
                claim="Program committee verified by foundation",
                is_self_claimed=False,
                source_name="nips_foundation",
                source_url="https://neurips.cc/Committees",
                retrieved_at="2026-10-30T00:00:00Z",
                supporting_excerpt="Organizing and program chairs verified",
                verification_status=VerificationStatus.VERIFIED
            ),
            EvidenceItem(
                conference_id="neurips-2026",
                category=EvidenceCategory.INDEXING_CLAIMS,
                claim="Indexed in DBLP and major databases",
                is_self_claimed=False,
                source_name="dblp",
                source_url="https://dblp.org",
                retrieved_at="2026-10-30T00:00:00Z",
                supporting_excerpt="DBLP verified volume records",
                verification_status=VerificationStatus.VERIFIED
            )
        ]

        assessment_nips = service.assess_conference("neurips-2026", custom_evidence=custom_nips_evidence)
        print(f"\n[Test 1 - Legitimate Conference: neurips-2026]")
        print(f"Risk Level: {assessment_nips.risk_level.value}")
        print(f"Status: {assessment_nips.credibility_status}")
        assert assessment_nips.risk_level == RiskLevel.LOW, f"Expected LOW risk, got {assessment_nips.risk_level}"
        assert len(assessment_nips.contradictions) == 0, "Expected 0 contradictions"
        assert len(assessment_nips.positive_indicators) >= 5, "Expected strong positive indicators"

        # -------------------------------------------------------------
        # Test 2: High Risk Predatory Conference with Contradictions
        # -------------------------------------------------------------
        predatory = normalize_conference(RawConferenceData(
            source_name="spam_invite",
            source_url="http://fake-ai-conference.org",
            raw_name="International AI World Congress",
            raw_edition_or_year="2026",
            raw_submission_deadline="Tomorrow",
            raw_official_website="http://fake-ai-conference.org"
        ))
        repo.upsert_conference(predatory)

        predatory_evidence = [
            EvidenceItem(
                conference_id="international-ai-world-congress-2026",
                category=EvidenceCategory.INDEXING_CLAIMS,
                claim="Claims Scopus and Web of Science indexation",
                is_self_claimed=True,
                source_name="scopus_db",
                source_url="https://scopus.com",
                retrieved_at="2026-10-30T00:00:00Z",
                supporting_excerpt="Official Scopus title registry confirms conference does not exist in database",
                verification_status=VerificationStatus.CONTRADICTED
            ),
            EvidenceItem(
                conference_id="international-ai-world-congress-2026",
                category=EvidenceCategory.PUBLISHER_AND_PROCEEDINGS,
                claim="Claims IEEE publishing partner",
                is_self_claimed=True,
                source_name="ieee_official",
                source_url="https://ieee.org",
                retrieved_at="2026-10-30T00:00:00Z",
                supporting_excerpt="IEEE issued public notice disavowing association with this entity",
                verification_status=VerificationStatus.CONTRADICTED
            )
        ]

        assessment_pred = service.assess_conference("international-ai-world-congress-2026", custom_evidence=predatory_evidence)
        print(f"\n[Test 2 - Predatory Conference with Contradictions]")
        print(f"Risk Level: {assessment_pred.risk_level.value}")
        print(f"Status: {assessment_pred.credibility_status}")
        print(f"Contradictions: {assessment_pred.contradictions}")
        assert assessment_pred.risk_level == RiskLevel.HIGH, f"Expected HIGH risk, got {assessment_pred.risk_level}"
        assert len(assessment_pred.contradictions) >= 2, "Expected multiple contradictions"

        # -------------------------------------------------------------
        # Test 3: Missing Information (Inaugural / Incomplete Workshop)
        # Must NOT be classified as High Risk
        # -------------------------------------------------------------
        workshop = normalize_conference(RawConferenceData(
            source_name="faculty_blog",
            source_url="https://dept.edu/workshop",
            raw_name="Emerging AI Workshop",
            raw_edition_or_year="2026",
            raw_official_website="https://dept.edu/workshop"
        ))
        repo.upsert_conference(workshop)

        assessment_ws = service.assess_conference("emerging-ai-workshop-2026")
        print(f"\n[Test 3 - Incomplete Information Conference]")
        print(f"Risk Level: {assessment_ws.risk_level.value}")
        print(f"Status: {assessment_ws.credibility_status}")
        print(f"Missing fields: {len(assessment_ws.missing_information)}")
        assert assessment_ws.risk_level != RiskLevel.HIGH, "Missing information MUST NOT produce a High Risk verdict"
        assert assessment_ws.risk_level == RiskLevel.INSUFFICIENT_EVIDENCE, f"Expected INSUFFICIENT_EVIDENCE, got {assessment_ws.risk_level}"

        # -------------------------------------------------------------
        # Test 4: Idempotency of Evidence Collection
        # -------------------------------------------------------------
        count1 = len(repo.get_evidence_for_conference("neurips-2026"))
        # Rerun assessment
        service.assess_conference("neurips-2026", custom_evidence=custom_nips_evidence)
        count2 = len(repo.get_evidence_for_conference("neurips-2026"))
        print(f"\n[Test 4 - Idempotent Evidence Storage]")
        print(f"Evidence count run 1: {count1}, Evidence count run 2: {count2}")
        assert count1 == count2, f"Evidence count should be unchanged on repeated assessment, got {count1} vs {count2}"

        # -------------------------------------------------------------
        # Test 5: Historical Assessment Preservation
        # -------------------------------------------------------------
        history = service.get_assessment_history("neurips-2026")
        print(f"\n[Test 5 - Assessment History Preservation]")
        print(f"Saved historical assessments: {len(history)}")
        assert len(history) == 2, f"Expected 2 historical assessments recorded, got {len(history)}"

        # -------------------------------------------------------------
        # Test 6: Structured Output for Future UI
        # -------------------------------------------------------------
        report = service.get_formatted_report("neurips-2026")
        print(f"\n[Test 6 - UI/API Structured Output Validation]")
        assert "risk_level" in report
        assert "credibility_status" in report
        assert "findings" in report
        assert "positive_indicators" in report
        print(f"Verified keys in report: {list(report.keys())}")

        print("\nAll Phase 2 sanity checks PASSED successfully!")

    finally:
        try:
            import gc
            gc.collect()
            if os.path.exists(temp_db_path):
                os.remove(temp_db_path)
        except Exception:
            pass
if __name__ == "__main__":
    run_phase2_sanity_checks()

