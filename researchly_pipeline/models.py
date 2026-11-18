"""Typed models: RawRecord (scraper output) and Conference (final schema)."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Source = Literal["ieee", "acm", "springer", "wikicfp", "individual", "ccfddl"]
Method = Literal["structured", "heuristic", "llm_assisted"]
Claim = Literal["claimed", "verified", "unknown"]

# Higher index = lower precedence. Used for merging authoritative fields.
SOURCE_PRECEDENCE: list[str] = ["ieee", "acm", "springer", "individual", "ccfddl", "wikicfp"]


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
    dblp_key: Optional[str] = None  # e.g. "aaai" (dblp.org/db/conf/aaai/), from a structured dataset only
    dataset_version: Optional[str] = None  # e.g. the ccfddl git commit SHA the record was read from
    series_years: list[int] = Field(default_factory=list)  # years this series is listed in the structured dataset
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


class Conflict(_Strict):
    """Two sources disagreed on a field. The kept value is never silently overwritten."""
    field: str
    kept: Any
    kept_source: str
    discarded: Any
    discarded_source: str
    quote: Optional[str] = None
    detected_at: str


class Provenance(_Strict):
    primary_source: Source
    source_urls: list[str]
    scraped_at: str
    extraction_method: Method
    confidence: float
    dataset_version: Optional[str] = None  # e.g. "ccfddl@<git sha>"
    conflicts: list[Conflict] = Field(default_factory=list)


class EnrichedField(_Strict):
    """One LLM-extracted value that passed the verification gate (quote found verbatim in the fetched page)."""
    field: str
    value: Any
    quote: str
    source_url: str
    extraction_method: Literal["llm_grounded"] = "llm_grounded"
    model: str
    extracted_at: str


RiskCategory = Literal["guaranteed_acceptance", "publish_in_days", "fast_review", "fee_only", "no_named_committee"]


class RiskPhrase(_Strict):
    """A risk phrase found on a page we fetched. The quote is verbatim from that page; the category is confirmed by
    code (extractors/risk_phrases.py), never taken from the model alone."""
    category: RiskCategory
    quote: str
    source_url: str
    method: Literal["pattern", "llm_grounded"]
    found_at: str


class RejectedQuote(_Strict):
    """An LLM item dropped by the verification gate (kept for audit/eval; email local parts redacted)."""
    field: str
    quote: Optional[str] = None
    reason: str


class Lookup(_Strict):
    """Result of one live evidence lookup (DBLP SPARQL, RDAP, OpenAlex). ok=False -> engine reports not_checked."""
    ok: bool
    error: Optional[str] = None
    data: dict[str, Any] = Field(default_factory=dict)
    evidence_url: Optional[str] = None
    checked_at: str


class Lookups(_Strict):
    dblp: Optional[Lookup] = None
    rdap: Optional[Lookup] = None
    committee: Optional[Lookup] = None   # AGGREGATE counts only, never names
    input_hash: Optional[str] = None


EnrichmentStatus = Literal["enriched", "no_verified_fields", "cached_unchanged", "skipped_robots", "skipped_fetch_error",
                           "skipped_no_api_key", "skipped_not_reviewed", "llm_error"]


class Enrichment(_Strict):
    status: EnrichmentStatus
    checked_at: str
    content_hash: Optional[str] = None
    model: Optional[str] = None
    fields: list[EnrichedField] = Field(default_factory=list)
    hallucination_rejected: int = 0
    pages_read: list[str] = Field(default_factory=list)       # every page whose full text was scanned
    rejected: list[RejectedQuote] = Field(default_factory=list)


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
    dblp_key: Optional[str] = None
    proceedings_series: Optional[str] = None        # grounded LLM enrichment only
    contact_email_domain: Optional[str] = None      # domain only (never the address), grounded LLM enrichment only
    organizer: Optional[str] = None                 # grounded LLM enrichment only
    peer_review_statement: Optional[str] = None     # verbatim quote, grounded LLM enrichment only
    risk_phrases: list[RiskPhrase] = Field(default_factory=list)
    series_years: list[int] = Field(default_factory=list)
    lookups: Optional[Lookups] = None
    enrichment: Optional[Enrichment] = None
    provenance: Provenance
    raw_snapshot_ref: Optional[str] = None
    dedup: Dedup
