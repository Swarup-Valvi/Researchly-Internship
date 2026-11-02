"""CLI entry point for Researchly.io conference ingestion."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import List

from researchly.storage.repository import SQLiteConferenceRepository
from researchly.adapters.base import SourceAdapter
from researchly.adapters.fixture_adapter import FixtureAdapter
from researchly.adapters.icml_adapter import ICMLOfficialAdapter
from researchly.adapters.official_site_adapter import OfficialSiteAdapter
from researchly.adapters.openreview_adapter import OpenReviewAdapter
from researchly.adapters.openalex_adapter import OpenAlexMetadataAdapter
from researchly.adapters.crossref_adapter import CrossrefMetadataAdapter
from researchly.adapters.wikicfp_adapter import WikiCFPAdapter
from researchly.adapters.society_adapter import SocietyDirectoryAdapter
from researchly.adapters.dblp_adapter import DBLPMetadataAdapter
from researchly.adapters.generic_event_adapter import GenericEventAdapter
from researchly.adapters.public_cfp_feed import PublicCFPFeedAdapter
from researchly.core.pipeline import IngestionPipeline, SourceRunReport
from researchly.credibility.service import CredibilityService
from researchly.credibility.models import EvidenceItem, EvidenceCategory, VerificationStatus
from researchly.matching.service import MatchingService
from researchly.matching.models import PaperInput, MatchingResult, ConferenceRecommendation


def configure_logging(verbose: bool = False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def print_summary(stats, source_reports: List[SourceRunReport], repo: SQLiteConferenceRepository):
    print("\n" + "=" * 65)
    print("        RESEARCHLY.IO INGESTION RUN SUMMARY")
    print("=" * 65)
    print(f"  Records Discovered:       {stats.discovered}")
    print(f"  New Records Inserted:     {stats.inserted}")
    print(f"  Existing Records Updated: {stats.updated}")
    print(f"  Duplicates Skipped:       {stats.duplicates_skipped}")
    print(f"  Deadline Changes Found:   {stats.deadline_changes}")
    print(f"  Data-Quality Warnings:    {stats.warnings_logged}")
    
    # Detailed per-source reports
    print("\nPer-Source Execution Telemetry:")
    print("-" * 65)
    for sr in source_reports:
        status_sym = "✓ SUCCESS" if sr.success else "✗ FAILED"
        print(f"  [{sr.source_name:<22}] {status_sym}")
        print(f"    Discovered: {sr.records_discovered:<3} | Inserted: {sr.records_inserted:<3} | Updated: {sr.records_updated:<3} | Skipped: {sr.duplicates_skipped:<3} | DL Shifts: {sr.deadline_changes}")
        if sr.error_message:
            print(f"    Error/Warning: {sr.error_message}")
        if sr.last_run_timestamp:
            print(f"    Last Executed: {sr.last_run_timestamp[:19]}")

    # Inspect current database records
    all_confs = repo.list_all()
    print(f"\nCurrent Database Status: {len(all_confs)} unique conference edition(s) stored")
    for conf in all_confs:
        dl_str = conf.submission_deadline or "None"
        type_str = f"[{conf.event_type.upper()}]"
        opp_str = "📄 CFP" if conf.has_paper_submission else "🚫 Attendance-only"
        print(f"  • {conf.id:<32} | {type_str:<12} | {opp_str:<17} | DL: {dl_str:<10} | Loc: {conf.location or 'TBD'}")

    history = repo.get_deadline_history()
    if history:
        print(f"\nDeadline Change Audit Log ({len(history)} events):")
        for h in history:
            print(f"  • [{h.detected_at[:19]}] {h.conference_id}: {h.previous_deadline} -> {h.new_deadline} (via {h.source_name})")
    print("=" * 65 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Researchly.io Conference Ingestion Pipeline")
    parser.add_argument("--db", default="researchly.db", help="Path to SQLite database file")
    parser.add_argument("--fixture", default="fixtures/sample_conferences.json", help="Path to JSON fixture file")
    parser.add_argument("--no-fixture", action="store_true", help="Do not load seed fixtures")
    parser.add_argument("--sources", help="Comma-separated list of adapters to run: openreview,official,openalex,crossref,wikicfp,ieee,acm,icml,generic,all_live")
    parser.add_argument("--generic-urls", help="Comma-separated list of generic event URLs to ingest")
    parser.add_argument("--with-live", action="store_true", help="Include live official source adapters (ICML)")
    parser.add_argument("--with-wikicfp", action="store_true", help="Attempt WikiCFP adapter (respecting network & access rules)")
    parser.add_argument("--with-cfp-feeds", action="store_true", help="Include curated academic CFP feeds (ai-deadlines, sec-deadlines)")
    parser.add_argument("--assess", help="Assess credibility for a specific conference ID (or 'all')")
    parser.add_argument("--evidence-fixture", default="fixtures/sample_evidence.json", help="Path to evidence fixtures")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose debug logging")

    # Phase 3: Paper matching
    parser.add_argument("--match-title", help="Paper title for conference matching")
    parser.add_argument("--match-abstract", help="Paper abstract for conference matching")
    parser.add_argument("--match-keywords", help="Comma-separated keywords for matching")
    parser.add_argument("--match-domain", help="Research domain for matching")
    parser.add_argument("--match-location", help="Preferred conference location")
    parser.add_argument("--match-only", action="store_true", help="Skip ingestion and only run matching")

    args = parser.parse_args()
    configure_logging(args.verbose)

    repo = SQLiteConferenceRepository(db_path=args.db)
    adapters: List[SourceAdapter] = []

    selected_sources = [s.strip().lower() for s in args.sources.split(",")] if args.sources else []

    # 1. Fixture adapter (unless explicitly disabled or sources specified without fixture)
    if not args.no_fixture and (not selected_sources or "fixture" in selected_sources):
        fixture_path = Path(args.fixture)
        if fixture_path.exists():
            adapters.append(FixtureAdapter(fixture_path=fixture_path, source_name="fixture_seed"))
        else:
            logging.warning("Fixture file not found at %s; skipping fixture adapter", fixture_path)

    # 2. OpenReview Public API
    if "openreview" in selected_sources or "all_live" in selected_sources:
        adapters.append(OpenReviewAdapter(max_venues=10))

    # 3. Reusable Official Site Adapter (NeurIPS, ACL, ICLR)
    if "official" in selected_sources or "all_live" in selected_sources:
        adapters.append(OfficialSiteAdapter())

    # 4. OpenAlex Supporting Scholarly Metadata
    if "openalex" in selected_sources or "all_live" in selected_sources:
        adapters.append(OpenAlexMetadataAdapter(max_results=5))

    # 5. Crossref Supporting Metadata
    if "crossref" in selected_sources or "all_live" in selected_sources:
        adapters.append(CrossrefMetadataAdapter(max_results=5))

    # 6. Live Dedicated ICML adapter
    if args.with_live or "icml" in selected_sources or "all_live" in selected_sources:
        adapters.append(ICMLOfficialAdapter())

    # 7. WikiCFP adapter
    if args.with_wikicfp or "wikicfp" in selected_sources or "all_live" in selected_sources:
        adapters.append(WikiCFPAdapter())

    # 8. IEEE & ACM directory probing
    if "ieee" in selected_sources or "all_live" in selected_sources:
        adapters.append(SocietyDirectoryAdapter("ieee"))
    if "acm" in selected_sources or "all_live" in selected_sources:
        adapters.append(SocietyDirectoryAdapter("acm"))
    if "dblp" in selected_sources or "all_live" in selected_sources:
        adapters.append(DBLPMetadataAdapter())

    # 9. Generic Event Adapter for industry conferences
    if "generic" in selected_sources or args.generic_urls:
        urls = [u.strip() for u in args.generic_urls.split(",")] if args.generic_urls else []
        if urls:
            adapters.append(GenericEventAdapter(urls=urls))

    # 10. Public Curated Academic CFP Feeds (ai-deadlines, sec-deadlines)
    if "cfp_feed" in selected_sources or "all_live" in selected_sources or args.with_cfp_feeds:
        adapters.append(PublicCFPFeedAdapter(max_records_per_feed=15))

    if not adapters and not args.match_only:
        print("Error: No source adapters configured to run.")
        sys.exit(1)

    if not args.match_only:
        pipeline = IngestionPipeline(repository=repo, adapters=adapters)
        stats, source_reports = pipeline.run()
        print_summary(stats, source_reports, repo)

    # 4. Optional Credibility Assessment
    if args.assess and not args.match_only:
        import json
        cred_service = CredibilityService(repository=repo)
        
        # Load external evidence fixtures if present
        custom_evidence: List[EvidenceItem] = []
        ev_fixture_path = Path(args.evidence_fixture)
        if ev_fixture_path.exists():
            with open(ev_fixture_path, "r", encoding="utf-8") as f:
                ev_data = json.load(f)
                for item in ev_data:
                    custom_evidence.append(EvidenceItem(
                        conference_id=item["conference_id"],
                        category=EvidenceCategory(item["category"]),
                        claim=item["claim"],
                        is_self_claimed=item.get("is_self_claimed", False),
                        source_name=item["source_name"],
                        source_url=item["source_url"],
                        retrieved_at=item["retrieved_at"],
                        supporting_excerpt=item.get("supporting_excerpt"),
                        verification_status=VerificationStatus(item.get("verification_status", "Unverified")),
                        notes=item.get("notes")
                    ))

        target_ids = [args.assess] if args.assess != "all" else [c.id for c in repo.list_all()]
        print("\n" + "=" * 60)
        print("        CREDIBILITY INTELLIGENCE ASSESSMENTS")
        print("=" * 60)
        for cid in target_ids:
            conf_custom = [e for e in custom_evidence if e.conference_id == cid]
            assessment = cred_service.assess_conference(cid, custom_evidence=conf_custom)
            if not assessment:
                print(f"Conference '{cid}' not found in database.")
                continue

            print(f"\n[Conference: {cid}]")
            print(f"  Risk Level:         {assessment.risk_level.value.upper()}")
            print(f"  Credibility Status: {assessment.credibility_status}")
            print(f"  Positive Indicators ({len(assessment.positive_indicators)}):")
            for p in assessment.positive_indicators:
                print(f"    + {p}")
            if assessment.warning_indicators:
                print(f"  Warning Indicators ({len(assessment.warning_indicators)}):")
                for w in assessment.warning_indicators:
                    print(f"    ! {w}")
            if assessment.contradictions:
                print(f"  Contradictions ({len(assessment.contradictions)}):")
                for c in assessment.contradictions:
                    print(f"    X {c}")
            if assessment.missing_information:
                print(f"  Missing Information ({len(assessment.missing_information)}):")
                for m in assessment.missing_information:
                    print(f"    ? {m}")
        print("=" * 60 + "\n")

    # Phase 3: Paper → Conference Matching
    if args.match_title and args.match_abstract:
        paper = PaperInput(
            title=args.match_title,
            abstract=args.match_abstract,
            keywords=[k.strip() for k in args.match_keywords.split(",")] if args.match_keywords else [],
            research_domain=args.match_domain,
            preferred_location=args.match_location,
        )
        cred_service = CredibilityService(repository=repo)
        matcher = MatchingService(repository=repo, credibility_service=cred_service)
        result = matcher.match(paper)
        _print_matching_result(result)
    elif args.match_title or args.match_abstract:
        print("Error: Both --match-title and --match-abstract are required for paper matching.")
        sys.exit(1)


def _print_matching_result(result: MatchingResult):
    """Pretty-print matching results grouped by deadline status."""
    print("\n" + "=" * 70)
    print("        RESEARCHLY.IO — CONFERENCE RECOMMENDATIONS")
    print("=" * 70)
    print(f"  Paper: {result.paper_title}")
    print(f"  Conferences Evaluated: {result.total_conferences_evaluated}")

    _SECTION_LABELS = [
        ("upcoming_open_deadline", "🟢 UPCOMING — Deadline Open (Active Submission Opportunities)"),
        ("upcoming_unknown_deadline", "🟡 UPCOMING — Deadline Unknown"),
        ("upcoming_passed_deadline", "🟠 UPCOMING — Deadline Passed"),
        ("date_unknown", "⚪ Date Unknown"),
        ("historical_completed", "🔴 COMPLETED / HISTORICAL (Reference Only)"),
    ]

    total_recs = 0
    for attr, label in _SECTION_LABELS:
        recs: list[ConferenceRecommendation] = getattr(result, attr, [])
        if not recs:
            continue
        total_recs += len(recs)
        print(f"\n  {label}")
        print("  " + "-" * 66)
        for rec in recs:
            score_bar = "█" * int(rec.relevance_score * 20) + "░" * (20 - int(rec.relevance_score * 20))
            print(f"\n  #{rec.relevance_rank}  {rec.conference_name} {rec.edition_or_year}")
            if rec.title:
                print(f"      {rec.title}")
            print(f"      Relevance:  [{score_bar}] {rec.relevance_score:.1%}")
            print(f"      Status:     {rec.status}")
            if rec.submission_deadline:
                dl_info = rec.submission_deadline
                if rec.days_until_deadline is not None:
                    dl_info += f"  ({rec.days_until_deadline} days)"
                print(f"      Deadline:   {dl_info}")
            if rec.location:
                loc_str = rec.location
                if rec.location_match:
                    loc_str += "  ✓ matches preference"
                print(f"      Location:   {loc_str}")
            if rec.official_website_url:
                print(f"      Website:    {rec.official_website_url}")

            # Credibility
            cred = rec.credibility
            risk_icon = {"Low": "✅", "Medium": "⚠️", "High": "🚨"}.get(cred.risk_level, "❓")
            print(f"      Credibility: {risk_icon} {cred.risk_level}")
            if cred.contradictions:
                for c in cred.contradictions:
                    print(f"        ✗ {c}")
            if cred.warning_indicators:
                for w in cred.warning_indicators:
                    print(f"        ! {w}")

            # Topic overlap
            if rec.topic_overlap.matched_conference_topics:
                print(f"      Topics:     {', '.join(rec.topic_overlap.matched_conference_topics)}")
            if rec.topic_overlap.common_terms:
                print(f"      Key terms:  {', '.join(rec.topic_overlap.common_terms[:6])}")

            # Warnings
            if rec.warnings:
                for w in rec.warnings:
                    print(f"      ⚠ {w}")

    if total_recs == 0:
        print("\n  No matching conferences found above the relevance threshold.")

    print("\n" + "=" * 70 + "\n")


if __name__ == "__main__":
    main()

