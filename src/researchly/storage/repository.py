"""Persistence abstractions and SQLite repository implementation."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from abc import ABC, abstractmethod
from typing import Optional, List, Tuple
from dataclasses import dataclass

from ..core.models import NormalizedConference, DeadlineHistory
from ..credibility.models import (
    EvidenceItem,
    EvidenceCategory,
    VerificationStatus,
    CredibilityAssessment,
    VerificationFinding,
    RiskLevel
)


@dataclass
class IngestionStats:
    discovered: int = 0
    inserted: int = 0
    updated: int = 0
    duplicates_skipped: int = 0
    deadline_changes: int = 0
    warnings_logged: int = 0


class ConferenceRepository(ABC):
    """Abstract interface for conference data storage."""

    @abstractmethod
    def get_by_id(self, conference_id: str) -> Optional[NormalizedConference]:
        pass

    @abstractmethod
    def upsert_conference(self, conference: NormalizedConference) -> Tuple[str, Optional[DeadlineHistory]]:
        """Saves or updates a conference record.
        
        Returns:
            (action, deadline_change_event_if_any)
            action in: 'inserted', 'updated', 'unchanged'
        """
        pass

    @abstractmethod
    def list_all(
        self,
        event_type: Optional[str] = None,
        has_paper_submission: Optional[bool] = None,
        paper_opportunity_status: Optional[str] = None,
        status: Optional[str] = None,
        event_status: Optional[str] = None,
        submission_status: Optional[str] = None,
        include_historical: bool = True,
        topic: Optional[str] = None,
        country_or_city: Optional[str] = None,
        format_type: Optional[str] = None,
        min_deadline: Optional[str] = None,
        max_deadline: Optional[str] = None,
    ) -> List[NormalizedConference]:
        pass

    @abstractmethod
    def get_deadline_history(self, conference_id: Optional[str] = None) -> List[DeadlineHistory]:
        pass

    # Credibility & Evidence methods
    @abstractmethod
    def save_evidence(self, items: List[EvidenceItem]) -> int:
        """Saves evidence items idempotently, returning count of new items saved."""
        pass

    @abstractmethod
    def get_evidence_for_conference(self, conference_id: str) -> List[EvidenceItem]:
        """Retrieves all evidence collected for a conference."""
        pass

    @abstractmethod
    def save_assessment(self, assessment: CredibilityAssessment) -> int:
        """Persists a credibility assessment and its findings, returning assessment ID."""
        pass

    @abstractmethod
    def get_latest_assessment(self, conference_id: str) -> Optional[CredibilityAssessment]:
        """Returns the most recent credibility assessment for a conference."""
        pass

    @abstractmethod
    def get_assessment_history(self, conference_id: str) -> List[CredibilityAssessment]:
        """Returns all historical assessments for a conference."""
        pass

    # User Application Tracking methods
    @abstractmethod
    def create_application(
        self,
        user_id: str,
        conference_id: str,
        status: str = "Interested",
        notes: Optional[str] = None,
        submitted_at: Optional[str] = None,
        decision_at: Optional[str] = None,
    ) -> dict:
        """Create a new conference tracking record for the user."""
        pass

    @abstractmethod
    def get_application(self, user_id: str, conference_id: str) -> Optional[dict]:
        """Retrieve tracking record for a specific conference and user."""
        pass

    @abstractmethod
    def list_applications(self, user_id: str, status: Optional[str] = None) -> List[dict]:
        """List all tracked applications for a user, optionally filtered by status."""
        pass

    @abstractmethod
    def update_application(
        self,
        user_id: str,
        conference_id: str,
        status: Optional[str] = None,
        notes: Optional[str] = None,
        submitted_at: Optional[str] = None,
        decision_at: Optional[str] = None,
    ) -> Optional[dict]:
        """Update status, dates, or notes for a user's tracked conference."""
        pass

    @abstractmethod
    def delete_application(self, user_id: str, conference_id: str) -> bool:
        """Remove a tracked conference for a user."""
        pass


