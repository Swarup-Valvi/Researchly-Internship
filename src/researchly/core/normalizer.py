"""Date parsing and record normalization logic."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Optional, Tuple, List
from dateutil import parser as date_parser

from .models import (
    RawConferenceData,
    NormalizedConference,
    ConferenceStatus,
    EventLifecycleStatus,
    SubmissionLifecycleStatus,
    EventType,
    PaperOpportunityStatus,
    generate_stable_id
)


def classify_event_type(name: str, title: Optional[str] = None, metadata: Optional[dict] = None) -> EventType:
    """Classify the event type based on name, title and metadata evidence."""
    combined = f"{name} {title or ''}".lower()
    
    if metadata and metadata.get("event_type"):
        et = metadata["event_type"].lower()
        if "workshop" in et:
            return EventType.WORKSHOP
        if "symposium" in et:
            return EventType.SYMPOSIUM
        if "summit" in et:
            return EventType.SUMMIT
        if "seminar" in et:
            return EventType.SEMINAR
        if "colloquium" in et or "doctoral consortium" in et:
            return EventType.COLLOQUIUM
        if "conference" in et:
            return EventType.CONFERENCE

    if "workshop" in combined:
        return EventType.WORKSHOP
    elif "symposium" in combined or "doctoral consortium" in combined:
        return EventType.SYMPOSIUM
    elif "colloquium" in combined or "doctoral colloquium" in combined or "consortium" in combined:
        return EventType.COLLOQUIUM
    elif "summit" in combined or "expo" in combined or "exhibition" in combined:
        return EventType.SUMMIT
    elif "seminar" in combined or "webinar" in combined:
        return EventType.SEMINAR
    elif "conference" in combined or "congress" in combined or "annual meeting" in combined or "student research" in combined or "stus" in combined:
        return EventType.CONFERENCE
    return EventType.CONFERENCE


def classify_paper_opportunity(
    raw: RawConferenceData,
    event_type: EventType,
    submission_deadline: Optional[str]
) -> Tuple[PaperOpportunityStatus, bool, Optional[str]]:
    """Determine whether researchers can submit/present papers, or if it's attendance-only.
    
    Returns:
        (paper_opportunity_status, has_paper_submission, submission_url)
    """
    metadata = raw.extra_metadata or {}
    
    # 1. Explicit override from metadata if provided
    if "has_paper_submission" in metadata and metadata["has_paper_submission"] is False:
        return PaperOpportunityStatus.ATTENDANCE_ONLY, False, None

    submission_url = metadata.get("submission_url") or metadata.get("cfp_url")
    
    # 2. Check for attendance-only summit/exhibition/expo without CFP
    combined_text = f"{raw.raw_name} {metadata.get('title', '')}".lower()
    if event_type in (EventType.SUMMIT, EventType.SEMINAR) and not submission_deadline and not submission_url:
        return PaperOpportunityStatus.ATTENDANCE_ONLY, False, None

    # 3. Confirmed: Has valid, announced submission deadline OR verified direct submission portal
    if submission_deadline:
        return PaperOpportunityStatus.CONFIRMED, True, submission_url

    # 4. Incomplete: Academic event (conference/workshop/symposium) or OpenReview group with deadline pending/TBD
    if event_type in (EventType.CONFERENCE, EventType.WORKSHOP, EventType.SYMPOSIUM, EventType.COLLOQUIUM) or metadata.get("source_type") in ("cfp_aggregator", "openreview"):
        return PaperOpportunityStatus.INCOMPLETE, True, submission_url

    return PaperOpportunityStatus.UNVERIFIED, True, submission_url


def determine_lifecycles(
    submission_deadline: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
    reference_date_str: Optional[str] = None,
    raw_status_hint: Optional[str] = None,
    has_paper_submission: bool = True
) -> Tuple[EventLifecycleStatus, SubmissionLifecycleStatus, ConferenceStatus]:
    """Calculate independent Event Lifecycle and Submission Lifecycle statuses dynamically.
    
    Returns:
        (event_status, submission_status, legacy_conference_status)
    """
    if not reference_date_str:
        ref_date = datetime.utcnow().date()
    else:
        try:
            ref_date = date_parser.parse(reference_date_str).date()
        except Exception:
            ref_date = datetime.utcnow().date()

    # Parse start and end dates
    s_date = None
    if start_date:
        try:
            s_date = date_parser.parse(start_date).date()
        except Exception:
            pass

    e_date = None
    if end_date:
        try:
            e_date = date_parser.parse(end_date).date()
        except Exception:
            pass
    elif s_date:
        e_date = s_date

    # Parse submission deadline date
    dl_date = None
    if submission_deadline:
        try:
            dl_date = date_parser.parse(submission_deadline).date()
        except Exception:
            pass

    # 1. Determine Event Lifecycle Status
    if raw_status_hint:
        hint_lower = raw_status_hint.lower()
        if "postpone" in hint_lower or "rescheduled" in hint_lower:
            event_status = EventLifecycleStatus.POSTPONED
        elif "cancel" in hint_lower or "call off" in hint_lower:
            event_status = EventLifecycleStatus.CANCELLED
        elif e_date and e_date < ref_date:
            event_status = EventLifecycleStatus.COMPLETED
        elif s_date and e_date and s_date <= ref_date <= e_date:
            event_status = EventLifecycleStatus.IN_PROGRESS
        elif s_date and s_date > ref_date:
            event_status = EventLifecycleStatus.UPCOMING
        elif s_date and s_date < ref_date:
            event_status = EventLifecycleStatus.COMPLETED
        else:
            event_status = EventLifecycleStatus.DATE_UNKNOWN
    elif e_date and e_date < ref_date:
        event_status = EventLifecycleStatus.COMPLETED
    elif s_date and e_date and s_date <= ref_date <= e_date:
        event_status = EventLifecycleStatus.IN_PROGRESS
    elif s_date and s_date > ref_date:
        event_status = EventLifecycleStatus.UPCOMING
    elif s_date and s_date < ref_date:
        event_status = EventLifecycleStatus.COMPLETED
    elif dl_date and dl_date < ref_date:
        # If event start date is unannounced but submission deadline was in the past
        event_status = EventLifecycleStatus.DATE_UNKNOWN
    else:
        event_status = EventLifecycleStatus.DATE_UNKNOWN

    # 2. Determine Submission Lifecycle Status
    if not has_paper_submission:
        sub_status = SubmissionLifecycleStatus.NOT_ACCEPTING
    elif dl_date:
        if dl_date >= ref_date:
            sub_status = SubmissionLifecycleStatus.OPEN
        else:
            sub_status = SubmissionLifecycleStatus.DEADLINE_PASSED
    else:
        sub_status = SubmissionLifecycleStatus.DEADLINE_UNKNOWN

    # 3. Derive legacy composite status for backwards compatibility
    if event_status == EventLifecycleStatus.CANCELLED:
        comp_status = ConferenceStatus.CANCELLED
    elif event_status == EventLifecycleStatus.POSTPONED:
        comp_status = ConferenceStatus.POSTPONED
    elif event_status == EventLifecycleStatus.COMPLETED:
        comp_status = ConferenceStatus.COMPLETED
    elif event_status == EventLifecycleStatus.IN_PROGRESS:
        comp_status = ConferenceStatus.IN_PROGRESS
    elif event_status == EventLifecycleStatus.UPCOMING:
        if sub_status == SubmissionLifecycleStatus.OPEN:
            comp_status = ConferenceStatus.UPCOMING_DEADLINE_OPEN
        elif sub_status == SubmissionLifecycleStatus.DEADLINE_PASSED:
            comp_status = ConferenceStatus.UPCOMING_DEADLINE_PASSED
        else:
            comp_status = ConferenceStatus.UPCOMING_DEADLINE_UNKNOWN
    elif sub_status == SubmissionLifecycleStatus.OPEN:
        comp_status = ConferenceStatus.UPCOMING_DEADLINE_OPEN
    elif sub_status == SubmissionLifecycleStatus.DEADLINE_PASSED:
        comp_status = ConferenceStatus.UPCOMING_DEADLINE_PASSED
    else:
        comp_status = ConferenceStatus.DATE_UNKNOWN

    return event_status, sub_status, comp_status


def determine_conference_status(
    submission_deadline: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
    reference_date_str: Optional[str] = None,
    raw_status_hint: Optional[str] = None
) -> ConferenceStatus:
    """Classify conference lifecycle status dynamically relative to current date (legacy wrapper)."""
    _, _, comp = determine_lifecycles(
        submission_deadline=submission_deadline,
        start_date=start_date,
        end_date=end_date,
        reference_date_str=reference_date_str,
        raw_status_hint=raw_status_hint,
    )
    return comp


def parse_date_to_iso(date_str: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Parse flexible date strings into YYYY-MM-DD or ISO timestamp.
    
    Returns (normalized_iso_string, warning_message_if_any).
    Handles strings like:
      - 'Jan 28 2026 (Anywhere on Earth)'
      - 'July 6th - 11th, 2026'
      - '2026-05-15'
    """
    if not date_str or not date_str.strip():
        return None, None

    cleaned = date_str.strip()
    # Remove AoE / timezone colloquialisms that confuse fuzzy parsers
    cleaned_for_parser = re.sub(r"\(Anywhere on Earth\)", "", cleaned, flags=re.IGNORECASE)
    cleaned_for_parser = re.sub(r"AoE", "", cleaned_for_parser, flags=re.IGNORECASE).strip()
    
    # Remove ordinal suffixes: 1st, 2nd, 3rd, 4th -> 1, 2, 3, 4
    cleaned_for_parser = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", cleaned_for_parser)

    try:
        dt = date_parser.parse(cleaned_for_parser, fuzzy=True)
        return dt.strftime("%Y-%m-%d"), None
    except Exception as e:
        return None, f"Could not parse date string '{date_str}': {str(e)}"


