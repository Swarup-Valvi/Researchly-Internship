"""FastAPI backend for Researchly.io frontend integration."""

from __future__ import annotations

import os
from datetime import date
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from ..storage.repository import SQLiteConferenceRepository
from ..credibility.service import CredibilityService
from ..matching.service import MatchingService
from ..matching.models import PaperInput as MatchingPaperInput, MatchingResult

# Load environment variables
load_dotenv()

app = FastAPI(title="Researchly.io API", version="1.0.0")

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
db_path = os.getenv("DATABASE_PATH", "researchly.db")
repo = SQLiteConferenceRepository(db_path=db_path)
cred_service = CredibilityService(repository=repo)
matcher = MatchingService(repository=repo, credibility_service=cred_service)


# Pydantic models for API
class ConferenceResponse(BaseModel):
    id: str
    name: str
    edition_or_year: str
    title: Optional[str] = None
    submission_deadline: Optional[str] = None
    raw_submission_deadline_str: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    location: Optional[str] = None
    format: Optional[str] = None
    publisher: Optional[str] = None
    organizer: Optional[str] = None
    registration_fees: Optional[str] = None
    topics: List[str] = []
    official_website_url: Optional[str] = None
    submission_url: Optional[str] = None
    status: Optional[str] = None
    event_status: str = "Upcoming"
    submission_status: str = "Deadline unknown"
    event_type: str = "conference"
    paper_opportunity_status: str = "unverified"
    has_paper_submission: bool = True
    warnings: List[str] = []


class CredibilityResponse(BaseModel):
    conference_id: str
    risk_level: str
    credibility_status: str
    positive_indicators: List[str] = []
    warning_indicators: List[str] = []
    contradictions: List[str] = []
    missing_information: List[str] = []
    assessed: bool = False


class PaperMatchRequest(BaseModel):
    title: str
    abstract: str
    keywords: List[str] = []
    research_domain: Optional[str] = None
    preferred_location: Optional[str] = None


class ConferenceRecommendationResponse(BaseModel):
    conference_id: str
    conference_name: str
    edition_or_year: str
    title: Optional[str] = None
    relevance_score: float
    relevance_rank: int
    status: str
    submission_deadline: Optional[str] = None
    days_until_deadline: Optional[int] = None
    location: Optional[str] = None
    location_match: bool = False
    credibility: CredibilityResponse
    topic_overlap: dict
    match_explanation: str
    official_website_url: Optional[str] = None
    warnings: List[str] = []


class MatchingResultResponse(BaseModel):
    paper_title: str
    total_conferences_evaluated: int
    upcoming_open_deadline: List[ConferenceRecommendationResponse] = []
    upcoming_passed_deadline: List[ConferenceRecommendationResponse] = []
    upcoming_unknown_deadline: List[ConferenceRecommendationResponse] = []
    historical_completed: List[ConferenceRecommendationResponse] = []
    date_unknown: List[ConferenceRecommendationResponse] = []


@app.get("/")
async def root():
    return {"message": "Researchly.io API", "version": "1.0.0"}


@app.get("/api/conferences", response_model=List[ConferenceResponse])
async def list_conferences(
    event_type: Optional[str] = None,
    has_paper_submission: Optional[bool] = None,
    paper_opportunity_status: Optional[str] = None,
    status: Optional[str] = None,
    event_status: Optional[str] = None,
    submission_status: Optional[str] = None,
    include_historical: bool = False,
    topic: Optional[str] = None,
    country_or_city: Optional[str] = None,
    format_type: Optional[str] = None,
    min_deadline: Optional[str] = None,
    max_deadline: Optional[str] = None,
):
    """Get conferences with multi-dimensional filtering. Defaults to excluding historical events unless include_historical=True."""
    conferences = repo.list_all(
        event_type=event_type,
        has_paper_submission=has_paper_submission,
        paper_opportunity_status=paper_opportunity_status,
        status=status,
        event_status=event_status,
        submission_status=submission_status,
        include_historical=include_historical,
        topic=topic,
        country_or_city=country_or_city,
        format_type=format_type,
        min_deadline=min_deadline,
        max_deadline=max_deadline,
    )
    return [
        ConferenceResponse(
            id=c.id,
            name=c.name,
            edition_or_year=c.edition_or_year,
            title=c.title,
            submission_deadline=c.submission_deadline,
            raw_submission_deadline_str=c.raw_submission_deadline_str,
            start_date=c.start_date,
            end_date=c.end_date,
            location=c.location,
            format=c.format,
            publisher=c.publisher,
            organizer=c.organizer,
            registration_fees=c.registration_fees,
            topics=c.topics,
            official_website_url=c.official_website_url,
            submission_url=c.submission_url,
            status=c.status,
            event_status=c.event_status,
            submission_status=c.submission_status,
            event_type=c.event_type,
            paper_opportunity_status=c.paper_opportunity_status,
            has_paper_submission=c.has_paper_submission,
            warnings=c.warnings,
        )
        for c in conferences
    ]


