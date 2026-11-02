"""Evidence collection layer for Researchly.io conferences."""

from __future__ import annotations

import re
import urllib.request
from datetime import datetime
from typing import List, Optional
from bs4 import BeautifulSoup

from .models import EvidenceItem, EvidenceCategory, VerificationStatus
from ..core.models import NormalizedConference


class EvidenceCollector:
    """Collects evidence items across categories for a given conference."""

    def __init__(self, timeout_sec: int = 5):
        self.timeout_sec = timeout_sec

    def collect_from_conference(self, conf: NormalizedConference) -> List[EvidenceItem]:
        """Gathers evidence items from conference metadata and official web presence."""
        evidence: List[EvidenceItem] = []
        now_iso = datetime.utcnow().isoformat() + "Z"

        # 1. Official website & domain
        if conf.official_website_url:
            evidence.append(EvidenceItem(
                conference_id=conf.id,
                category=EvidenceCategory.DOMAIN_AND_WEBSITE,
                claim=f"Conference has an official web domain at {conf.official_website_url}",
                is_self_claimed=False,
                source_name=conf.source_name,
                source_url=conf.source_url,
                retrieved_at=now_iso,
                supporting_excerpt=f"Official website: {conf.official_website_url}",
                verification_status=VerificationStatus.VERIFIED,
            ))
        else:
            evidence.append(EvidenceItem(
                conference_id=conf.id,
                category=EvidenceCategory.DOMAIN_AND_WEBSITE,
                claim="Official website is unavailable or missing",
                is_self_claimed=False,
                source_name=conf.source_name,
                source_url=conf.source_url,
                retrieved_at=now_iso,
                supporting_excerpt=None,
                verification_status=VerificationStatus.MISSING,
            ))

        # 2. Organizer identity & background
        if conf.organizer:
            evidence.append(EvidenceItem(
                conference_id=conf.id,
                category=EvidenceCategory.ORGANIZER_IDENTITY,
                claim=f"Conference is organized by {conf.organizer}",
                is_self_claimed=False,
                source_name=conf.source_name,
                source_url=conf.source_url,
                retrieved_at=now_iso,
                supporting_excerpt=f"Organizer evidence: {conf.organizer}",
                verification_status=VerificationStatus.VERIFIED,
            ))
        else:
            evidence.append(EvidenceItem(
                conference_id=conf.id,
                category=EvidenceCategory.ORGANIZER_IDENTITY,
                claim="Organizer identity is not disclosed or verified",
                is_self_claimed=False,
                source_name=conf.source_name,
                source_url=conf.source_url,
                retrieved_at=now_iso,
                supporting_excerpt=None,
                verification_status=VerificationStatus.MISSING,
            ))

        # 3. Publisher and publication arrangements
        if conf.publisher:
            evidence.append(EvidenceItem(
                conference_id=conf.id,
                category=EvidenceCategory.PUBLISHER_AND_PROCEEDINGS,
                claim=f"Proceedings published by {conf.publisher}",
                is_self_claimed=False,
                source_name=conf.source_name,
                source_url=conf.source_url,
                retrieved_at=now_iso,
                supporting_excerpt=f"Publisher: {conf.publisher}",
                verification_status=VerificationStatus.VERIFIED,
            ))
        else:
            evidence.append(EvidenceItem(
                conference_id=conf.id,
                category=EvidenceCategory.PUBLISHER_AND_PROCEEDINGS,
                claim="Publication arrangements / publisher not disclosed",
                is_self_claimed=False,
                source_name=conf.source_name,
                source_url=conf.source_url,
                retrieved_at=now_iso,
                supporting_excerpt=None,
                verification_status=VerificationStatus.MISSING,
            ))

        # 4. Previous conference editions
        # Established history requires evidence of preceding editions, e.g. from title ordinals or known established editions
        has_history_evidence = False
        if conf.title and any(ord_word in conf.title.lower() for ord_word in ["second", "third", "fourth", "fifth", "annual", "th "]):
            has_history_evidence = True

        if has_history_evidence:
            evidence.append(EvidenceItem(
                conference_id=conf.id,
                category=EvidenceCategory.PREVIOUS_EDITIONS,
                claim=f"Conference has documented prior editions and track record leading to edition {conf.edition_or_year}",
                is_self_claimed=False,
                source_name=conf.source_name,
                source_url=conf.source_url,
                retrieved_at=now_iso,
                supporting_excerpt=f"Conference title / metadata: {conf.title or conf.edition_or_year}",
                verification_status=VerificationStatus.VERIFIED,
            ))
        else:
            evidence.append(EvidenceItem(
                conference_id=conf.id,
                category=EvidenceCategory.PREVIOUS_EDITIONS,
                claim="Previous conference editions or established archives not verified",
                is_self_claimed=False,
                source_name=conf.source_name,
                source_url=conf.source_url,
                retrieved_at=now_iso,
                supporting_excerpt=None,
                verification_status=VerificationStatus.MISSING,
            ))

        # 5. Dates and venue consistency
        if conf.start_date and conf.location:
            evidence.append(EvidenceItem(
                conference_id=conf.id,
                category=EvidenceCategory.VENUE_AND_DATES,
                claim=f"Dates ({conf.start_date} to {conf.end_date or conf.start_date}) and venue ({conf.location}) specified",
                is_self_claimed=False,
                source_name=conf.source_name,
                source_url=conf.source_url,
                retrieved_at=now_iso,
                supporting_excerpt=f"Location: {conf.location}, Dates: {conf.start_date} to {conf.end_date}",
                verification_status=VerificationStatus.VERIFIED,
            ))
        else:
            evidence.append(EvidenceItem(
                conference_id=conf.id,
                category=EvidenceCategory.VENUE_AND_DATES,
                claim="Specific physical/virtual venue or dates incomplete",
                is_self_claimed=False,
                source_name=conf.source_name,
                source_url=conf.source_url,
                retrieved_at=now_iso,
                supporting_excerpt=None,
                verification_status=VerificationStatus.MISSING,
            ))

        # 6. Fees and policies
        if conf.registration_fees:
            evidence.append(EvidenceItem(
                conference_id=conf.id,
                category=EvidenceCategory.FEES_AND_POLICIES,
                claim=f"Registration fees and pricing transparently published: {conf.registration_fees}",
                is_self_claimed=True,
                source_name=conf.source_name,
                source_url=conf.source_url,
                retrieved_at=now_iso,
                supporting_excerpt=f"Fees: {conf.registration_fees}",
                verification_status=VerificationStatus.VERIFIED,
            ))
        else:
            evidence.append(EvidenceItem(
                conference_id=conf.id,
                category=EvidenceCategory.FEES_AND_POLICIES,
                claim="Registration or submission fee policies not disclosed",
                is_self_claimed=False,
                source_name=conf.source_name,
                source_url=conf.source_url,
                retrieved_at=now_iso,
                supporting_excerpt=None,
                verification_status=VerificationStatus.MISSING,
            ))

        return evidence