def normalize_conference(raw: RawConferenceData, now_iso: Optional[str] = None) -> NormalizedConference:
    """Transform RawConferenceData into canonical NormalizedConference with validation."""
    if not now_iso:
        now_iso = datetime.utcnow().isoformat() + "Z"

    warnings: List[str] = []

    # 1. Name & Edition / Year
    name = (raw.raw_name or "").strip()
    if not name:
        warnings.append("Missing raw conference name; assigned 'UNKNOWN'")
        name = "UNKNOWN"

    edition = (raw.raw_edition_or_year or "").strip()
    if not edition:
        # Check if year is embedded in the name (e.g. 'ICML 2026' or 'ACL 2025')
        match = re.search(r"\b(19\d\d|20\d\d)\b", name)
        if match:
            edition = match.group(1)
            # Retain conference base name cleanly
            name = re.sub(r"\b(19\d\d|20\d\d)\b", "", name).strip()
        else:
            edition = "unknown"
            warnings.append("Missing conference year or edition")
    else:
        # If edition was provided separately, ensure name doesn't redundantly duplicate the edition
        # e.g., raw_name="ICML 2026", raw_edition_or_year="2026"
        name = re.sub(rf"\b{re.escape(edition)}\b", "", name).strip()

    conf_id = generate_stable_id(name, edition)

    # 2. Submission Deadline
    sub_deadline = None
    if raw.raw_submission_deadline:
        parsed_dl, dl_warn = parse_date_to_iso(raw.raw_submission_deadline)
        sub_deadline = parsed_dl
        if dl_warn:
            warnings.append(dl_warn)
    else:
        warnings.append("Submission deadline missing or unannounced")

    # 3. Start & End Dates
    start_date = None
    if raw.raw_start_date:
        parsed_start, s_warn = parse_date_to_iso(raw.raw_start_date)
        start_date = parsed_start
        if s_warn:
            warnings.append(s_warn)

    end_date = None
    if raw.raw_end_date:
        parsed_end, e_warn = parse_date_to_iso(raw.raw_end_date)
        end_date = parsed_end
        if e_warn:
            warnings.append(e_warn)

    # 4. Format normalization
    fmt = raw.raw_format
    if fmt:
        f_lower = fmt.lower()
        if "hybrid" in f_lower:
            fmt = "Hybrid"
        elif "virtual" in f_lower or "online" in f_lower:
            fmt = "Virtual"
        elif "in-person" in f_lower or "person" in f_lower or "onsite" in f_lower:
            fmt = "In-Person"
        else:
            fmt = fmt.strip()
    else:
        fmt = "Unknown"

    # 5. Missing critical field warnings
    if not raw.raw_location and fmt != "Virtual":
        warnings.append("Conference location not specified")

    if not raw.raw_official_website:
        warnings.append("Official website URL missing")

    # Clean topics
    topics = [t.strip() for t in (raw.raw_topics or []) if t and t.strip()]

    # Event type and paper opportunity classification
    title_str = raw.extra_metadata.get("title") if raw.extra_metadata else None
    event_type = classify_event_type(name, title_str, raw.extra_metadata)
    opp_status, has_paper_sub, sub_url = classify_paper_opportunity(raw, event_type, sub_deadline)

    # Dynamic independent lifecycle statuses
    status_hint = raw.extra_metadata.get("status_hint") if raw.extra_metadata else None
    evt_status, sub_status, comp_status = determine_lifecycles(
        submission_deadline=sub_deadline,
        start_date=start_date,
        end_date=end_date,
        reference_date_str=now_iso,
        raw_status_hint=status_hint,
        has_paper_submission=has_paper_sub
    )

    # Specific warnings for incomplete or attendance-only
    if opp_status == PaperOpportunityStatus.ATTENDANCE_ONLY:
        warnings.append("Attendance-only event: no academic paper submission track identified.")
    elif opp_status == PaperOpportunityStatus.INCOMPLETE:
        warnings.append("Academic event with unannounced submission deadlines or guidelines.")

    return NormalizedConference(
        id=conf_id,
        name=name,
        edition_or_year=edition,
        title=title_str,
        topics=topics,
        submission_deadline=sub_deadline,
        raw_submission_deadline_str=raw.raw_submission_deadline,
        start_date=start_date,
        end_date=end_date,
        location=raw.raw_location.strip() if raw.raw_location else None,
        format=fmt,
        publisher=raw.raw_publisher.strip() if raw.raw_publisher else None,
        organizer=raw.raw_organizer.strip() if raw.raw_organizer else None,
        registration_fees=raw.raw_fees.strip() if raw.raw_fees else None,
        official_website_url=raw.raw_official_website.strip() if raw.raw_official_website else None,
        source_name=raw.source_name,
        source_url=raw.source_url,
        first_discovered_at=now_iso,
        last_checked_at=now_iso,
        status=comp_status.value,
        event_status=evt_status.value,
        submission_status=sub_status.value,
        event_type=event_type.value,
        paper_opportunity_status=opp_status.value,
        has_paper_submission=has_paper_sub,
        submission_url=sub_url,
        warnings=warnings,
    )

