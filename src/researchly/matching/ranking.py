"""Ranking logic combining relevance, eligibility, location, and credibility."""

from __future__ import annotations

from typing import List, Optional, Tuple

from ..core.models import NormalizedConference, ConferenceStatus
from ..credibility.models import CredibilityAssessment, RiskLevel
from .models import TopicOverlap


def compute_location_match(
    conference_location: Optional[str],
    preferred_location: Optional[str],
) -> bool:
    """Check whether a conference location loosely matches the user's preference.
    
    Uses case-insensitive substring matching as a lightweight heuristic.
    """
    if not preferred_location or not conference_location:
        return False
    pref_lower = preferred_location.strip().lower()
    loc_lower = conference_location.strip().lower()
    # Check if any significant word from preferred location appears in conference location
    pref_words = [w for w in pref_lower.split() if len(w) > 2]
    return any(w in loc_lower for w in pref_words)


def compute_topic_overlap(
    paper_keywords: List[str],
    conference_topics: List[str],
    common_tfidf_terms: List[str],
) -> TopicOverlap:
    """Determine which topics/keywords overlap between paper and conference.
    
    Uses case-insensitive matching on the original (unstemmed) keywords and topics.
    """
    paper_kw_lower = {kw.lower() for kw in paper_keywords}
    conf_topic_lower = {t.lower(): t for t in conference_topics}

    matched_conf = []
    matched_paper = []

    for kw in paper_keywords:
        kw_l = kw.lower()
        for t_l, t_orig in conf_topic_lower.items():
            # Check if keyword is a substring of topic or vice versa
            if kw_l in t_l or t_l in kw_l:
                if t_orig not in matched_conf:
                    matched_conf.append(t_orig)
                if kw not in matched_paper:
                    matched_paper.append(kw)

    return TopicOverlap(
        matched_conference_topics=matched_conf,
        matched_paper_keywords=matched_paper,
        common_terms=common_tfidf_terms,
    )


def build_match_explanation(
    conference_name: str,
    edition: str,
    relevance_score: float,
    topic_overlap: TopicOverlap,
    status: ConferenceStatus,
    days_until_deadline: Optional[int],
    location: Optional[str],
    location_match: bool,
    risk_level: Optional[str],
) -> str:
    """Generate a human-readable explanation for why a paper matches this conference.
    
    Does not generate unsupported claims — only reports observed evidence.
    """
    parts = []

    # Relevance explanation
    score_pct = round(relevance_score * 100, 1)
    parts.append(f"Relevance: {score_pct}% text similarity with {conference_name} {edition}.")

    # Topic overlap
    if topic_overlap.matched_conference_topics:
        topics_str = ", ".join(topic_overlap.matched_conference_topics)
        parts.append(f"Matching topics: {topics_str}.")
    if topic_overlap.common_terms:
        terms_str = ", ".join(topic_overlap.common_terms[:8])
        parts.append(f"Key shared terms: {terms_str}.")

    # Deadline info
    if status == ConferenceStatus.UPCOMING_DEADLINE_OPEN and days_until_deadline is not None:
        if days_until_deadline > 0:
            parts.append(f"Submission deadline is in {days_until_deadline} day(s).")
        elif days_until_deadline == 0:
            parts.append("Submission deadline is TODAY.")
    elif status == ConferenceStatus.UPCOMING_DEADLINE_PASSED:
        parts.append("Submission deadline has passed.")
    elif status == ConferenceStatus.COMPLETED:
        parts.append("This conference has already concluded. Listed for reference only.")
    elif status == ConferenceStatus.UPCOMING_DEADLINE_UNKNOWN:
        parts.append("Submission deadline is not yet announced.")

    # Location
    if location:
        loc_note = f"Location: {location}."
        if location_match:
            loc_note += " (matches your preference)"
        parts.append(loc_note)

    # Credibility warning
    if risk_level and risk_level in ("High", "Insufficient Evidence"):
        parts.append(f"⚠ Credibility: {risk_level} risk — review the credibility assessment carefully before submitting.")
    elif risk_level == "Medium":
        parts.append(f"Credibility: {risk_level} risk — some verification gaps exist.")

    return " ".join(parts)

