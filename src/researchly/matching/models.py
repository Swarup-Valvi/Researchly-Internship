"""Input and output models for the matching engine."""

from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field


class PaperInput(BaseModel):
    """Research paper details submitted for conference matching."""
    title: str = Field(description="Paper title (required)")
    abstract: str = Field(description="Paper abstract (required)")
    keywords: List[str] = Field(default_factory=list, description="Author-supplied keywords")
    research_domain: Optional[str] = Field(default=None, description="Broad research domain, e.g. 'Computer Vision'")
    preferred_location: Optional[str] = Field(default=None, description="Preferred conference location")


class TopicOverlap(BaseModel):
    """Details about which topics/keywords matched between paper and conference."""
    matched_conference_topics: List[str] = Field(default_factory=list)
    matched_paper_keywords: List[str] = Field(default_factory=list)
    common_terms: List[str] = Field(default_factory=list, description="High-weight terms shared between paper and conference")


class CredibilitySummary(BaseModel):
    """Credibility assessment summary attached to each recommendation."""
    risk_level: str
    credibility_status: str
    positive_indicators: List[str] = Field(default_factory=list)
    warning_indicators: List[str] = Field(default_factory=list)
    contradictions: List[str] = Field(default_factory=list)
    missing_information: List[str] = Field(default_factory=list)
    assessed: bool = Field(default=False, description="Whether a credibility assessment exists")


class ConferenceRecommendation(BaseModel):
    """A single conference recommendation with relevance, credibility, and explanation."""
    conference_id: str
    conference_name: str
    edition_or_year: str
    title: Optional[str] = None

    # Relevance
    relevance_score: float = Field(description="0.0–1.0 relevance score based on text similarity")
    relevance_rank: int = Field(description="1-based rank within this result category")

    # Temporal classification
    status: str = Field(description="Conference lifecycle status")
    submission_deadline: Optional[str] = None
    days_until_deadline: Optional[int] = None

    # Location
    location: Optional[str] = None
    location_match: bool = Field(default=False, description="True if location matches preferred location")

    # Credibility
    credibility: CredibilitySummary

    # Explanation
    topic_overlap: TopicOverlap
    match_explanation: str = Field(description="Human-readable explanation of why this paper matches")
    official_website_url: Optional[str] = None
    warnings: List[str] = Field(default_factory=list, description="Data-quality warnings from ingestion")


class MatchingResult(BaseModel):
    """Complete matching response grouping recommendations by deadline status."""
    paper_title: str
    total_conferences_evaluated: int

    # Results separated by temporal eligibility
    upcoming_open_deadline: List[ConferenceRecommendation] = Field(default_factory=list)
    upcoming_passed_deadline: List[ConferenceRecommendation] = Field(default_factory=list)
    upcoming_unknown_deadline: List[ConferenceRecommendation] = Field(default_factory=list)
    historical_completed: List[ConferenceRecommendation] = Field(default_factory=list)
    date_unknown: List[ConferenceRecommendation] = Field(default_factory=list)

