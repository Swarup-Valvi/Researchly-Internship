"""Phase 3 smoke test: paper-to-conference matching against the live database."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from datetime import date
from researchly.storage.repository import SQLiteConferenceRepository
from researchly.credibility.service import CredibilityService
from researchly.matching.service import MatchingService
from researchly.matching.models import PaperInput


def main():
    repo = SQLiteConferenceRepository(db_path="researchly.db")
    cred_service = CredibilityService(repository=repo)
    matcher = MatchingService(repository=repo, credibility_service=cred_service)

    # Test paper: a computer vision / deep learning paper
    paper = PaperInput(
        title="Self-Supervised Visual Representation Learning with Contrastive Transformers",
        abstract=(
            "We propose a novel self-supervised framework for learning visual representations "
            "using contrastive learning combined with vision transformers. Our approach leverages "
            "multi-scale feature extraction and attention mechanisms to learn rich visual features "
            "without labeled data. We evaluate on ImageNet, COCO, and downstream tasks including "
            "object detection and semantic segmentation. Our method achieves state-of-the-art "
            "performance on multiple computer vision benchmarks, demonstrating the effectiveness "
            "of combining contrastive objectives with transformer architectures for visual "
            "representation learning."
        ),
        keywords=["computer vision", "self-supervised learning", "transformers", "contrastive learning", "deep learning"],
        research_domain="Computer Vision",
        preferred_location="USA",
    )

    print("=" * 70)
    print("PHASE 3 SMOKE TEST — Paper-to-Conference Matching")
    print("=" * 70)
    print(f"\nPaper: {paper.title}")
    print(f"Keywords: {', '.join(paper.keywords)}")
    print(f"Domain: {paper.research_domain}")
    print(f"Preferred location: {paper.preferred_location}")

    result = matcher.match(paper, reference_date=date.today())

    print(f"\nConferences evaluated: {result.total_conferences_evaluated}")

    sections = [
        ("UPCOMING — Open Deadline", result.upcoming_open_deadline),
        ("UPCOMING — Unknown Deadline", result.upcoming_unknown_deadline),
        ("UPCOMING — Passed Deadline", result.upcoming_passed_deadline),
        ("DATE UNKNOWN", result.date_unknown),
        ("COMPLETED / HISTORICAL", result.historical_completed),
    ]

    total = 0
    for label, recs in sections:
        if not recs:
            continue
        print(f"\n--- {label} ({len(recs)} result(s)) ---")
        for rec in recs:
            total += 1
            print(f"\n  #{rec.relevance_rank}  {rec.conference_name} {rec.edition_or_year}")
            print(f"      Relevance:    {rec.relevance_score:.1%}")
            print(f"      Status:       {rec.status}")
            if rec.submission_deadline:
                dl = rec.submission_deadline
                if rec.days_until_deadline is not None:
                    dl += f"  ({rec.days_until_deadline} days)"
                print(f"      Deadline:     {dl}")
            if rec.location:
                loc = rec.location
                if rec.location_match:
                    loc += "  ✓ match"
                print(f"      Location:     {loc}")
            print(f"      Credibility:  {rec.credibility.risk_level}")
            if rec.topic_overlap.matched_conference_topics:
                print(f"      Topics:       {', '.join(rec.topic_overlap.matched_conference_topics)}")
            if rec.topic_overlap.common_terms:
                print(f"      Key terms:    {', '.join(rec.topic_overlap.common_terms[:6])}")
            print(f"      Explanation:  {rec.match_explanation}")
            if rec.official_website_url:
                print(f"      Website:      {rec.official_website_url}")

    if total == 0:
        print("\nNo matching conferences found.")

    print(f"\n{'=' * 70}")
    print(f"Total recommendations: {total}")

    # Assertions for smoke test
    assert result.total_conferences_evaluated > 0, "Should have conferences to evaluate"
    assert total > 0, "Should have at least one matching conference"

    # Verify CVPR is ranked highly for a CV paper
    all_recs = (
        result.upcoming_open_deadline +
        result.upcoming_passed_deadline +
        result.upcoming_unknown_deadline +
        result.historical_completed +
        result.date_unknown
    )
    cv_conf_ids = [r.conference_id for r in all_recs if "cvpr" in r.conference_id.lower()]
    assert len(cv_conf_ids) > 0, "CVPR should match a computer vision paper"
    print(f"\n✓ CVPR found in results (expected for a CV paper)")

    # Verify no completed conference is presented without disclaimer
    for rec in result.historical_completed:
        assert "concluded" in rec.match_explanation.lower() or "reference" in rec.match_explanation.lower(), \
            f"Completed conference {rec.conference_id} must be flagged as historical"
    print("✓ Historical conferences properly flagged")

    # Verify credibility data is present
    for rec in all_recs:
        assert rec.credibility is not None, f"Missing credibility for {rec.conference_id}"
    print("✓ Credibility summaries attached to all recommendations")

    print("\n✅ Phase 3 smoke test PASSED\n")


if __name__ == "__main__":
    main()

