"""Public service interface for research paper → conference matching.

Orchestrates text preprocessing, TF-IDF similarity, eligibility filtering,
credibility integration, and result ranking into a single clean entry point.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import List, Optional, TYPE_CHECKING

from ..core.models import NormalizedConference, ConferenceStatus
from ..credibility.models import RiskLevel
from .models import (
    PaperInput,
    ConferenceRecommendation,
    CredibilitySummary,
    MatchingResult,
)
from .preprocessing import tokenize, build_document_text, build_paper_text
from .similarity import TfidfVectorizer, cosine_similarity
from .eligibility import classify_conference, compute_days_until_deadline, group_by_status
from .ranking import compute_location_match, compute_topic_overlap, build_match_explanation

if TYPE_CHECKING:
    from ..storage.repository import ConferenceRepository
    from ..credibility.service import CredibilityService

logger = logging.getLogger("researchly.matching")


class MatchingService:
    """Matches a research paper against the conference database.
    
    Usage:
        repo = SQLiteConferenceRepository("researchly.db")
        cred_service = CredibilityService(repository=repo)
        matcher = MatchingService(repository=repo, credibility_service=cred_service)
        
        paper = PaperInput(
            title="Attention Is All You Need",
            abstract="We propose a new simple network architecture...",
            keywords=["transformers", "attention", "NLP"],
        )
        result = matcher.match(paper)
    """

    def __init__(
        self,
        repository: "ConferenceRepository",
        credibility_service: Optional["CredibilityService"] = None,
        min_relevance_score: float = 0.01,
        max_results_per_group: int = 20,
    ):
        self.repository = repository
        self.credibility_service = credibility_service
        self.min_relevance_score = min_relevance_score
        self.max_results_per_group = max_results_per_group

    def match(
        self,
        paper: PaperInput,
        reference_date: Optional[date] = None,
    ) -> MatchingResult:
        """Match a research paper against all conferences in the database.
        
        Args:
            paper: Research paper details.
            reference_date: Date to evaluate deadlines against (defaults to today).
            
        Returns:
            MatchingResult with recommendations grouped by temporal eligibility.
        """
        ref_date = reference_date or date.today()
        conferences = self.repository.list_all()

        if not conferences:
            logger.warning("No conferences in database to match against.")
            return MatchingResult(
                paper_title=paper.title,
                total_conferences_evaluated=0,
            )

        logger.info("Matching paper '%s' against %d conference(s)...", paper.title, len(conferences))

        # 1. Build text documents for TF-IDF
        conf_docs_text = [
            build_document_text(
                name=c.name,
                title=c.title or "",
                topics=c.topics,
                location=c.location or "",
                publisher=c.publisher or "",
                organizer=c.organizer or "",
            )
            for c in conferences
        ]
        paper_text = build_paper_text(
            title=paper.title,
            abstract=paper.abstract,
            keywords=paper.keywords,
            research_domain=paper.research_domain or "",
        )

        # 2. Tokenize all documents
        conf_token_lists = [tokenize(doc) for doc in conf_docs_text]
        paper_tokens = tokenize(paper_text)

        # 3. Fit TF-IDF on the combined corpus (conferences + paper)
        all_docs = conf_token_lists + [paper_tokens]
        vectorizer = TfidfVectorizer()
        tfidf_matrix = vectorizer.fit_transform(all_docs)

        # The last row is the paper vector, the rest are conference vectors
        conf_matrix = tfidf_matrix[:-1]
        paper_vec = tfidf_matrix[-1]

        # 4. Compute cosine similarity
        scores = cosine_similarity(paper_vec, conf_matrix)

        # 5. Get top terms from the paper vector for explanation
        paper_top_terms = vectorizer.get_top_terms(paper_vec, top_n=15)
        paper_top_term_set = {t for t, w in paper_top_terms}

        # 6. Filter by minimum relevance score and pair with conferences
        scored_conferences = [
            (conf, float(score))
            for conf, score in zip(conferences, scores)
            if score >= self.min_relevance_score
        ]

        logger.info(
            "%d of %d conferences above minimum relevance threshold (%.3f)",
            len(scored_conferences), len(conferences), self.min_relevance_score,
        )

        # 7. Group by temporal status
        grouped = group_by_status(scored_conferences, ref_date)

        # 8. Build recommendations with credibility and explanations
        result = MatchingResult(
            paper_title=paper.title,
            total_conferences_evaluated=len(conferences),
        )

        for group_key, entries in grouped.items():
            recommendations = []
            for rank_idx, (conf, score, status, days_left) in enumerate(
                entries[: self.max_results_per_group], start=1
            ):
                # Topic overlap
                conf_top_terms = vectorizer.get_top_terms(
                    conf_matrix[conferences.index(conf)], top_n=15
                )
                common_terms = [
                    t for t, w in conf_top_terms if t in paper_top_term_set
                ]
                topic_overlap = compute_topic_overlap(
                    paper_keywords=paper.keywords,
                    conference_topics=conf.topics,
                    common_tfidf_terms=common_terms,
                )

                # Location match
                loc_match = compute_location_match(conf.location, paper.preferred_location)

                # Credibility
                cred_summary = self._get_credibility_summary(conf.id)

                # Explanation
                explanation = build_match_explanation(
                    conference_name=conf.name,
                    edition=conf.edition_or_year,
                    relevance_score=score,
                    topic_overlap=topic_overlap,
                    status=status,
                    days_until_deadline=days_left,
                    location=conf.location,
                    location_match=loc_match,
                    risk_level=cred_summary.risk_level if cred_summary.assessed else None,
                )

                rec = ConferenceRecommendation(
                    conference_id=conf.id,
                    conference_name=conf.name,
                    edition_or_year=conf.edition_or_year,
                    title=conf.title,
                    relevance_score=round(score, 4),
                    relevance_rank=rank_idx,
                    status=status.value,
                    submission_deadline=conf.submission_deadline,
                    days_until_deadline=days_left,
                    location=conf.location,
                    location_match=loc_match,
                    credibility=cred_summary,
                    topic_overlap=topic_overlap,
                    match_explanation=explanation,
                    official_website_url=conf.official_website_url,
                    warnings=conf.warnings,
                )
                recommendations.append(rec)

            setattr(result, group_key, recommendations)

        return result

    def _get_credibility_summary(self, conference_id: str) -> CredibilitySummary:
        """Retrieve credibility assessment for a conference, if available."""
        if not self.credibility_service:
            return CredibilitySummary(
                risk_level="Not assessed",
                credibility_status="Credibility service not configured.",
                assessed=False,
            )

        assessment = self.credibility_service.get_latest_assessment(conference_id)
        if not assessment:
            return CredibilitySummary(
                risk_level="Not assessed",
                credibility_status="No credibility assessment available for this conference.",
                assessed=False,
            )

        return CredibilitySummary(
            risk_level=assessment.risk_level.value,
            credibility_status=assessment.credibility_status,
            positive_indicators=assessment.positive_indicators,
            warning_indicators=assessment.warning_indicators,
            contradictions=assessment.contradictions,
            missing_information=assessment.missing_information,
            assessed=True,
        )

