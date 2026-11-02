"""Eligibility filtering based on temporal conference status."""

from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional, Tuple

from dateutil import parser as date_parser

from ..core.models import NormalizedConference, ConferenceStatus
from ..core.normalizer import determine_conference_status


def classify_conference(
    conf: NormalizedConference,
    reference_date: Optional[date] = None,
) -> ConferenceStatus:
    """Determine the current lifecycle status of a conference.
    
    Uses the status classification logic from the normalizer,
    re-evaluated against the current date (not the date of ingestion).
    """
    ref_str = reference_date.isoformat() if reference_date else None
    return determine_conference_status(
        submission_deadline=conf.submission_deadline,
        start_date=conf.start_date,
        end_date=conf.end_date,
        reference_date_str=ref_str,
    )


def compute_days_until_deadline(
    submission_deadline: Optional[str],
    reference_date: Optional[date] = None,
) -> Optional[int]:
    """Compute the number of days remaining until the submission deadline.
    
    Returns:
        Positive int if deadline is in the future, negative if passed, None if unknown.
    """
    if not submission_deadline:
        return None
    ref = reference_date or date.today()
    try:
        dl_date = date_parser.parse(submission_deadline).date()
        return (dl_date - ref).days
    except Exception:
        return None


def group_by_status(
    conferences: List[Tuple[NormalizedConference, float]],
    reference_date: Optional[date] = None,
) -> dict[str, List[Tuple[NormalizedConference, float, ConferenceStatus, Optional[int]]]]:
    """Group scored conferences by their temporal status.
    
    Args:
        conferences: List of (conference, relevance_score) tuples.
        reference_date: Date to evaluate status against (defaults to today).
        
    Returns:
        Dict mapping status category keys to lists of
        (conference, score, status, days_until_deadline) tuples,
        sorted by relevance score descending within each group.
    """
    groups: dict[str, List] = {
        "upcoming_open_deadline": [],
        "upcoming_passed_deadline": [],
        "upcoming_unknown_deadline": [],
        "historical_completed": [],
        "date_unknown": [],
    }

    STATUS_TO_GROUP = {
        ConferenceStatus.UPCOMING_DEADLINE_OPEN: "upcoming_open_deadline",
        ConferenceStatus.UPCOMING_DEADLINE_PASSED: "upcoming_passed_deadline",
        ConferenceStatus.UPCOMING_DEADLINE_UNKNOWN: "upcoming_unknown_deadline",
        ConferenceStatus.IN_PROGRESS: "upcoming_open_deadline",  # in-progress conferences are still active
        ConferenceStatus.COMPLETED: "historical_completed",
        ConferenceStatus.POSTPONED: "upcoming_unknown_deadline",
        ConferenceStatus.CANCELLED: "historical_completed",
        ConferenceStatus.DATE_UNKNOWN: "date_unknown",
    }

    for conf, score in conferences:
        status = classify_conference(conf, reference_date)
        days_left = compute_days_until_deadline(conf.submission_deadline, reference_date)
        group_key = STATUS_TO_GROUP.get(status, "date_unknown")
        groups[group_key].append((conf, score, status, days_left))

    # Sort each group by relevance score descending
    for key in groups:
        groups[key].sort(key=lambda x: x[1], reverse=True)

    return groups

