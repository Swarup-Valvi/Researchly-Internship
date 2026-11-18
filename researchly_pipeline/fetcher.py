"""HTTP layer: per-domain token bucket, robots.txt, retries with exponential backoff, conditional GET."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Callable, Optional
from urllib import robotparser
from urllib.parse import urlparse

import httpx

from observability import log


@dataclass
class FetchResult:
    url: str
    status: int
    content: bytes = b""
    text: str = ""
    latency_ms: float = 0.0
    etag: Optional[str] = None
    last_modified: Optional[str] = None
    not_modified: bool = False
    skipped_reason: Optional[str] = None  # e.g. "robots_disallowed"
    error: Optional[str] = None

    @property
    def ok(self) -> bool:
        return self.error is None and self.skipped_reason is None and (self.status == 200 or self.not_modified)


class TokenBucket:
    """Allows `rate_per_min` requests per minute per domain (burst of 1)."""

    def __init__(self, rate_per_min: float, clock: Callable[[], float], sleep: Callable[[float], None]) -> None:
        self.interval = 60.0 / max(rate_per_min, 0.1)
        self.clock, self.sleep = clock, sleep
        self.next_ok = 0.0

    def acquire(self) -> None:
        now = self.clock()
        if now < self.next_ok:
            self.sleep(self.next_ok - now)
            now = self.clock()
        self.next_ok = max(now, self.next_ok) + self.interval


class Fetcher:
    def __init__(self, cfg: dict, logger: logging.Logger, client: Optional[httpx.Client] = None,
                 clock: Callable[[], float] = time.monotonic, sleep: Callable[[float], None] = time.sleep) -> None:
        self.cfg, self.logger, self.clock, self.sleep = cfg, logger, clock, sleep
        self.client = client or httpx.Client(headers={"User-Agent": cfg["user_agent"]}, timeout=cfg.get("timeout_seconds", 20),
                                             follow_redirects=True)
        self.buckets: dict[str, TokenBucket] = {}
        self.robots: dict[str, Optional[robotparser.RobotFileParser]] = {}

    # --- robots --------------------------------------------------------------------------
    def _robots_for(self, url: str) -> Optional[robotparser.RobotFileParser]:
        p = urlparse(url)
        base = f"{p.scheme}://{p.netloc}"
        if base in self.robots:
            return self.robots[base]
        rp: Optional[robotparser.RobotFileParser] = robotparser.RobotFileParser()
        try:
            self._throttle(p.netloc)
            r = self.client.get(f"{base}/robots.txt")
            if r.status_code == 200:
                rp.parse(r.text.splitlines())
            elif 400 <= r.status_code < 500:
                rp.parse([])  # no robots.txt -> allowed
            else:  # 5xx -> be conservative
                rp.disallow_all = True
        except httpx.HTTPError as exc:
            log(self.logger, logging.WARNING, "robots.txt unreachable; treating as disallow", url=base, error=str(exc))
            rp.disallow_all = True
        self.robots[base] = rp
        return rp

    def allowed(self, url: str) -> bool:
        if not self.cfg.get("respect_robots", True):
            return True
        rp = self._robots_for(url)
        return bool(rp and rp.can_fetch(self.cfg["user_agent"], url))

    def _throttle(self, domain: str) -> None:
        b = self.buckets.get(domain)
        if b is None:
            b = self.buckets[domain] = TokenBucket(self.cfg.get("requests_per_minute", 6), self.clock, self.sleep)
        b.acquire()

    # --- fetch ---------------------------------------------------------------------------
    def get(self, url: str, etag: Optional[str] = None, last_modified: Optional[str] = None) -> FetchResult:
        if not self.allowed(url):
            log(self.logger, logging.WARNING, "skipped by robots.txt", url=url)
            return FetchResult(url, 0, skipped_reason="robots_disallowed")
        headers = {}
        if etag:
            headers["If-None-Match"] = etag
        if last_modified:
            headers["If-Modified-Since"] = last_modified
        attempts = int(self.cfg.get("max_retries", 3))
        base = float(self.cfg.get("backoff_base_seconds", 2.0))
        last_err = "unknown"
        for attempt in range(attempts):
            self._throttle(urlparse(url).netloc)
            t0 = self.clock()
            try:
                r = self.client.get(url, headers=headers)
            except httpx.HTTPError as exc:
                last_err = f"{type(exc).__name__}: {exc}"
            else:
                ms = (self.clock() - t0) * 1000
                if r.status_code == 304:
                    return FetchResult(url, 304, latency_ms=ms, not_modified=True)
                if r.status_code == 200:
                    return FetchResult(url, 200, content=r.content, text=r.text, latency_ms=ms,
                                       etag=r.headers.get("etag"), last_modified=r.headers.get("last-modified"))
                last_err = f"HTTP {r.status_code}"
                if r.status_code not in (429, 500, 502, 503, 504):
                    return FetchResult(url, r.status_code, error=last_err)  # 4xx other than 429: don't retry
                ra = r.headers.get("retry-after")
                if ra and ra.isdigit() and attempt < attempts - 1:
                    self.sleep(min(int(ra), 60))
                    continue
            if attempt < attempts - 1:
                self.sleep(base * (2 ** attempt))
        return FetchResult(url, 0, error=f"gave up after {attempts} attempts: {last_err}")


class FixtureFetcher:
    """Offline fetcher: serves saved HTML for URLs listed in fixtures/index.json. No network."""

    def __init__(self, directory, logger: logging.Logger) -> None:
        import json
        from pathlib import Path
        self.dir = Path(directory)
        self.index: dict[str, str] = json.loads((self.dir / "index.json").read_text())
        self.logger = logger

    def get(self, url: str, etag=None, last_modified=None) -> FetchResult:
        name = self.index.get(url)
        if not name:
            return FetchResult(url, 404, error="HTTP 404 (not in fixtures)")
        content = (self.dir / name).read_bytes()
        return FetchResult(url, 200, content=content, text=content.decode("utf-8", "replace"), latency_ms=1.0)

    def allowed(self, url: str) -> bool:
        return True
