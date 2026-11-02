"""Pipeline orchestration connecting adapters, normalization, and repository."""

from __future__ import annotations

import logging
from typing import List, Tuple, Optional
from datetime import datetime
from dataclasses import dataclass
from ..core.models import NormalizedConference, DeadlineHistory
from ..core.normalizer import normalize_conference
from ..adapters.base import SourceAdapter
from ..storage.repository import ConferenceRepository, IngestionStats

logger = logging.getLogger("researchly.pipeline")


@dataclass
class SourceRunReport:
    source_name: str
    success: bool
    records_discovered: int = 0
    records_inserted: int = 0
    records_updated: int = 0
    duplicates_skipped: int = 0
    deadline_changes: int = 0
    error_message: Optional[str] = None
    last_run_timestamp: Optional[str] = None


class IngestionPipeline:
    """Orchestrates multi-source conference ingestion with per-source telemetry."""

    def __init__(self, repository: ConferenceRepository, adapters: List[SourceAdapter]):
        self.repository = repository
        self.adapters = adapters

    def run(self) -> Tuple[IngestionStats, List[SourceRunReport]]:
        """Executes ingestion across all registered adapters.
        
        Returns:
            (IngestionStats, source_reports) where each source has a SourceRunReport.
        """
        stats = IngestionStats()
        source_reports: List[SourceRunReport] = []

        logger.info("Starting ingestion run across %d adapter(s)...", len(self.adapters))

        for adapter in self.adapters:
            logger.info("Processing adapter: '%s'...", adapter.source_name)
            report = SourceRunReport(
                source_name=adapter.source_name,
                success=True,
                last_run_timestamp=datetime.utcnow().isoformat() + "Z"
            )

            try:
                raw_records = adapter.fetch()
                report.records_discovered = len(raw_records)
                stats.discovered += len(raw_records)
                logger.info("Adapter '%s' returned %d record(s)", adapter.source_name, len(raw_records))
            except Exception as e:
                err_msg = str(e)
                logger.warning("Adapter '%s' failed: %s", adapter.source_name, err_msg)
                report.success = False
                report.error_message = err_msg
                source_reports.append(report)
                continue

            for raw in raw_records:
                try:
                    norm = normalize_conference(raw)
                    if norm.warnings:
                        stats.warnings_logged += len(norm.warnings)
                        for w in norm.warnings:
                            logger.debug("[%s] Quality Warning: %s", norm.id, w)

                    action, dl_event = self.repository.upsert_conference(norm)
                    if action == "inserted":
                        stats.inserted += 1
                        report.records_inserted += 1
                        logger.info("Inserted new conference: %s", norm.id)
                    elif action == "updated":
                        stats.updated += 1
                        report.records_updated += 1
                        logger.info("Updated existing conference: %s", norm.id)
                    elif action == "unchanged":
                        stats.duplicates_skipped += 1
                        report.duplicates_skipped += 1
                        logger.debug("Idempotent check: conference %s unchanged", norm.id)

                    if dl_event:
                        stats.deadline_changes += 1
                        report.deadline_changes += 1
                        logger.warning(
                            "DEADLINE CHANGE DETECTED for %s: %s -> %s (Source: %s)",
                            norm.id,
                            dl_event.previous_deadline,
                            dl_event.new_deadline,
                            dl_event.source_name
                        )

                except Exception as e:
                    logger.error("Failed to process record from '%s': %s", adapter.source_name, e)
                    report.error_message = f"Record processing error: {e}"

            source_reports.append(report)

        return stats, source_reports

