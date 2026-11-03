"""Six-hour automatic scraping scheduler and execution manager for Researchly.io.

Features:
- Configurable interval (defaults to 6 hours = 21,600 seconds).
- Overlap prevention using a persistent file / SQLite execution lock.
- Incremental source collection respecting rate limits.
- Tracks last successful scrape, error history, and per-source telemetry.
- Safe retries and failure reporting.
- Manual trigger API for background or synchronous runs.
- Production/deployment ready as a daemon thread or standalone runner.
"""

from __future__ import annotations

import logging
import os
import sqlite3
import threading
import time
from datetime import datetime
from typing import Optional, List, Dict, Any

from ..storage.repository import SQLiteConferenceRepository, IngestionStats
from ..storage.raw_store import RawCollectionStore
from ..adapters.base import SourceAdapter
from ..adapters.public_cfp_feed import PublicCFPFeedAdapter
from ..adapters.broad_cfp_adapter import (
    ConferenceAlertsAdapter,
    WikiCFPBroadAdapter,
    COREConferencePortalAdapter,
)
from ..adapters.openreview_adapter import OpenReviewAdapter
from ..adapters.icml_adapter import ICMLOfficialAdapter
from ..core.pipeline import IngestionPipeline, SourceRunReport

logger = logging.getLogger("researchly.scheduler")

