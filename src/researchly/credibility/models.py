"""Data models for Evidence, Verification Findings, and Credibility Assessments."""

from __future__ import annotations

from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class EvidenceCategory(str, Enum):
    DOMAIN_AND_WEBSITE = "domain_and_website"
    ORGANIZER_IDENTITY = "organizer_identity"
    PUBLISHER_AND_PROCEEDINGS = "publisher_and_proceedings"
    PREVIOUS_EDITIONS = "previous_editions"
    PROGRAM_COMMITTEE = "program_committee"
    VENUE_AND_DATES = "venue_and_dates"
    FEES_AND_POLICIES = "fees_and_policies"
    INDEXING_CLAIMS = "indexing_claims"
    CONTACT_AND_TRANSPARENCY = "contact_and_transparency"


class VerificationStatus(str, Enum):
    VERIFIED = "Verified"
    CONTRADICTED = "Contradicted"
    UNVERIFIED = "Unverified"
    MISSING = "Missing"


class RiskLevel(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    INSUFFICIENT_EVIDENCE = "Insufficient Evidence"


class EvidenceItem(BaseModel):
    """An individual piece of collected evidence or claim."""
    id: Optional[int] = None
    conference_id: str
    category: EvidenceCategory
    claim: str = Field(description="The factual claim being evaluated")
    is_self_claimed: bool = Field(default=False, description="True if self-claimed by the conference website; False if independently verified")
    source_name: str
    source_url: str
    retrieved_at: str
    supporting_excerpt: Optional[str] = Field(default=None, description="Relevant text excerpt or citation")
    verification_status: VerificationStatus = Field(default=VerificationStatus.UNVERIFIED)
    notes: Optional[str] = None


class VerificationFinding(BaseModel):
    """A rule-based evaluation finding linking a rule to its verdict, reason, and evidence."""
    rule_id: str
    rule_name: str
    category: EvidenceCategory
    status: VerificationStatus
    reason: str
    evidence_ids: List[int] = Field(default_factory=list)
    evidence_excerpts: List[str] = Field(default_factory=list)


class CredibilityAssessment(BaseModel):
    """Overall explainable credibility assessment for a conference edition."""
    id: Optional[int] = None
    conference_id: str
    risk_level: RiskLevel
    credibility_status: str = Field(description="Human-readable explainable summary verdict")
    positive_indicators: List[str] = Field(default_factory=list)
    warning_indicators: List[str] = Field(default_factory=list)
    contradictions: List[str] = Field(default_factory=list)
    missing_information: List[str] = Field(default_factory=list)
    findings: List[VerificationFinding] = Field(default_factory=list)
    assessed_at: str
    version: str = "2.0"

