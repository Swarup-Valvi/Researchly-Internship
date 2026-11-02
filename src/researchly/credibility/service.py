"""Public Service Interface for Credibility Intelligence."""

from __future__ import annotations

from typing import Optional, List, Dict, Any, TYPE_CHECKING
from .models import CredibilityAssessment, EvidenceItem
from .collector import EvidenceCollector
from .engine import CredibilityRulesEngine

if TYPE_CHECKING:
    from ..storage.repository import ConferenceRepository


class CredibilityService:
    """Service orchestrating evidence retrieval, rule evaluation, and assessment persistence."""

    def __init__(self, repository: ConferenceRepository, collector: Optional[EvidenceCollector] = None, engine: Optional[CredibilityRulesEngine] = None):
        self.repository = repository
        self.collector = collector or EvidenceCollector()
        self.engine = engine or CredibilityRulesEngine()

    def assess_conference(self, conference_id: str, custom_evidence: Optional[List[EvidenceItem]] = None) -> Optional[CredibilityAssessment]:
        """Runs credibility evaluation on a conference and persists the assessment."""
        conf = self.repository.get_by_id(conference_id)
        if not conf:
            return None

        # 1. Collect automated evidence
        collected = self.collector.collect_from_conference(conf)
        
        # 2. Add custom or independently verified evidence if provided
        all_evidence = collected + (custom_evidence or [])

        # 3. Persist evidence items idempotently
        self.repository.save_evidence(all_evidence)

        # 4. Fetch all stored evidence with primary IDs assigned
        stored_evidence = self.repository.get_evidence_for_conference(conference_id)

        # 5. Evaluate using transparent rule engine
        assessment = self.engine.evaluate(conf, stored_evidence)

        # 6. Save assessment to repository
        assessment_id = self.repository.save_assessment(assessment)
        assessment.id = assessment_id

        return assessment

    def get_latest_assessment(self, conference_id: str) -> Optional[CredibilityAssessment]:
        """Retrieves the most recent assessment for a conference."""
        return self.repository.get_latest_assessment(conference_id)

    def get_assessment_history(self, conference_id: str) -> List[CredibilityAssessment]:
        """Retrieves historical credibility evaluations over time."""
        return self.repository.get_assessment_history(conference_id)

    def get_evidence(self, conference_id: str) -> List[EvidenceItem]:
        """Retrieves raw and verified evidence records."""
        return self.repository.get_evidence_for_conference(conference_id)

    def get_formatted_report(self, conference_id: str) -> Optional[Dict[str, Any]]:
        """Returns structured JSON-serializable assessment dictionary for API/UI consumers."""
        assessment = self.get_latest_assessment(conference_id)
        if not assessment:
            return None
        return assessment.model_dump()
