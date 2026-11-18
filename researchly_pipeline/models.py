"""Typed models: RawRecord (scraper output) and Conference (final schema)."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Source = Literal["ieee", "acm", "springer", "wikicfp", "individual"]
Method = Literal["structured", "heuristic", "llm_assisted"]
Claim = Literal["claimed", "verified", "unknown"]

# Higher index = lower precedence. Used for merging authoritative fields.
SOURCE_PRECEDENCE: list[str] = ["ieee", "acm", "springer", "individual", "wikicfp"]


class RawRecord(BaseModel):
    """What a scraper emits: mostly raw strings, nothing invented."""

    source: Source
    source_url: str
    extra_source_urls: list[str] = Field(default_factory=list)
    website_url: Optional[str] = None
    name: Optional[str] = None
    acronym: Optional[str] = None
    year: Optional[int] = None
    edition: Optional[str] = None
    dates_text: Optional[str] = None
    location_text: Optional[str] = None
    venue: Optional[str] = None
    deadline_text: Optional[str] = None
    notification_text: Optional[str] = None
    camera_ready_text: Optional[str] = None
    topics: list[str] = Field(default_factory=list)
    publisher: Optional[str] = None
    sponsors_text: list[str] = Field(default_factory=list)
    sponsor_listed_by_publisher: bool = False  # True only if the publisher's own page lists the event
    indexing_text: Optional[str] = None  # raw claim text, scanned later
    fees_text: Optional[str] = None
    claim_snippets: list[str] = Field(default_factory=list)  # raw sentences: indexing / fee / sponsor / red-flag wording
    committee: list[dict] = Field(default_factory=list)  # {"name", "affiliation"|None}; names only, no contact data
    ranking: list[dict] = Field(default_factory=list)
    tracks: list[dict] = Field(default_factory=list)  # {"name": str, "deadline_text": str|None}
    is_virtual: Optional[bool] = None
    extraction_method: Method = "heuristic"
    raw_snapshot_ref: Optional[str] = None
    scraped_at: Optional[str] = None


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Location(_Strict):
    city: Optional[str] = None
    country: Optional[str] = None
    venue: Optional[str] = None
    is_virtual: bool = False


class Dates(_Strict):
    conference_start: Optional[str] = None
    conference_end: Optional[str] = None
    submission_deadline: Optional[str] = None
    notification_date: Optional[str] = None
    camera_ready: Optional[str] = None
    deadline_timezone: Optional[str] = None


class Track(_Strict):
    name: str
    deadline: Optional[str] = None


class Sponsors(_Strict):
    claimed: list[str] = Field(default_factory=list)
    verified_source: Optional[str] = None


class IndexingClaims(_Strict):
    scopus: Claim = "unknown"
    wos: Claim = "unknown"
    dblp: Claim = "unknown"


class RankingClaim(_Strict):
    system: str
    value: str
    source_url: str


class CommitteeMember(_Strict):
    """Public program-committee listing: name + stated affiliation only. Never contact data."""
    name: str
    affiliation: Optional[str] = None


class Fees(_Strict):
    currency: Optional[str] = None
    amount: Optional[float] = None
    notes: Optional[str] = None


class Provenance(_Strict):
    primary_source: Source
    source_urls: list[str]
    scraped_at: str
    extraction_method: Method
    confidence: float


class Dedup(_Strict):
    merged_from: list[str] = Field(default_factory=list)
    canonical_source: Source


class Conference(_Strict):
    conference_id: str
    canonical_name: str
    acronym: Optional[str] = None
    year: int
    edition: Optional[str] = None
    website_url: str
    location: Location = Field(default_factory=Location)
    dates: Dates = Field(default_factory=Dates)
    topics: list[str] = Field(default_factory=list)
    tracks: list[Track] = Field(default_factory=list)
    publisher: Optional[str] = None
    sponsors: Sponsors = Field(default_factory=Sponsors)
    indexing_claims: IndexingClaims = Field(default_factory=IndexingClaims)
    ranking_claims: list[RankingClaim] = Field(default_factory=list)
    fees: Fees = Field(default_factory=Fees)
    claim_snippets: list[str] = Field(default_factory=list)
    committee: list[CommitteeMember] = Field(default_factory=list)
    provenance: Provenance
    raw_snapshot_ref: Optional[str] = None
    dedup: Dedup