@app.get("/api/conferences/{conference_id}", response_model=ConferenceResponse)
async def get_conference(conference_id: str):
    """Get a specific conference by ID."""
    conference = repo.get_by_id(conference_id)
    if not conference:
        raise HTTPException(status_code=404, detail="Conference not found")
    return ConferenceResponse(
        id=conference.id,
        name=conference.name,
        edition_or_year=conference.edition_or_year,
        title=conference.title,
        submission_deadline=conference.submission_deadline,
        raw_submission_deadline_str=conference.raw_submission_deadline_str,
        start_date=conference.start_date,
        end_date=conference.end_date,
        location=conference.location,
        format=conference.format,
        publisher=conference.publisher,
        organizer=conference.organizer,
        registration_fees=conference.registration_fees,
        topics=conference.topics,
        official_website_url=conference.official_website_url,
        submission_url=conference.submission_url,
        status=conference.status,
        event_status=conference.event_status,
        submission_status=conference.submission_status,
        event_type=conference.event_type,
        paper_opportunity_status=conference.paper_opportunity_status,
        has_paper_submission=conference.has_paper_submission,
        warnings=conference.warnings,
    )


@app.get("/api/credibility/{conference_id}", response_model=CredibilityResponse)
async def get_credibility(conference_id: str):
    """Get credibility assessment for a conference."""
    assessment = cred_service.get_latest_assessment(conference_id)
    if not assessment:
        return CredibilityResponse(
            conference_id=conference_id,
            risk_level="Not assessed",
            credibility_status="No credibility assessment available",
            assessed=False,
        )
    return CredibilityResponse(
        conference_id=conference_id,
        risk_level=assessment.risk_level.value,
        credibility_status=assessment.credibility_status,
        positive_indicators=assessment.positive_indicators,
        warning_indicators=assessment.warning_indicators,
        contradictions=assessment.contradictions,
        missing_information=assessment.missing_information,
        assessed=True,
    )


@app.post("/api/match", response_model=MatchingResultResponse)
async def match_paper(request: PaperMatchRequest):
    """Match a research paper against conferences."""
    paper = MatchingPaperInput(
        title=request.title,
        abstract=request.abstract,
        keywords=request.keywords,
        research_domain=request.research_domain,
        preferred_location=request.preferred_location,
    )
    result = matcher.match(paper, reference_date=date.today())
    
    def convert_credibility(cred):
        return CredibilityResponse(
            conference_id="",
            risk_level=cred.risk_level,
            credibility_status=cred.credibility_status,
            positive_indicators=cred.positive_indicators,
            warning_indicators=cred.warning_indicators,
            contradictions=cred.contradictions,
            missing_information=cred.missing_information,
            assessed=cred.assessed,
        )
    
    def convert_recommendation(rec):
        return ConferenceRecommendationResponse(
            conference_id=rec.conference_id,
            conference_name=rec.conference_name,
            edition_or_year=rec.edition_or_year,
            title=rec.title,
            relevance_score=rec.relevance_score,
            relevance_rank=rec.relevance_rank,
            status=rec.status,
            submission_deadline=rec.submission_deadline,
            days_until_deadline=rec.days_until_deadline,
            location=rec.location,
            location_match=rec.location_match,
            credibility=convert_credibility(rec.credibility),
            topic_overlap=rec.topic_overlap.model_dump(),
            match_explanation=rec.match_explanation,
            official_website_url=rec.official_website_url,
            warnings=rec.warnings,
        )
    
    return MatchingResultResponse(
        paper_title=result.paper_title,
        total_conferences_evaluated=result.total_conferences_evaluated,
        upcoming_open_deadline=[convert_recommendation(r) for r in result.upcoming_open_deadline],
        upcoming_passed_deadline=[convert_recommendation(r) for r in result.upcoming_passed_deadline],
        upcoming_unknown_deadline=[convert_recommendation(r) for r in result.upcoming_unknown_deadline],
        historical_completed=[convert_recommendation(r) for r in result.historical_completed],
        date_unknown=[convert_recommendation(r) for r in result.date_unknown],
    )


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "database": db_path}
