"""Transparent rule-based credibility evaluation engine."""

from __future__ import annotations

from typing import List, Tuple
from datetime import datetime

from .models import (
    EvidenceItem,
    EvidenceCategory,
    VerificationStatus,
    VerificationFinding,
    CredibilityAssessment,
    RiskLevel
)
from ..core.models import NormalizedConference


class CredibilityRulesEngine:
    """Evaluates collected evidence against explicit credibility verification rules."""

    def evaluate(self, conf: NormalizedConference, evidence_list: List[EvidenceItem]) -> CredibilityAssessment:
        now_iso = datetime.utcnow().isoformat() + "Z"
        findings: List[VerificationFinding] = []

        # Map evidence items by category for easy lookup
        cat_evidence: dict[EvidenceCategory, List[EvidenceItem]] = {}
        for ev in evidence_list:
            cat_evidence.setdefault(ev.category, []).append(ev)

        # -------------------------------------------------------------
        # Rule 1: Official Domain & Website Verification
        # -------------------------------------------------------------
        web_evs = cat_evidence.get(EvidenceCategory.DOMAIN_AND_WEBSITE, [])
        verified_web = [e for e in web_evs if e.verification_status == VerificationStatus.VERIFIED]
        contradicted_web = [e for e in web_evs if e.verification_status == VerificationStatus.CONTRADICTED]
        
        if contradicted_web:
            findings.append(VerificationFinding(
                rule_id="RULE-DOM-01",
                rule_name="Official Domain & Web Presence",
                category=EvidenceCategory.DOMAIN_AND_WEBSITE,
                status=VerificationStatus.CONTRADICTED,
                reason="Official website domain is flagged as fraudulent, deceptive, or hijacked.",
                evidence_ids=[e.id for e in contradicted_web if e.id],
                evidence_excerpts=[e.supporting_excerpt or e.claim for e in contradicted_web]
            ))
        elif verified_web:
            findings.append(VerificationFinding(
                rule_id="RULE-DOM-01",
                rule_name="Official Domain & Web Presence",
                category=EvidenceCategory.DOMAIN_AND_WEBSITE,
                status=VerificationStatus.VERIFIED,
                reason="Conference operates an established official domain and accessible web presence.",
                evidence_ids=[e.id for e in verified_web if e.id],
                evidence_excerpts=[e.supporting_excerpt or e.claim for e in verified_web]
            ))
        else:
            findings.append(VerificationFinding(
                rule_id="RULE-DOM-01",
                rule_name="Official Domain & Web Presence",
                category=EvidenceCategory.DOMAIN_AND_WEBSITE,
                status=VerificationStatus.MISSING,
                reason="No official conference website or domain could be identified.",
                evidence_ids=[],
                evidence_excerpts=[]
            ))

        # -------------------------------------------------------------
        # Rule 2: Organizer Identity & Background
        # -------------------------------------------------------------
        org_evs = cat_evidence.get(EvidenceCategory.ORGANIZER_IDENTITY, [])
        verified_org = [e for e in org_evs if e.verification_status == VerificationStatus.VERIFIED]
        contra_org = [e for e in org_evs if e.verification_status == VerificationStatus.CONTRADICTED]
        
        if contra_org:
            findings.append(VerificationFinding(
                rule_id="RULE-ORG-01",
                rule_name="Organizer Identity Confirmation",
                category=EvidenceCategory.ORGANIZER_IDENTITY,
                status=VerificationStatus.CONTRADICTED,
                reason="Organizer identity claims contradicted by independent organization records or repudiated.",
                evidence_ids=[e.id for e in contra_org if e.id],
                evidence_excerpts=[e.supporting_excerpt or e.claim for e in contra_org]
            ))
        elif verified_org:
            findings.append(VerificationFinding(
                rule_id="RULE-ORG-01",
                rule_name="Organizer Identity Confirmation",
                category=EvidenceCategory.ORGANIZER_IDENTITY,
                status=VerificationStatus.VERIFIED,
                reason="Organizing entity is an established scientific society or recognized foundation.",
                evidence_ids=[e.id for e in verified_org if e.id],
                evidence_excerpts=[e.supporting_excerpt or e.claim for e in verified_org]
            ))
        else:
            findings.append(VerificationFinding(
                rule_id="RULE-ORG-01",
                rule_name="Organizer Identity Confirmation",
                category=EvidenceCategory.ORGANIZER_IDENTITY,
                status=VerificationStatus.MISSING,
                reason="Organizing entity is not disclosed or lacks independent record.",
                evidence_ids=[],
                evidence_excerpts=[]
            ))

        # -------------------------------------------------------------
        # Rule 3: Publisher & Publication Arrangements
        # -------------------------------------------------------------
        pub_evs = cat_evidence.get(EvidenceCategory.PUBLISHER_AND_PROCEEDINGS, [])
        verified_pub = [e for e in pub_evs if e.verification_status == VerificationStatus.VERIFIED]
        contra_pub = [e for e in pub_evs if e.verification_status == VerificationStatus.CONTRADICTED]

        if contra_pub:
            findings.append(VerificationFinding(
                rule_id="RULE-PUB-01",
                rule_name="Publisher Agreement Verification",
                category=EvidenceCategory.PUBLISHER_AND_PROCEEDINGS,
                status=VerificationStatus.CONTRADICTED,
                reason="Publisher claims directly contradicted by official publisher catalog or disowned.",
                evidence_ids=[e.id for e in contra_pub if e.id],
                evidence_excerpts=[e.supporting_excerpt or e.claim for e in contra_pub]
            ))
        elif verified_pub:
            findings.append(VerificationFinding(
                rule_id="RULE-PUB-01",
                rule_name="Publisher Agreement Verification",
                category=EvidenceCategory.PUBLISHER_AND_PROCEEDINGS,
                status=VerificationStatus.VERIFIED,
                reason="Proceedings published by recognized academic publisher or verified repository.",
                evidence_ids=[e.id for e in verified_pub if e.id],
                evidence_excerpts=[e.supporting_excerpt or e.claim for e in verified_pub]
            ))
        else:
            findings.append(VerificationFinding(
                rule_id="RULE-PUB-01",
                rule_name="Publisher Agreement Verification",
                category=EvidenceCategory.PUBLISHER_AND_PROCEEDINGS,
                status=VerificationStatus.MISSING,
                reason="No formal publisher or proceedings arrangement verified.",
                evidence_ids=[],
                evidence_excerpts=[]
            ))

        # -------------------------------------------------------------
        # Rule 4: Indexing Claims (Scopus, IEEE Xplore, ACM DL, WoS)
        # -------------------------------------------------------------
        idx_evs = cat_evidence.get(EvidenceCategory.INDEXING_CLAIMS, [])
        verified_idx = [e for e in idx_evs if e.verification_status == VerificationStatus.VERIFIED]
        contra_idx = [e for e in idx_evs if e.verification_status == VerificationStatus.CONTRADICTED]
        unverified_idx = [e for e in idx_evs if e.verification_status == VerificationStatus.UNVERIFIED]

        if contra_idx:
            findings.append(VerificationFinding(
                rule_id="RULE-IDX-01",
                rule_name="Indexing Claims Verification",
                category=EvidenceCategory.INDEXING_CLAIMS,
                status=VerificationStatus.CONTRADICTED,
                reason="Conference claims indexing in major databases that official indexes confirm do not exist.",
                evidence_ids=[e.id for e in contra_idx if e.id],
                evidence_excerpts=[e.supporting_excerpt or e.claim for e in contra_idx]
            ))
        elif verified_idx:
            findings.append(VerificationFinding(
                rule_id="RULE-IDX-01",
                rule_name="Indexing Claims Verification",
                category=EvidenceCategory.INDEXING_CLAIMS,
                status=VerificationStatus.VERIFIED,
                reason="Indexing claims confirmed by independent database records.",
                evidence_ids=[e.id for e in verified_idx if e.id],
                evidence_excerpts=[e.supporting_excerpt or e.claim for e in verified_idx]
            ))
        elif unverified_idx:
            findings.append(VerificationFinding(
                rule_id="RULE-IDX-01",
                rule_name="Indexing Claims Verification",
                category=EvidenceCategory.INDEXING_CLAIMS,
                status=VerificationStatus.UNVERIFIED,
                reason="Conference claims third-party database indexing without independent verification evidence.",
                evidence_ids=[e.id for e in unverified_idx if e.id],
                evidence_excerpts=[e.supporting_excerpt or e.claim for e in unverified_idx]
            ))
        else:
            findings.append(VerificationFinding(
                rule_id="RULE-IDX-01",
                rule_name="Indexing Claims Verification",
                category=EvidenceCategory.INDEXING_CLAIMS,
                status=VerificationStatus.MISSING,
                reason="No indexing claims evaluated or made.",
                evidence_ids=[],
                evidence_excerpts=[]
            ))

        # -------------------------------------------------------------
        # Rule 5: Program Committee & Affiliations
        # -------------------------------------------------------------
        tpc_evs = cat_evidence.get(EvidenceCategory.PROGRAM_COMMITTEE, [])
        verified_tpc = [e for e in tpc_evs if e.verification_status == VerificationStatus.VERIFIED]
        contra_tpc = [e for e in tpc_evs if e.verification_status == VerificationStatus.CONTRADICTED]
        unverified_tpc = [e for e in tpc_evs if e.verification_status == VerificationStatus.UNVERIFIED]

        if contra_tpc:
            findings.append(VerificationFinding(
                rule_id="RULE-TPC-01",
                rule_name="Program Committee & Peer Review Authenticity",
                category=EvidenceCategory.PROGRAM_COMMITTEE,
                status=VerificationStatus.CONTRADICTED,
                reason="Listed committee members repudiated affiliation or fabricated identities detected.",
                evidence_ids=[e.id for e in contra_tpc if e.id],
                evidence_excerpts=[e.supporting_excerpt or e.claim for e in contra_tpc]
            ))
        elif verified_tpc:
            findings.append(VerificationFinding(
                rule_id="RULE-TPC-01",
                rule_name="Program Committee & Peer Review Authenticity",
                category=EvidenceCategory.PROGRAM_COMMITTEE,
                status=VerificationStatus.VERIFIED,
                reason="Technical committee comprises verifiable researchers with recognized institutional affiliations.",
                evidence_ids=[e.id for e in verified_tpc if e.id],
                evidence_excerpts=[e.supporting_excerpt or e.claim for e in verified_tpc]
            ))
        elif unverified_tpc:
            findings.append(VerificationFinding(
                rule_id="RULE-TPC-01",
                rule_name="Program Committee & Peer Review Authenticity",
                category=EvidenceCategory.PROGRAM_COMMITTEE,
                status=VerificationStatus.UNVERIFIED,
                reason="Committee list is published but individual member roles have not been independently confirmed.",
                evidence_ids=[e.id for e in unverified_tpc if e.id],
                evidence_excerpts=[e.supporting_excerpt or e.claim for e in unverified_tpc]
            ))
        else:
            findings.append(VerificationFinding(
                rule_id="RULE-TPC-01",
                rule_name="Program Committee & Peer Review Authenticity",
                category=EvidenceCategory.PROGRAM_COMMITTEE,
                status=VerificationStatus.MISSING,
                reason="Program committee or review board details not published or available.",
                evidence_ids=[],
                evidence_excerpts=[]
            ))

        # -------------------------------------------------------------
        # Rule 6: Previous Editions & Multi-Year Record
        # -------------------------------------------------------------
        hist_evs = cat_evidence.get(EvidenceCategory.PREVIOUS_EDITIONS, [])
        verified_hist = [e for e in hist_evs if e.verification_status == VerificationStatus.VERIFIED]
        
        if verified_hist:
            findings.append(VerificationFinding(
                rule_id="RULE-HIST-01",
                rule_name="Historical Editions Record",
                category=EvidenceCategory.PREVIOUS_EDITIONS,
                status=VerificationStatus.VERIFIED,
                reason="Conference has documented prior editions and continuous academic history.",
                evidence_ids=[e.id for e in verified_hist if e.id],
                evidence_excerpts=[e.supporting_excerpt or e.claim for e in verified_hist]
            ))
        else:
            findings.append(VerificationFinding(
                rule_id="RULE-HIST-01",
                rule_name="Historical Editions Record",
                category=EvidenceCategory.PREVIOUS_EDITIONS,
                status=VerificationStatus.MISSING,
                reason="Historical conference editions or archives not verified (may be inaugural or unindexed).",
                evidence_ids=[],
                evidence_excerpts=[]
            ))

        # -------------------------------------------------------------
        # Rule 7: Dates & Venue Consistency
        # -------------------------------------------------------------
        venue_evs = cat_evidence.get(EvidenceCategory.VENUE_AND_DATES, [])
        verified_venue = [e for e in venue_evs if e.verification_status == VerificationStatus.VERIFIED]
        contra_venue = [e for e in venue_evs if e.verification_status == VerificationStatus.CONTRADICTED]

        if contra_venue:
            findings.append(VerificationFinding(
                rule_id="RULE-LOC-01",
                rule_name="Dates and Venue Consistency",
                category=EvidenceCategory.VENUE_AND_DATES,
                status=VerificationStatus.CONTRADICTED,
                reason="Disclosed venue disconfirmed booking or dates conflict across official sources.",
                evidence_ids=[e.id for e in contra_venue if e.id],
                evidence_excerpts=[e.supporting_excerpt or e.claim for e in contra_venue]
            ))
        elif verified_venue:
            findings.append(VerificationFinding(
                rule_id="RULE-LOC-01",
                rule_name="Dates and Venue Consistency",
                category=EvidenceCategory.VENUE_AND_DATES,
                status=VerificationStatus.VERIFIED,
                reason="Specific dates and physical/virtual venue clearly disclosed and consistent.",
                evidence_ids=[e.id for e in verified_venue if e.id],
                evidence_excerpts=[e.supporting_excerpt or e.claim for e in verified_venue]
            ))
        else:
            findings.append(VerificationFinding(
                rule_id="RULE-LOC-01",
                rule_name="Dates and Venue Consistency",
                category=EvidenceCategory.VENUE_AND_DATES,
                status=VerificationStatus.MISSING,
                reason="Specific dates or physical venue location unannounced or vague.",
                evidence_ids=[],
                evidence_excerpts=[]
            ))

        # -------------------------------------------------------------
        # Rule 8: Fees and Transparency
        # -------------------------------------------------------------
        fees_evs = cat_evidence.get(EvidenceCategory.FEES_AND_POLICIES, [])
        verified_fees = [e for e in fees_evs if e.verification_status == VerificationStatus.VERIFIED]
        
        if verified_fees:
            findings.append(VerificationFinding(
                rule_id="RULE-FEE-01",
                rule_name="Fee Transparency & Registration Policies",
                category=EvidenceCategory.FEES_AND_POLICIES,
                status=VerificationStatus.VERIFIED,
                reason="Registration fees or tiered author pricing clearly disclosed.",
                evidence_ids=[e.id for e in verified_fees if e.id],
                evidence_excerpts=[e.supporting_excerpt or e.claim for e in verified_fees]
            ))
        else:
            findings.append(VerificationFinding(
                rule_id="RULE-FEE-01",
                rule_name="Fee Transparency & Registration Policies",
                category=EvidenceCategory.FEES_AND_POLICIES,
                status=VerificationStatus.MISSING,
                reason="Registration fee schedules or refund policies are not publicly specified.",
                evidence_ids=[],
                evidence_excerpts=[]
            ))

        # -------------------------------------------------------------
        # Synthesis: Determine Risk Level & Explanations
        # -------------------------------------------------------------
        positive_indicators: List[str] = []
        warning_indicators: List[str] = []
        contradictions: List[str] = []
        missing_information: List[str] = []

        for f in findings:
            if f.status == VerificationStatus.VERIFIED:
                positive_indicators.append(f"{f.rule_name}: {f.reason}")
            elif f.status == VerificationStatus.CONTRADICTED:
                contradictions.append(f"{f.rule_name}: {f.reason}")
            elif f.status == VerificationStatus.UNVERIFIED:
                warning_indicators.append(f"{f.rule_name}: {f.reason}")
            elif f.status == VerificationStatus.MISSING:
                missing_information.append(f"{f.rule_name}: {f.reason}")

        # Assess Risk Level strictly following explainable logic
        # 1. High Risk: Significant, evidence-backed contradictions or serious warnings
        if len(contradictions) > 0:
            risk_level = RiskLevel.HIGH
            credibility_status = f"High Risk: Detected {len(contradictions)} verified contradiction(s) with official scientific records."
        # 2. Insufficient Evidence: Very few verified indicators (e.g. fewer than 2 positive) and many missing
        elif len(positive_indicators) < 2 and len(missing_information) >= 4:
            risk_level = RiskLevel.INSUFFICIENT_EVIDENCE
            credibility_status = "Insufficient Evidence: Available public evidence is currently inadequate to establish credibility."
        # 3. Medium Risk: Mixed evidence or unverified third-party claims
        elif len(warning_indicators) > 0 or len(positive_indicators) < 4:
            risk_level = RiskLevel.MEDIUM
            credibility_status = f"Medium Risk: Mixed evidence with {len(warning_indicators)} unverified claim(s) or incomplete documentation."
        # 4. Low Risk: Sufficient supporting evidence with no contradictions
        else:
            risk_level = RiskLevel.LOW
            credibility_status = "Low Risk: Strong supporting evidence across organizers, publishers, and venue with zero contradictions."

        return CredibilityAssessment(
            conference_id=conf.id,
            risk_level=risk_level,
            credibility_status=credibility_status,
            positive_indicators=positive_indicators,
            warning_indicators=warning_indicators,
            contradictions=contradictions,
            missing_information=missing_information,
            findings=findings,
            assessed_at=now_iso,
            version="2.0"
        )

