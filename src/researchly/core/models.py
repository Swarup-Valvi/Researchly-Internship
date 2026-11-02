"""Common conference data models and schemas for Researchly.io."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, List, Optional
from enum import Enum
from pydantic import BaseModel, Field, field_validator


class EventLifecycleStatus(str, Enum):
    UPCOMING = "Upcoming"
    IN_PROGRESS = "In progress"
    COMPLETED = "Completed"
    POSTPONED = "Postponed"
    CANCELLED = "Cancelled"
    DATE_UNKNOWN = "Date unknown"


class SubmissionLifecycleStatus(str, Enum):
    OPEN = "Open"
    DEADLINE_PASSED = "Deadline passed"
    DEADLINE_UNKNOWN = "Deadline unknown"
    NOT_ACCEPTING = "Not accepting submissions"
    UNVERIFIED = "Submission status unverified"


class ConferenceStatus(str, Enum):
    """Composite status maintained for backwards compatibility."""
    UPCOMING_DEADLINE_OPEN = "Upcoming — deadline open"
    UPCOMING_DEADLINE_PASSED = "Upcoming — deadline passed"
    UPCOMING_DEADLINE_UNKNOWN = "Upcoming — deadline unknown"
    IN_PROGRESS = "In progress"
    COMPLETED = "Completed"
    POSTPONED = "Postponed"
    CANCELLED = "Cancelled"
    DATE_UNKNOWN = "Date unknown"


class EventType(str, Enum):
    CONFERENCE = "conference"
    WORKSHOP = "workshop"
    SYMPOSIUM = "symposium"
    SUMMIT = "summit"
    SEMINAR = "seminar"
    COLLOQUIUM = "colloquium"
    UNKNOWN = "unknown"


class PaperOpportunityStatus(str, Enum):
    CONFIRMED = "confirmed"              # Explicit CFP / paper submission track
    INCOMPLETE = "incomplete"            # Academic event but CFP dates/guidelines not yet posted
    ATTENDANCE_ONLY = "attendance_only"  # Industry summit, exhibition, networking (no paper submission)
    UNVERIFIED = "unverified"            # Listing without verified submission guidelines


def generate_stable_id(name: str, edition_or_year: str) -> str:
    """Generate a deterministic, conservative slug/ID for a conference edition.
    
    e.g. 'ICML' and '2026' -> 'icml-2026'
    """
    clean_name = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
    clean_ed = re.sub(r"[^a-zA-Z0-9]+", "-", str(edition_or_year).strip().lower()).strip("-")
    return f"{clean_name}-{clean_ed}"


class RawConferenceData(BaseModel):
    """Raw extracted conference record prior to strict normalization."""
    source_name: str
    source_url: str
    raw_name: str
    raw_edition_or_year: Optional[str] = None
    raw_topics: Optional[List[str]] = Field(default_factory=list)
    raw_submission_deadline: Optional[str] = None
    raw_start_date: Optional[str] = None
    raw_end_date: Optional[str] = None
    raw_location: Optional[str] = None
    raw_format: Optional[str] = None
    raw_publisher: Optional[str] = None
    raw_organizer: Optional[str] = None
    raw_fees: Optional[str] = None
    raw_official_website: Optional[str] = None
    extra_metadata: Optional[dict[str, Any]] = Field(default_factory=dict)


class NormalizedConference(BaseModel):
    """Canonical normalized conference record."""
    id: str = Field(description="Deterministic primary identifier, e.g. 'icml-2026'")
    name: str = Field(description="Canonical conference acronym or primary name")
    edition_or_year: str = Field(description="Conference edition or year")
    title: Optional[str] = Field(default=None, description="Full descriptive title if known")
    
    topics: List[str] = Field(default_factory=list, description="Topics or research areas")
    
    # Dates
    submission_deadline: Optional[str] = Field(default=None, description="ISO-formatted YYYY-MM-DD or ISO timestamp")
    raw_submission_deadline_str: Optional[str] = Field(default=None, description="Original unparsed string for auditability")
    start_date: Optional[str] = Field(default=None, description="Conference start date YYYY-MM-DD")
    end_date: Optional[str] = Field(default=None, description="Conference end date YYYY-MM-DD")
    
    # Details
    location: Optional[str] = Field(default=None, description="City, Country or TBD")
    format: Optional[str] = Field(default=None, description="In-Person, Hybrid, Virtual, or Unknown")
    publisher: Optional[str] = Field(default=None, description="Publisher (e.g. IEEE, ACM, PMLR)")
    organizer: Optional[str] = Field(default=None, description="Organizer (e.g. IMLS, NeurIPS Foundation)")
    registration_fees: Optional[str] = Field(default=None, description="Registration or submission fee info")
    
    # URLs and Provenance
    official_website_url: Optional[str] = Field(default=None)
    source_name: str = Field(description="Name of the source adapter or fixture")
    source_url: str = Field(description="Exact source URL where data was fetched")
    
    first_discovered_at: str = Field(description="ISO timestamp when record was first ingested")
    last_checked_at: str = Field(description="ISO timestamp of most recent ingest/check")
    
    status: Optional[str] = Field(default=None, description="Dynamic lifecycle status, e.g. Upcoming, Completed, Postponed, Cancelled")
    event_status: str = Field(default="Upcoming", description="Independent event lifecycle status: Upcoming, In progress, Completed, Postponed, Cancelled, Date unknown")
    submission_status: str = Field(default="Deadline unknown", description="Independent submission lifecycle status: Open, Deadline passed, Deadline unknown, Not accepting submissions, Submission status unverified")
    event_type: str = Field(default="conference", description="Event category: conference, workshop, symposium, summit, seminar, colloquium")
    paper_opportunity_status: str = Field(default="unverified", description="Paper submission availability: confirmed, incomplete, attendance_only, unverified")
    has_paper_submission: bool = Field(default=True, description="True if researchers can submit and present papers")
    submission_url: Optional[str] = Field(default=None, description="Direct URL to submission portal or CFP instructions")
    warnings: List[str] = Field(default_factory=list, description="Data-quality warnings")


class SupportingScholarlyMetadata(BaseModel):
    """Supporting scholarly record (OpenAlex, Crossref, DBLP) not treated as a conference edition."""
    id: Optional[int] = None
    conference_id: Optional[str] = Field(default=None, description="Linked conference ID if matched")
    source_name: str
    source_url: str
    entity_name: str
    entity_type: str = "scholarly_source"
    publisher: Optional[str] = None
    homepage_url: Optional[str] = None
    doi_or_issn: Optional[str] = None
    works_count: Optional[int] = None
    publication_year: Optional[str] = None
    retrieved_at: str
    extra_metadata: Optional[dict[str, Any]] = Field(default_factory=dict)


class DeadlineHistory(BaseModel):
    """Audit entry recording changes to submission deadlines."""
    id: Optional[int] = None
    conference_id: str
    previous_deadline: Optional[str]
    new_deadline: Optional[str]
    detected_at: str
    source_name: str
    source_url: str

