"""Raw collection store — persists scraped content before any processing.

Every scraped page/response is stored here with its source URL and timestamp.
This fulfils the 'raw collection first' requirement and provides an audit trail
for the LLM processing queues.
"""

from __future__ import annotations

import hashlib
import json
import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional, List
from dataclasses import dataclass

logger = logging.getLogger("researchly.storage.raw_store")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS raw_scrape_cache (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    content_hash TEXT NOT NULL UNIQUE,   -- SHA-256 of raw content (dedup)
    source_url   TEXT NOT NULL,
    source_name  TEXT NOT NULL,
    scraped_at   TEXT NOT NULL,          -- ISO-8601 UTC timestamp
    content_type TEXT NOT NULL DEFAULT 'html',  -- 'html', 'json', 'yaml', 'xml'
    raw_content  TEXT NOT NULL,
    byte_length  INTEGER NOT NULL,
    llm_queue    TEXT DEFAULT NULL,      -- 'gemini' | 'deepseek' | NULL (processed)
    processed_at TEXT DEFAULT NULL       -- ISO-8601 UTC when an LLM consumed this row
);

CREATE INDEX IF NOT EXISTS idx_raw_url ON raw_scrape_cache(source_url);
CREATE INDEX IF NOT EXISTS idx_raw_queue ON raw_scrape_cache(llm_queue) WHERE llm_queue IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_raw_unprocessed ON raw_scrape_cache(processed_at) WHERE processed_at IS NULL;
"""


@dataclass
class RawScrapeRecord:
    id: Optional[int]
    content_hash: str
    source_url: str
    source_name: str
    scraped_at: str
    content_type: str
    raw_content: str
    byte_length: int
    llm_queue: Optional[str]
    processed_at: Optional[str]


class RawCollectionStore:
    """SQLite-backed store for raw scraped content.

    Usage pattern:
        store = RawCollectionStore("researchly.db")
        record_id = store.save(url, source_name, raw_html, content_type="html")
    """

    def __init__(self, db_path: str = "researchly.db"):
        self.db_path = db_path
        self._init()

    # ------------------------------------------------------------------
    # Init / migration
    # ------------------------------------------------------------------

    def _init(self):
        with self._conn() as conn:
            conn.executescript(_SCHEMA)
            conn.commit()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def save(
        self,
        source_url: str,
        source_name: str,
        raw_content: str,
        content_type: str = "html",
        llm_queue: Optional[str] = None,
    ) -> Optional[int]:
        """Persist raw scraped content.

        Returns the row-id if newly inserted, or None if content already exists
        (identical SHA-256 hash — exact duplicate scrape).
        """
        if not raw_content:
            return None

        content_hash = hashlib.sha256(raw_content.encode("utf-8", errors="replace")).hexdigest()
        scraped_at = datetime.utcnow().isoformat() + "Z"
        byte_len = len(raw_content.encode("utf-8", errors="replace"))

        with self._conn() as conn:
            try:
                cur = conn.execute(
                    """
                    INSERT INTO raw_scrape_cache
                        (content_hash, source_url, source_name, scraped_at,
                         content_type, raw_content, byte_length, llm_queue)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (content_hash, source_url, source_name, scraped_at,
                     content_type, raw_content, byte_len, llm_queue),
                )
                conn.commit()
                logger.debug(
                    "Stored raw %s from '%s' (%d bytes, hash=%s…)",
                    content_type, source_url, byte_len, content_hash[:12],
                )
                return cur.lastrowid
            except sqlite3.IntegrityError:
                # Identical content already cached — not an error
                logger.debug("Duplicate raw content skipped for %s", source_url)
                return None

    def get_pending_queue(self, llm_queue: str, limit: int = 50) -> List[RawScrapeRecord]:
        """Return unprocessed rows assigned to a given LLM queue."""
        with self._conn() as conn:
            rows = conn.execute(
                """
                SELECT * FROM raw_scrape_cache
                WHERE llm_queue = ? AND processed_at IS NULL
                ORDER BY scraped_at ASC
                LIMIT ?
                """,
                (llm_queue, limit),
            ).fetchall()
        return [self._to_model(r) for r in rows]

    def mark_processed(self, row_id: int) -> None:
        """Mark a raw record as consumed by the LLM pipeline."""
        with self._conn() as conn:
            conn.execute(
                "UPDATE raw_scrape_cache SET processed_at = ?, llm_queue = NULL WHERE id = ?",
                (datetime.utcnow().isoformat() + "Z", row_id),
            )
            conn.commit()

    def stats(self) -> dict:
        """Return summary statistics about the raw cache."""
        with self._conn() as conn:
            total = conn.execute("SELECT COUNT(*) FROM raw_scrape_cache").fetchone()[0]
            pending = conn.execute(
                "SELECT COUNT(*) FROM raw_scrape_cache WHERE processed_at IS NULL AND llm_queue IS NOT NULL"
            ).fetchone()[0]
            by_source = conn.execute(
                "SELECT source_name, COUNT(*) AS cnt FROM raw_scrape_cache GROUP BY source_name ORDER BY cnt DESC"
            ).fetchall()
        return {
            "total_raw_records": total,
            "pending_llm_processing": pending,
            "by_source": {r["source_name"]: r["cnt"] for r in by_source},
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _to_model(row: sqlite3.Row) -> RawScrapeRecord:
        return RawScrapeRecord(
            id=row["id"],
            content_hash=row["content_hash"],
            source_url=row["source_url"],
            source_name=row["source_name"],
            scraped_at=row["scraped_at"],
            content_type=row["content_type"],
            raw_content=row["raw_content"],
            byte_length=row["byte_length"],
            llm_queue=row["llm_queue"],
            processed_at=row["processed_at"],
        )