class SQLiteConferenceRepository(ConferenceRepository):
    """SQLite implementation of ConferenceRepository with full audit tracking."""

    def __init__(self, db_path: str = "researchly.db"):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS conferences (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    edition_or_year TEXT NOT NULL,
                    title TEXT,
                    topics TEXT,
                    submission_deadline TEXT,
                    raw_submission_deadline_str TEXT,
                    start_date TEXT,
                    end_date TEXT,
                    location TEXT,
                    format TEXT,
                    publisher TEXT,
                    organizer TEXT,
                    registration_fees TEXT,
                    official_website_url TEXT,
                    source_name TEXT NOT NULL,
                    source_url TEXT NOT NULL,
                    first_discovered_at TEXT NOT NULL,
                    last_checked_at TEXT NOT NULL,
                    warnings TEXT,
                    status TEXT,
                    event_status TEXT,
                    submission_status TEXT,
                    event_type TEXT,
                    paper_opportunity_status TEXT,
                    has_paper_submission INTEGER DEFAULT 1,
                    submission_url TEXT
                );
            """)

            # Run migrations for existing DBs
            cursor.execute("PRAGMA table_info(conferences);")
            columns = [c[1] for c in cursor.fetchall()]
            for col, col_type in [
                ("status", "TEXT"),
                ("event_status", "TEXT"),
                ("submission_status", "TEXT"),
                ("event_type", "TEXT"),
                ("paper_opportunity_status", "TEXT"),
                ("has_paper_submission", "INTEGER DEFAULT 1"),
                ("submission_url", "TEXT"),
            ]:
                if col not in columns:
                    cursor.execute(f"ALTER TABLE conferences ADD COLUMN {col} {col_type};")

            # Backfill migration: ensure legacy rows missing event_status/submission_status are populated from status & dates
            cursor.execute("""
                UPDATE conferences
                SET event_status = CASE
                    WHEN status LIKE '%Completed%' THEN 'Completed'
                    WHEN status LIKE '%In progress%' THEN 'In progress'
                    WHEN status LIKE '%Postponed%' THEN 'Postponed'
                    WHEN status LIKE '%Cancelled%' THEN 'Cancelled'
                    WHEN status LIKE '%Upcoming%' THEN 'Upcoming'
                    WHEN status LIKE '%Date unknown%' THEN 'Date unknown'
                    ELSE COALESCE(event_status, 'Upcoming')
                END
                WHERE event_status IS NULL OR event_status = '';
            """)
            cursor.execute("""
                UPDATE conferences
                SET submission_status = CASE
                    WHEN status LIKE '%deadline open%' THEN 'Open'
                    WHEN status LIKE '%deadline passed%' THEN 'Deadline passed'
                    WHEN status LIKE '%deadline unknown%' THEN 'Deadline unknown'
                    WHEN submission_deadline IS NOT NULL AND submission_deadline != '' THEN 'Deadline passed'
                    ELSE COALESCE(submission_status, 'Deadline unknown')
                END
                WHERE submission_status IS NULL OR submission_status = '' OR submission_status = 'Deadline unknown';
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS deadline_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conference_id TEXT NOT NULL,
                    previous_deadline TEXT,
                    new_deadline TEXT,
                    detected_at TEXT NOT NULL,
                    source_name TEXT NOT NULL,
                    source_url TEXT NOT NULL,
                    FOREIGN KEY (conference_id) REFERENCES conferences(id)
                );
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS evidence_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conference_id TEXT NOT NULL,
                    category TEXT NOT NULL,
                    claim TEXT NOT NULL,
                    is_self_claimed INTEGER NOT NULL,
                    source_name TEXT NOT NULL,
                    source_url TEXT NOT NULL,
                    retrieved_at TEXT NOT NULL,
                    supporting_excerpt TEXT,
                    verification_status TEXT NOT NULL,
                    notes TEXT,
                    UNIQUE(conference_id, category, claim, source_url),
                    FOREIGN KEY (conference_id) REFERENCES conferences(id)
                );
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS credibility_assessments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conference_id TEXT NOT NULL,
                    risk_level TEXT NOT NULL,
                    credibility_status TEXT NOT NULL,
                    positive_indicators TEXT,
                    warning_indicators TEXT,
                    contradictions TEXT,
                    missing_information TEXT,
                    findings TEXT,
                    assessed_at TEXT NOT NULL,
                    version TEXT NOT NULL,
                    FOREIGN KEY (conference_id) REFERENCES conferences(id)
                );
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_applications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL DEFAULT 'default_user',
                    conference_id TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'Interested',
                    notes TEXT,
                    added_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    submitted_at TEXT,
                    decision_at TEXT,
                    UNIQUE(user_id, conference_id),
                    FOREIGN KEY (conference_id) REFERENCES conferences(id)
                );
            """)

            # Migration: Ensure user_id column exists for existing DBs
            cursor.execute("PRAGMA table_info(user_applications);")
            app_cols = [c[1] for c in cursor.fetchall()]
            if app_cols and "user_id" not in app_cols:
                cursor.execute("ALTER TABLE user_applications ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default_user';")

            # Migration: Ensure table has composite UNIQUE(user_id, conference_id) rather than old column-level UNIQUE
            cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='user_applications';")
            row = cursor.fetchone()
            if row and row[0]:
                ddl = row[0].replace(" ", "").replace("\n", "").lower()
                if "unique(user_id,conference_id)" not in ddl:
                    cursor.execute("""
                        CREATE TABLE user_applications_migrated (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id TEXT NOT NULL DEFAULT 'default_user',
                            conference_id TEXT NOT NULL,
                            status TEXT NOT NULL DEFAULT 'Interested',
                            notes TEXT,
                            added_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL,
                            submitted_at TEXT,
                            decision_at TEXT,
                            UNIQUE(user_id, conference_id),
                            FOREIGN KEY (conference_id) REFERENCES conferences(id)
                        );
                    """)
                    cursor.execute("""
                        INSERT OR IGNORE INTO user_applications_migrated
                            (id, user_id, conference_id, status, notes, added_at, updated_at, submitted_at, decision_at)
                        SELECT id, COALESCE(user_id, 'default_user'), conference_id, status, notes, added_at, updated_at, submitted_at, decision_at
                        FROM user_applications;
                    """)
                    cursor.execute("DROP TABLE user_applications;")
                    cursor.execute("ALTER TABLE user_applications_migrated RENAME TO user_applications;")

            conn.commit()

    def _row_to_model(self, row: sqlite3.Row) -> NormalizedConference:
        keys = row.keys()
        return NormalizedConference(
            id=row["id"],
            name=row["name"],
            edition_or_year=row["edition_or_year"],
            title=row["title"],
            topics=json.loads(row["topics"]) if row["topics"] else [],
            submission_deadline=row["submission_deadline"],
            raw_submission_deadline_str=row["raw_submission_deadline_str"],
            start_date=row["start_date"],
            end_date=row["end_date"],
            location=row["location"],
            format=row["format"],
            publisher=row["publisher"],
            organizer=row["organizer"],
            registration_fees=row["registration_fees"],
            official_website_url=row["official_website_url"],
            source_name=row["source_name"],
            source_url=row["source_url"],
            first_discovered_at=row["first_discovered_at"],
            last_checked_at=row["last_checked_at"],
            warnings=json.loads(row["warnings"]) if row["warnings"] else [],
            status=row["status"] if "status" in keys else None,
            event_status=row["event_status"] if "event_status" in keys and row["event_status"] else "Upcoming",
            submission_status=row["submission_status"] if "submission_status" in keys and row["submission_status"] else "Deadline unknown",
            event_type=row["event_type"] if "event_type" in keys and row["event_type"] else "conference",
            paper_opportunity_status=row["paper_opportunity_status"] if "paper_opportunity_status" in keys and row["paper_opportunity_status"] else "unverified",
            has_paper_submission=bool(row["has_paper_submission"]) if "has_paper_submission" in keys and row["has_paper_submission"] is not None else True,
            submission_url=row["submission_url"] if "submission_url" in keys else None,
        )

    def get_by_id(self, conference_id: str) -> Optional[NormalizedConference]:
        with self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM conferences WHERE id = ?", (conference_id,))
            row = cur.fetchone()
            if row:
                return self._row_to_model(row)
            return None

    def upsert_conference(self, conf: NormalizedConference) -> Tuple[str, Optional[DeadlineHistory]]:
        with self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM conferences WHERE id = ?", (conf.id,))
            existing_row = cur.fetchone()

            if not existing_row:
                # Insert fresh record
                cur.execute("""
                    INSERT INTO conferences (
                        id, name, edition_or_year, title, topics, submission_deadline,
                        raw_submission_deadline_str, start_date, end_date, location,
                        format, publisher, organizer, registration_fees,
                        official_website_url, source_name, source_url,
                        first_discovered_at, last_checked_at, warnings,
                        status, event_status, submission_status, event_type,
                        paper_opportunity_status, has_paper_submission, submission_url
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    conf.id, conf.name, conf.edition_or_year, conf.title,
                    json.dumps(conf.topics), conf.submission_deadline,
                    conf.raw_submission_deadline_str, conf.start_date, conf.end_date,
                    conf.location, conf.format, conf.publisher, conf.organizer,
                    conf.registration_fees, conf.official_website_url, conf.source_name,
                    conf.source_url, conf.first_discovered_at, conf.last_checked_at,
                    json.dumps(conf.warnings),
                    conf.status, conf.event_status, conf.submission_status, conf.event_type,
                    conf.paper_opportunity_status,
                    1 if conf.has_paper_submission else 0, conf.submission_url
                ))
                conn.commit()
                return "inserted", None

            existing = self._row_to_model(existing_row)

            # 1. Deadline change detection:
            # ONLY record history when a real previously stored deadline changes to a different deadline
            deadline_changed = (
                existing.submission_deadline is not None
                and conf.submission_deadline is not None
                and conf.submission_deadline != existing.submission_deadline
            )
            
            dl_event = None
            if deadline_changed:
                dl_event = DeadlineHistory(
                    conference_id=conf.id,
                    previous_deadline=existing.submission_deadline,
                    new_deadline=conf.submission_deadline,
                    detected_at=conf.last_checked_at,
                    source_name=conf.source_name,
                    source_url=conf.source_url
                )
                cur.execute("""
                    INSERT INTO deadline_history (
                        conference_id, previous_deadline, new_deadline,
                        detected_at, source_name, source_url
                    ) VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    dl_event.conference_id, dl_event.previous_deadline,
                    dl_event.new_deadline, dl_event.detected_at,
                    dl_event.source_name, dl_event.source_url
                ))

            # 2. Field merge: do NOT allow a missing / None value from a new scrape
            # to overwrite a previously known valid value.
            merged_name = conf.name if conf.name and conf.name != "UNKNOWN" else existing.name
            merged_edition = conf.edition_or_year if conf.edition_or_year and conf.edition_or_year != "unknown" else existing.edition_or_year
            merged_title = conf.title if conf.title is not None else existing.title
            
            # Topics: merge and deduplicate
            merged_topics = list(dict.fromkeys(existing.topics + conf.topics)) if conf.topics else existing.topics
            
            # Submission deadline: preserve existing if new scrape returned None/missing
            if conf.submission_deadline is not None:
                merged_deadline = conf.submission_deadline
                merged_raw_deadline = conf.raw_submission_deadline_str
            else:
                merged_deadline = existing.submission_deadline
                merged_raw_deadline = existing.raw_submission_deadline_str

            merged_start_date = conf.start_date if conf.start_date is not None else existing.start_date
            merged_end_date = conf.end_date if conf.end_date is not None else existing.end_date
            merged_location = conf.location if conf.location is not None else existing.location
            merged_format = conf.format if conf.format not in (None, "Unknown") else existing.format
            merged_publisher = conf.publisher if conf.publisher is not None else existing.publisher
            merged_organizer = conf.organizer if conf.organizer is not None else existing.organizer
            merged_fees = conf.registration_fees if conf.registration_fees is not None else existing.registration_fees
            merged_website = conf.official_website_url if conf.official_website_url is not None else existing.official_website_url
            merged_status = conf.status if conf.status is not None else existing.status
            merged_event_status = conf.event_status if conf.event_status is not None else existing.event_status
            merged_submission_status = conf.submission_status if conf.submission_status is not None else existing.submission_status
            merged_event_type = conf.event_type if conf.event_type != "conference" else existing.event_type
            merged_opp_status = conf.paper_opportunity_status if conf.paper_opportunity_status != "unverified" else existing.paper_opportunity_status
            merged_has_paper_sub = conf.has_paper_submission if conf.has_paper_submission is not None else existing.has_paper_submission
            merged_sub_url = conf.submission_url if conf.submission_url is not None else existing.submission_url
            
            # Provenance: if the conference data actually changed, update source provenance
            first_discovered = existing.first_discovered_at

            # Warnings: merge distinct warnings so past data-quality warnings remain auditable
            merged_warnings = list(dict.fromkeys(existing.warnings + conf.warnings))

            substantive_content_changed = (
                existing.name != merged_name or
                existing.title != merged_title or
                existing.topics != merged_topics or
                existing.submission_deadline != merged_deadline or
                existing.raw_submission_deadline_str != merged_raw_deadline or
                existing.start_date != merged_start_date or
                existing.end_date != merged_end_date or
                existing.location != merged_location or
                existing.format != merged_format or
                existing.publisher != merged_publisher or
                existing.organizer != merged_organizer or
                existing.official_website_url != merged_website or
                existing.registration_fees != merged_fees or
                existing.warnings != merged_warnings or
                existing.status != merged_status or
                existing.event_status != merged_event_status or
                existing.submission_status != merged_submission_status or
                existing.event_type != merged_event_type or
                existing.paper_opportunity_status != merged_opp_status or
                existing.has_paper_submission != merged_has_paper_sub or
                existing.submission_url != merged_sub_url
            )

            # Only update source_name and source_url if there was a substantive update
            if substantive_content_changed:
                merged_source_name = conf.source_name or existing.source_name
                merged_source_url = conf.source_url or existing.source_url
            else:
                merged_source_name = existing.source_name
                merged_source_url = existing.source_url

            # Update database record with merged content
            cur.execute("""
                UPDATE conferences SET
                    name = ?, edition_or_year = ?, title = ?, topics = ?,
                    submission_deadline = ?, raw_submission_deadline_str = ?,
                    start_date = ?, end_date = ?, location = ?, format = ?,
                    publisher = ?, organizer = ?, registration_fees = ?,
                    official_website_url = ?, source_name = ?, source_url = ?,
                    first_discovered_at = ?, last_checked_at = ?, warnings = ?,
                    status = ?, event_status = ?, submission_status = ?, event_type = ?,
                    paper_opportunity_status = ?, has_paper_submission = ?, submission_url = ?
                WHERE id = ?
            """, (
                merged_name, merged_edition, merged_title, json.dumps(merged_topics),
                merged_deadline, merged_raw_deadline,
                merged_start_date, merged_end_date, merged_location, merged_format,
                merged_publisher, merged_organizer, merged_fees,
                merged_website, merged_source_name, merged_source_url,
                first_discovered, conf.last_checked_at, json.dumps(merged_warnings),
                merged_status, merged_event_status, merged_submission_status, merged_event_type,
                merged_opp_status, 1 if merged_has_paper_sub else 0, merged_sub_url,
                conf.id
            ))
            conn.commit()

            if substantive_content_changed or dl_event:
                return "updated", dl_event
            else:
                return "unchanged", None

    def list_all(
        self,
        event_type: Optional[str] = None,
        has_paper_submission: Optional[bool] = None,
        paper_opportunity_status: Optional[str] = None,
        status: Optional[str] = None,
        event_status: Optional[str] = None,
        submission_status: Optional[str] = None,
        include_historical: bool = True,
        topic: Optional[str] = None,
        country_or_city: Optional[str] = None,
        format_type: Optional[str] = None,
        min_deadline: Optional[str] = None,
        max_deadline: Optional[str] = None,
    ) -> List[NormalizedConference]:
        with self._get_connection() as conn:
            cur = conn.cursor()
            query = "SELECT * FROM conferences WHERE 1=1"
            params = []

            if not include_historical:
                query += " AND (event_status IS NULL OR event_status != 'Completed') AND (status IS NULL OR status NOT LIKE '%Completed%')"

            if event_type:
                query += " AND event_type = ?"
                params.append(event_type.lower())

            if has_paper_submission is not None:
                query += " AND has_paper_submission = ?"
                params.append(1 if has_paper_submission else 0)

            if paper_opportunity_status:
                query += " AND paper_opportunity_status = ?"
                params.append(paper_opportunity_status.lower())

            if status:
                query += " AND status LIKE ?"
                params.append(f"%{status}%")

            if event_status:
                query += " AND event_status LIKE ?"
                params.append(f"%{event_status}%")

            if submission_status:
                query += " AND submission_status LIKE ?"
                params.append(f"%{submission_status}%")

            if topic:
                query += " AND topics LIKE ?"
                params.append(f"%{topic}%")

            if country_or_city:
                query += " AND location LIKE ?"
                params.append(f"%{country_or_city}%")

            if format_type:
                query += " AND format LIKE ?"
                params.append(f"%{format_type}%")

            if min_deadline:
                query += " AND submission_deadline >= ?"
                params.append(min_deadline)

            if max_deadline:
                query += " AND submission_deadline <= ?"
                params.append(max_deadline)

            query += " ORDER BY name, edition_or_year"
            cur.execute(query, params)
            return [self._row_to_model(r) for r in cur.fetchall()]

    def get_deadline_history(self, conference_id: Optional[str] = None) -> List[DeadlineHistory]:
        with self._get_connection() as conn:
            cur = conn.cursor()
            if conference_id:
                cur.execute("SELECT * FROM deadline_history WHERE conference_id = ? ORDER BY detected_at DESC", (conference_id,))
            else:
                cur.execute("SELECT * FROM deadline_history ORDER BY detected_at DESC")
            rows = cur.fetchall()
            return [
                DeadlineHistory(
                    id=r["id"],
                    conference_id=r["conference_id"],
                    previous_deadline=r["previous_deadline"],
                    new_deadline=r["new_deadline"],
                    detected_at=r["detected_at"],
                    source_name=r["source_name"],
                    source_url=r["source_url"],
                ) for r in rows
            ]

    def save_evidence(self, items: List[EvidenceItem]) -> int:
        inserted_count = 0
        with self._get_connection() as conn:
            cur = conn.cursor()
            for item in items:
                try:
                    cur.execute("""
                        INSERT INTO evidence_items (
                            conference_id, category, claim, is_self_claimed,
                            source_name, source_url, retrieved_at,
                            supporting_excerpt, verification_status, notes
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(conference_id, category, claim, source_url) DO UPDATE SET
                            verification_status = excluded.verification_status,
                            supporting_excerpt = excluded.supporting_excerpt,
                            retrieved_at = excluded.retrieved_at,
                            notes = excluded.notes
                    """, (
                        item.conference_id,
                        item.category.value,
                        item.claim,
                        1 if item.is_self_claimed else 0,
                        item.source_name,
                        item.source_url,
                        item.retrieved_at,
                        item.supporting_excerpt,
                        item.verification_status.value,
                        item.notes
                    ))
                    if cur.rowcount > 0:
                        inserted_count += 1
                except Exception as e:
                    pass
            conn.commit()
        return inserted_count

    def get_evidence_for_conference(self, conference_id: str) -> List[EvidenceItem]:
        with self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT * FROM evidence_items
                WHERE conference_id = ?
                ORDER BY category, id
            """, (conference_id,))
            rows = cur.fetchall()
            return [
                EvidenceItem(
                    id=r["id"],
                    conference_id=r["conference_id"],
                    category=EvidenceCategory(r["category"]),
                    claim=r["claim"],
                    is_self_claimed=bool(r["is_self_claimed"]),
                    source_name=r["source_name"],
                    source_url=r["source_url"],
                    retrieved_at=r["retrieved_at"],
                    supporting_excerpt=r["supporting_excerpt"],
                    verification_status=VerificationStatus(r["verification_status"]),
                    notes=r["notes"]
                ) for r in rows
            ]

    def save_assessment(self, assessment: CredibilityAssessment) -> int:
        with self._get_connection() as conn:
            cur = conn.cursor()
            findings_json = json.dumps([f.model_dump() for f in assessment.findings])
            cur.execute("""
                INSERT INTO credibility_assessments (
                    conference_id, risk_level, credibility_status,
                    positive_indicators, warning_indicators, contradictions,
                    missing_information, findings, assessed_at, version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                assessment.conference_id,
                assessment.risk_level.value,
                assessment.credibility_status,
                json.dumps(assessment.positive_indicators),
                json.dumps(assessment.warning_indicators),
                json.dumps(assessment.contradictions),
                json.dumps(assessment.missing_information),
                findings_json,
                assessment.assessed_at,
                assessment.version
            ))
            assessment_id = cur.lastrowid
            conn.commit()
            return assessment_id

    def _row_to_assessment(self, row: sqlite3.Row) -> CredibilityAssessment:
        raw_findings = json.loads(row["findings"]) if row["findings"] else []
        findings = [
            VerificationFinding(
                rule_id=f["rule_id"],
                rule_name=f["rule_name"],
                category=EvidenceCategory(f["category"]),
                status=VerificationStatus(f["status"]),
                reason=f["reason"],
                evidence_ids=f.get("evidence_ids", []),
                evidence_excerpts=f.get("evidence_excerpts", [])
            ) for f in raw_findings
        ]
        return CredibilityAssessment(
            id=row["id"],
            conference_id=row["conference_id"],
            risk_level=RiskLevel(row["risk_level"]),
            credibility_status=row["credibility_status"],
            positive_indicators=json.loads(row["positive_indicators"]) if row["positive_indicators"] else [],
            warning_indicators=json.loads(row["warning_indicators"]) if row["warning_indicators"] else [],
            contradictions=json.loads(row["contradictions"]) if row["contradictions"] else [],
            missing_information=json.loads(row["missing_information"]) if row["missing_information"] else [],
            findings=findings,
            assessed_at=row["assessed_at"],
            version=row["version"]
        )

    def get_latest_assessment(self, conference_id: str) -> Optional[CredibilityAssessment]:
        with self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT * FROM credibility_assessments
                WHERE conference_id = ?
                ORDER BY assessed_at DESC, id DESC
                LIMIT 1
            """, (conference_id,))
            row = cur.fetchone()
            if row:
                return self._row_to_assessment(row)
            return None

    def get_assessment_history(self, conference_id: str) -> List[CredibilityAssessment]:
        with self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT * FROM credibility_assessments
                WHERE conference_id = ?
                ORDER BY assessed_at DESC, id DESC
            """, (conference_id,))
            rows = cur.fetchall()
            return [self._row_to_assessment(r) for r in rows]

    # -----------------------------------------------------------------------
    # User Application Tracking Methods
    # -----------------------------------------------------------------------

    def create_application(
        self,
        user_id: str,
        conference_id: str,
        status: str = "Interested",
        notes: Optional[str] = None,
        submitted_at: Optional[str] = None,
        decision_at: Optional[str] = None,
    ) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO user_applications
                    (user_id, conference_id, status, notes, added_at, updated_at, submitted_at, decision_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_id, conference_id, status, notes, now, now, submitted_at, decision_at))
            conn.commit()
        app = self.get_application(user_id, conference_id)
        if not app:
            raise RuntimeError("Failed to retrieve created application")
        return app

    def get_application(self, user_id: str, conference_id: str) -> Optional[dict]:
        with self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT * FROM user_applications WHERE user_id = ? AND conference_id = ?
            """, (user_id, conference_id))
            row = cur.fetchone()
            if row:
                return dict(row)
            return None

    def list_applications(self, user_id: str, status: Optional[str] = None) -> List[dict]:
        with self._get_connection() as conn:
            cur = conn.cursor()
            if status:
                cur.execute("""
                    SELECT * FROM user_applications
                    WHERE user_id = ? AND status = ?
                    ORDER BY updated_at DESC
                """, (user_id, status))
            else:
                cur.execute("""
                    SELECT * FROM user_applications
                    WHERE user_id = ?
                    ORDER BY updated_at DESC
                """, (user_id,))
            return [dict(r) for r in cur.fetchall()]

    def update_application(
        self,
        user_id: str,
        conference_id: str,
        status: Optional[str] = None,
        notes: Optional[str] = None,
        submitted_at: Optional[str] = None,
        decision_at: Optional[str] = None,
    ) -> Optional[dict]:
        existing = self.get_application(user_id, conference_id)
        if not existing:
            return None

        now = datetime.now(timezone.utc).isoformat()
        fields: dict = {"updated_at": now}
        if status is not None:
            fields["status"] = status
        if notes is not None:
            fields["notes"] = notes
        if submitted_at is not None:
            fields["submitted_at"] = submitted_at
        if decision_at is not None:
            fields["decision_at"] = decision_at

        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [user_id, conference_id]

        with self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute(f"UPDATE user_applications SET {set_clause} WHERE user_id = ? AND conference_id = ?", values)
            conn.commit()

        return self.get_application(user_id, conference_id)

    def delete_application(self, user_id: str, conference_id: str) -> bool:
        with self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM user_applications WHERE user_id = ? AND conference_id = ?", (user_id, conference_id))
            conn.commit()
            return cur.rowcount > 0
