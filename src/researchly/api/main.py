"""FastAPI backend for Researchly.io frontend integration."""

from __future__ import annotations

import base64
import json
import os
import sqlite3
from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from dateutil import parser as date_parser

from ..storage.repository import SQLiteConferenceRepository
from ..credibility.service import CredibilityService
from ..matching.service import MatchingService
from ..matching.models import PaperInput as MatchingPaperInput, MatchingResult

# Load environment variables
load_dotenv()

app = FastAPI(title="Researchly.io API", version="1.0.0")

# CORS middleware for frontend
_frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        _frontend_url,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
db_path = os.getenv("DATABASE_PATH", "researchly.db")
repo = SQLiteConferenceRepository(db_path=db_path)
cred_service = CredibilityService(repository=repo)
matcher = MatchingService(repository=repo, credibility_service=cred_service)


# ---------------------------------------------------------------------------
# Pydantic models for API
# ---------------------------------------------------------------------------

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


class VerificationFindingResponse(BaseModel):
    rule_id: str
    rule_name: str
    category: str
    status: str
    reason: str
    evidence_ids: List[int] = []
    evidence_excerpts: List[str] = []


class EvidenceItemResponse(BaseModel):
    id: Optional[int] = None
    conference_id: str
    category: str
    claim: str
    is_self_claimed: bool = False
    source_name: str
    source_url: str
    retrieved_at: str
    supporting_excerpt: Optional[str] = None
    verification_status: str
    notes: Optional[str] = None


class CredibilityResponse(BaseModel):
    conference_id: str
    risk_level: str
    credibility_status: str
    positive_indicators: List[str] = []
    warning_indicators: List[str] = []
    contradictions: List[str] = []
    missing_information: List[str] = []
    findings: List[VerificationFindingResponse] = []
    evidence: List[EvidenceItemResponse] = []
    assessed_at: Optional[str] = None
    version: Optional[str] = "2.0"
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


# ---------------------------------------------------------------------------
# Tracking Models
# ---------------------------------------------------------------------------

APPLICATION_STATUSES = [
    "Interested",
    "Shortlisted",
    "Preparing",
    "Submitted",
    "Under Review",
    "Accepted",
    "Rejected",
    "Withdrawn",
]


class ApplicationRecord(BaseModel):
    conference_id: str
    user_id: str = "default_user"
    status: str = "Interested"
    notes: Optional[str] = None
    added_at: Optional[str] = None
    updated_at: Optional[str] = None
    submitted_at: Optional[str] = None
    decision_at: Optional[str] = None
    days_until_deadline: Optional[int] = None
    deadline_urgency: Optional[str] = None
    conference_name: Optional[str] = None
    conference_title: Optional[str] = None
    submission_deadline: Optional[str] = None
    start_date: Optional[str] = None
    location: Optional[str] = None
    event_status: Optional[str] = None
    official_website_url: Optional[str] = None
    submission_url: Optional[str] = None


class CreateApplicationRequest(BaseModel):
    conference_id: str
    status: str = "Interested"
    notes: Optional[str] = None
    submitted_at: Optional[str] = None
    decision_at: Optional[str] = None


