"""Structured JSON logging + per-source metrics."""
from __future__ import annotations

import json
import logging
import sys
from collections import defaultdict
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {"ts": datetime.now(timezone.utc).isoformat(), "level": record.levelname, "msg": record.getMessage()}
        payload.update(getattr(record, "ctx", {}))
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def get_logger(level: str = "INFO") -> logging.Logger:
    log = logging.getLogger("researchly")
    log.setLevel(level.upper())
    if not log.handlers:
        h = logging.StreamHandler(sys.stderr)
        h.setFormatter(JsonFormatter())
        log.addHandler(h)
    return log


def log(logger: logging.Logger, level: int, msg: str, **ctx) -> None:
    logger.log(level, msg, extra={"ctx": ctx})


class Metrics:
    COUNTERS = ("pages_fetched", "pages_failed", "pages_skipped_robots", "pages_not_modified",
                "pages_unchanged", "records_scraped", "records_failed")

    def __init__(self) -> None:
        self.data: dict[str, dict] = defaultdict(lambda: {**{c: 0 for c in self.COUNTERS}, "latency_ms_total": 0.0})

    def inc(self, source: str, key: str, n: int = 1) -> None:
        self.data[source][key] += n

    def add_latency(self, source: str, ms: float) -> None:
        self.data[source]["latency_ms_total"] += ms

    def snapshot(self) -> dict:
        out = {}
        for src, d in self.data.items():
            d = dict(d)
            n = d["pages_fetched"] or 1
            d["avg_latency_ms"] = round(d["latency_ms_total"] / n, 1)
            out[src] = d
        return out