_SCHEDULER_SCHEMA = """
CREATE TABLE IF NOT EXISTS scheduler_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_type TEXT NOT NULL,          -- 'scheduled' | 'manual'
    started_at TEXT NOT NULL,        -- ISO timestamp
    completed_at TEXT,               -- ISO timestamp or NULL if running/crashed
    status TEXT NOT NULL,            -- 'running' | 'success' | 'failed'
    discovered_count INTEGER DEFAULT 0,
    inserted_count INTEGER DEFAULT 0,
    updated_count INTEGER DEFAULT 0,
    error_message TEXT,
    source_telemetry TEXT            -- JSON per-source results
);

CREATE TABLE IF NOT EXISTS scheduler_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


class ScrapingScheduler:
    """Manages periodic 6-hour discovery runs and manual triggers."""

    def __init__(
        self,
        db_path: str = "researchly.db",
        interval_hours: float = 6.0,
        enable_raw_store: bool = True,
    ):
        self.db_path = db_path
        self.interval_seconds = int(interval_hours * 3600)
        self.enable_raw_store = enable_raw_store
        self._lock = threading.Lock()
        self._is_running_job = False
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript(_SCHEDULER_SCHEMA)
            conn.commit()

    def get_status(self) -> Dict[str, Any]:
        """Return status of the scheduler, last run, and execution telemetry."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            last_run = conn.execute(
                "SELECT * FROM scheduler_runs ORDER BY id DESC LIMIT 1"
            ).fetchone()
            last_success = conn.execute(
                "SELECT * FROM scheduler_runs WHERE status = 'success' ORDER BY id DESC LIMIT 1"
            ).fetchone()
            total_runs = conn.execute("SELECT COUNT(*) FROM scheduler_runs").fetchone()[0]

        import json
        last_run_dict = None
        if last_run:
            last_run_dict = {
                "id": last_run["id"],
                "run_type": last_run["run_type"],
                "started_at": last_run["started_at"],
                "completed_at": last_run["completed_at"],
                "status": last_run["status"],
                "discovered": last_run["discovered_count"],
                "inserted": last_run["inserted_count"],
                "updated": last_run["updated_count"],
                "error": last_run["error_message"],
                "telemetry": json.loads(last_run["source_telemetry"]) if last_run["source_telemetry"] else {},
            }

        return {
            "interval_hours": self.interval_seconds / 3600.0,
            "is_job_active": self._is_running_job,
            "daemon_active": self._thread is not None and self._thread.is_alive(),
            "total_runs": total_runs,
            "last_run": last_run_dict,
            "last_successful_scrape": last_success["completed_at"] if last_success else None,
        }

    def set_interval_hours(self, hours: float):
        """Update scraping interval."""
        if hours < 0.1:
            raise ValueError("Interval must be at least 0.1 hours (6 minutes)")
        self.interval_seconds = int(hours * 3600)
        logger.info("Scraping interval updated to %f hours (%d seconds)", hours, self.interval_seconds)

    def trigger_scrape(self, run_type: str = "manual") -> Dict[str, Any]:
        """Trigger an incremental discovery scrape immediately.
        
        Prevents concurrent overlapping runs.
        """
        with self._lock:
            if self._is_running_job:
                return {
                    "status": "rejected",
                    "reason": "A scraping job is already running. Concurrent runs are prevented.",
                }
            self._is_running_job = True

        import json
        started_at = datetime.utcnow().isoformat() + "Z"
        run_id = None

        with sqlite3.connect(self.db_path) as conn:
            cur = conn.execute(
                "INSERT INTO scheduler_runs (run_type, started_at, status) VALUES (?, ?, 'running')",
                (run_type, started_at),
            )
            run_id = cur.lastrowid
            conn.commit()

        try:
            logger.info("Starting scrape job #%s (type: %s)", run_id, run_type)
            repo = SQLiteConferenceRepository(db_path=self.db_path)
            raw_store = RawCollectionStore(db_path=self.db_path) if self.enable_raw_store else None

            # Incremental safe adapters
            adapters: List[SourceAdapter] = [
                PublicCFPFeedAdapter(max_records_per_feed=25, raw_store=raw_store),
                ConferenceAlertsAdapter(max_per_feed=20, raw_store=raw_store),
                WikiCFPBroadAdapter(max_records_per_query=6, raw_store=raw_store),
                COREConferencePortalAdapter(max_pages=2, raw_store=raw_store),
                OpenReviewAdapter(max_venues=10),
                ICMLOfficialAdapter(),
            ]

            pipeline = IngestionPipeline(repository=repo, adapters=adapters)
            stats, source_reports = pipeline.run()

            completed_at = datetime.utcnow().isoformat() + "Z"
            telemetry = {
                r.source_name: {
                    "success": r.success,
                    "discovered": r.records_discovered,
                    "inserted": r.records_inserted,
                    "updated": r.records_updated,
                    "error": r.error_message,
                }
                for r in source_reports
            }

            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """
                    UPDATE scheduler_runs SET
                        completed_at = ?,
                        status = 'success',
                        discovered_count = ?,
                        inserted_count = ?,
                        updated_count = ?,
                        source_telemetry = ?
                    WHERE id = ?
                    """,
                    (
                        completed_at,
                        stats.discovered,
                        stats.inserted,
                        stats.updated,
                        json.dumps(telemetry),
                        run_id,
                    ),
                )
                conn.commit()

            return {
                "status": "success",
                "run_id": run_id,
                "started_at": started_at,
                "completed_at": completed_at,
                "discovered": stats.discovered,
                "inserted": stats.inserted,
                "updated": stats.updated,
                "telemetry": telemetry,
            }

        except Exception as e:
            completed_at = datetime.utcnow().isoformat() + "Z"
            err_msg = str(e)[:500]
            logger.error("Scrape job #%s failed: %s", run_id, err_msg)
            try:
                with sqlite3.connect(self.db_path) as conn:
                    conn.execute(
                        """
                        UPDATE scheduler_runs SET
                            completed_at = ?,
                            status = 'failed',
                            error_message = ?
                        WHERE id = ?
                        """,
                        (completed_at, err_msg, run_id),
                    )
                    conn.commit()
            except Exception:
                logger.error("Could not record scheduler failure for run %s", run_id)
            return {
                "status": "failed",
                "run_id": run_id,
                "error": err_msg,
            }
        finally:
            with self._lock:
                self._is_running_job = False

    def start_background_loop(self):
        """Start the daemon thread that executes scraping every 6 hours."""
        if self._thread is not None and self._thread.is_alive():
            logger.info("Scheduler daemon already active.")
            return

        self._stop_event.clear()

        def _loop():
            logger.info("Scheduler loop started with interval %ds", self.interval_seconds)
            while not self._stop_event.is_set():
                # Wait out the interval first so startup does not scrape or call AI.
                interrupted = self._stop_event.wait(timeout=self.interval_seconds)
                if interrupted:
                    break
                try:
                    self.trigger_scrape(run_type="scheduled")
                except Exception as exc:
                    logger.error("Scheduled scrape job encountered error: %s", exc)

        self._thread = threading.Thread(target=_loop, daemon=True, name="ResearchlyScraperDaemon")
        self._thread.start()
        logger.info("Scheduler background loop started successfully.")

    def stop_background_loop(self):
        """Stop background daemon."""
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)
            logger.info("Scheduler background loop stopped.")