class UpdateApplicationRequest(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    submitted_at: Optional[str] = None
    decision_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _compute_days_left(deadline_str: Optional[str]) -> Optional[int]:
    if not deadline_str:
        return None
    try:
        dl_date = date_parser.parse(deadline_str).date()
        return (dl_date - date.today()).days
    except Exception:
        return None


def _conf_to_response(c) -> ConferenceResponse:
    return ConferenceResponse(
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


def _row_to_application(row: dict | sqlite3.Row) -> ApplicationRecord:
    data = dict(row)
    conf = repo.get_by_id(data["conference_id"])
    days_left = _compute_days_left(conf.submission_deadline) if conf else None

    urgency = "unknown"
    if days_left is not None:
        if days_left < 0:
            urgency = "passed"
        elif days_left <= 7:
            urgency = "urgent"
        elif days_left <= 30:
            urgency = "approaching"
        else:
            urgency = "open"

    return ApplicationRecord(
        conference_id=data["conference_id"],
        user_id=data.get("user_id", "default_user"),
        status=data["status"],
        notes=data.get("notes"),
        added_at=data.get("added_at"),
        updated_at=data.get("updated_at"),
        submitted_at=data.get("submitted_at"),
        decision_at=data.get("decision_at"),
        days_until_deadline=days_left,
        deadline_urgency=urgency,
        conference_name=conf.name if conf else None,
        conference_title=conf.title if conf else None,
        submission_deadline=conf.submission_deadline if conf else None,
        start_date=conf.start_date if conf else None,
        location=conf.location if conf else None,
        event_status=conf.event_status if conf else None,
        official_website_url=conf.official_website_url if conf else None,
        submission_url=conf.submission_url if conf else None,
    )


# ---------------------------------------------------------------------------
# Conference Routes
# ---------------------------------------------------------------------------

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
    return [_conf_to_response(c) for c in conferences]


@app.get("/api/conferences/{conference_id}", response_model=ConferenceResponse)
async def get_conference(conference_id: str):
    """Get a specific conference by ID."""
    conference = repo.get_by_id(conference_id)
    if not conference:
        raise HTTPException(status_code=404, detail="Conference not found")
    return _conf_to_response(conference)


# ---------------------------------------------------------------------------
# Credibility Routes
# ---------------------------------------------------------------------------

@app.get("/api/credibility/{conference_id}", response_model=CredibilityResponse)
async def get_credibility(conference_id: str):
    """Get credibility assessment for a conference including findings and evidence."""
    assessment = cred_service.get_latest_assessment(conference_id)
    evidence_items = repo.get_evidence_for_conference(conference_id)
    
    if not assessment:
        return CredibilityResponse(
            conference_id=conference_id,
            risk_level="Not assessed",
            credibility_status="No credibility assessment available for this conference yet.",
            assessed=False,
            evidence=[
                EvidenceItemResponse(
                    id=e.id,
                    conference_id=e.conference_id,
                    category=e.category.value if hasattr(e.category, "value") else str(e.category),
                    claim=e.claim,
                    is_self_claimed=e.is_self_claimed,
                    source_name=e.source_name,
                    source_url=e.source_url,
                    retrieved_at=e.retrieved_at,
                    supporting_excerpt=e.supporting_excerpt,
                    verification_status=e.verification_status.value if hasattr(e.verification_status, "value") else str(e.verification_status),
                    notes=e.notes,
                )
                for e in evidence_items
            ],
        )

    return CredibilityResponse(
        conference_id=conference_id,
        risk_level=assessment.risk_level.value if hasattr(assessment.risk_level, "value") else str(assessment.risk_level),
        credibility_status=assessment.credibility_status,
        positive_indicators=assessment.positive_indicators,
        warning_indicators=assessment.warning_indicators,
        contradictions=assessment.contradictions,
        missing_information=assessment.missing_information,
        findings=[
            VerificationFindingResponse(
                rule_id=f.rule_id,
                rule_name=f.rule_name,
                category=f.category.value if hasattr(f.category, "value") else str(f.category),
                status=f.status.value if hasattr(f.status, "value") else str(f.status),
                reason=f.reason,
                evidence_ids=f.evidence_ids,
                evidence_excerpts=f.evidence_excerpts,
            )
            for f in assessment.findings
        ],
        evidence=[
            EvidenceItemResponse(
                id=e.id,
                conference_id=e.conference_id,
                category=e.category.value if hasattr(e.category, "value") else str(e.category),
                claim=e.claim,
                is_self_claimed=e.is_self_claimed,
                source_name=e.source_name,
                source_url=e.source_url,
                retrieved_at=e.retrieved_at,
                supporting_excerpt=e.supporting_excerpt,
                verification_status=e.verification_status.value if hasattr(e.verification_status, "value") else str(e.verification_status),
                notes=e.notes,
            )
            for e in evidence_items
        ],
        assessed_at=assessment.assessed_at,
        version=assessment.version,
        assessed=True,
    )


@app.post("/api/credibility/{conference_id}/assess", response_model=CredibilityResponse)
async def run_assessment(conference_id: str):
    """Trigger an on-demand credibility evaluation for a conference."""
    assessment = cred_service.assess_conference(conference_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Conference not found")
    return await get_credibility(conference_id)


# ---------------------------------------------------------------------------
# Matching Routes
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Tracking Routes
# ---------------------------------------------------------------------------

def get_current_user_id(
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> str:
    """Resolve user ID from Bearer JWT token (Supabase auth.uid() claim) or X-User-Id header."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ", 1)[1].strip()
        # Mock token handling for local test mode
        if token.startswith("mock_jwt_"):
            return token.replace("mock_jwt_", "")
        # Standard Supabase JWT token extraction
        parts = token.split(".")
        if len(parts) == 3:
            try:
                payload_b64 = parts[1]
                payload_b64 += "=" * (-len(payload_b64) % 4)
                payload_json = base64.urlsafe_b64decode(payload_b64.encode()).decode()
                claims = json.loads(payload_json)
                if "sub" in claims and claims["sub"]:
                    return str(claims["sub"])
            except Exception:
                pass
    if x_user_id and x_user_id.strip():
        return x_user_id.strip()
    return "default_user"


@app.get("/api/tracking", response_model=List[ApplicationRecord])
async def list_applications(
    status: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
):
    """List all tracked conference applications for the current user."""
    rows = repo.list_applications(user_id=user_id, status=status)
    return [_row_to_application(r) for r in rows]


@app.post("/api/tracking", response_model=ApplicationRecord, status_code=201)
async def create_application(
    request: CreateApplicationRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Track a conference (shortlist / start application) for the current user."""
    if request.status not in APPLICATION_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status '{request.status}'. Must be one of: {APPLICATION_STATUSES}",
        )
    if not repo.get_by_id(request.conference_id):
        raise HTTPException(status_code=404, detail="Conference not found")

    try:
        app_data = repo.create_application(
            user_id=user_id,
            conference_id=request.conference_id,
            status=request.status,
            notes=request.notes,
            submitted_at=request.submitted_at,
            decision_at=request.decision_at,
        )
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail=f"Conference '{request.conference_id}' is already tracked.",
        )

    return _row_to_application(app_data)


@app.get("/api/tracking/{conference_id}", response_model=ApplicationRecord)
async def get_application(
    conference_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Get tracking record for a specific conference for the current user."""
    row = repo.get_application(user_id=user_id, conference_id=conference_id)
    if not row:
        raise HTTPException(status_code=404, detail="Application not tracked")
    return _row_to_application(row)


@app.patch("/api/tracking/{conference_id}", response_model=ApplicationRecord)
async def update_application(
    conference_id: str,
    request: UpdateApplicationRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Update status, notes, or dates for a tracked conference."""
    if request.status is not None and request.status not in APPLICATION_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status '{request.status}'. Must be one of: {APPLICATION_STATUSES}",
        )

    updated = repo.update_application(
        user_id=user_id,
        conference_id=conference_id,
        status=request.status,
        notes=request.notes,
        submitted_at=request.submitted_at,
        decision_at=request.decision_at,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Application not tracked")
    return _row_to_application(updated)


@app.delete("/api/tracking/{conference_id}", status_code=204)
async def delete_application(
    conference_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Remove a conference from tracking for the current user."""
    success = repo.delete_application(user_id=user_id, conference_id=conference_id)
    if not success:
        raise HTTPException(status_code=404, detail="Application not tracked")


@app.get("/api/tracking-statuses")
async def get_tracking_statuses():
    """Return valid application statuses."""
    return {"statuses": APPLICATION_STATUSES}


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------

@app.get("/")
async def root():
    """Root platform descriptor."""
    return {
        "platform": "Researchly.io API",
        "version": "1.0.0",
        "status": "operational",
        "docs_url": "/docs",
        "openapi_url": "/openapi.json",
        "health_url": "/api/health",
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    with repo._get_connection() as conn:
        conf_count = conn.execute("SELECT COUNT(*) FROM conferences").fetchone()[0]
        app_count = conn.execute("SELECT COUNT(*) FROM user_applications").fetchone()[0]
        cred_count = conn.execute("SELECT COUNT(*) FROM credibility_assessments").fetchone()[0]
    return {
        "status": "healthy",
        "database": db_path,
        "conferences": conf_count,
        "assessments": cred_count,
        "tracked_applications": app_count,
    }
