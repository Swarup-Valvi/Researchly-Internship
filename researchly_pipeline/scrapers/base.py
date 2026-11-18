"""BaseScraper: shared fetch/snapshot/state/dead-letter flow. Subclasses only implement parse()."""
from __future__ import annotations

import hashlib
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from models import RawRecord
from observability import Metrics, log

SCRAPERS: dict[str, type["BaseScraper"]] = {}


def register(cls: type["BaseScraper"]) -> type["BaseScraper"]:
    """Class decorator: adding a source = new class with @register + a YAML entry. No core changes."""
    SCRAPERS[cls.name] = cls
    return cls


class BaseScraper(ABC):
    name: str = ""

    def __init__(self, cfg: dict, fetcher, store, metrics: Metrics, logger: logging.Logger, options: Optional[dict] = None) -> None:
        self.cfg, self.fetcher, self.store, self.metrics, self.logger = cfg, fetcher, store, metrics, logger
        self.options = options or {}
        self.sel: dict = cfg.get("selectors", {})

    # --- hooks ---------------------------------------------------------------------------
    def seed_urls(self) -> list[str]:
        return list(self.options.get("urls") or self.cfg.get("seed_urls", []))

    def next_page_url(self, html: str, url: str) -> Optional[str]:
        soup = BeautifulSoup(html, "lxml")
        a = soup.find("a", rel="next") or soup.find("a", string=lambda s: s and s.strip().lower() in ("next", "next >", "next »", "»"))
        return urljoin(url, a["href"]) if a and a.get("href") else None

    @abstractmethod
    def parse(self, html: str, url: str) -> list[RawRecord]:
        """Return RawRecords for one page. Unknown fields must stay None."""

    # --- driver --------------------------------------------------------------------------
    def run(self, limit: Optional[int] = None, since: Optional[str] = None, full: bool = False) -> list[RawRecord]:
        records: list[RawRecord] = []
        queue = self.seed_urls()
        seen: set[str] = set()
        max_pages = int(self.cfg.get("max_pages", 5))
        pages = 0
        while queue and pages < max_pages and (limit is None or len(records) < limit):
            url = queue.pop(0)
            if url in seen:
                continue
            seen.add(url)
            pages += 1
            recs, html = self._scrape_url(url, since, full)
            records.extend(recs)
            if html and (limit is None or len(records) < limit):
                nxt = self.next_page_url(html, url)
                if nxt and nxt not in seen:
                    queue.append(nxt)
        if limit is not None:
            records = records[:limit]
        return records

    def _scrape_url(self, url: str, since: Optional[str], full: bool) -> tuple[list[RawRecord], Optional[str]]:
        m, src = self.metrics, self.name
        st = self.store.url_state(url)
        if since and not full and st.get("fetched_at", "") >= since:
            m.inc(src, "pages_unchanged")
            log(self.logger, logging.INFO, "skip: fetched since cutoff", url=url, source=src)
            return [], None
        res = self.fetcher.get(url, None if full else st.get("etag"), None if full else st.get("last_modified"))
        if res.skipped_reason:
            m.inc(src, "pages_skipped_robots")
            return [], None
        if res.not_modified:
            m.inc(src, "pages_not_modified")
            return [], None
        if not res.ok:
            m.inc(src, "pages_failed")
            self.store.dead_letter(src, url, res.error or f"HTTP {res.status}")
            log(self.logger, logging.WARNING, "fetch failed", url=url, source=src, reason=res.error)
            return [], None
        m.inc(src, "pages_fetched")
        m.add_latency(src, res.latency_ms)
        ref = self.store.save_snapshot(src, url, res.content)
        digest = hashlib.sha256(res.content).hexdigest()
        if not full and st.get("sha256") == digest:
            m.inc(src, "pages_unchanged")
            return [], res.text
        try:
            recs = self.parse(res.text, url)
        except Exception as exc:  # one bad page must never crash the run
            m.inc(src, "pages_failed")
            self.store.dead_letter(src, url, f"parse error: {type(exc).__name__}: {exc}", res.content)
            log(self.logger, logging.ERROR, "parse error", url=url, source=src, error=str(exc))
            return [], res.text
        if not recs:
            m.inc(src, "pages_failed")
            self.store.dead_letter(src, url, "no records parsed (possible selector drift)", res.content)
            log(self.logger, logging.WARNING, "no records parsed", url=url, source=src)
            return [], res.text
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        for r in recs:
            r.source, r.raw_snapshot_ref, r.scraped_at = src, ref, now  # type: ignore[assignment]
        m.inc(src, "records_scraped", len(recs))
        self.store.set_url_state(url, etag=res.etag, last_modified=res.last_modified, sha256=digest, fetched_at=now)
        return recs, res.text


def first_text(node, selector: str) -> Optional[str]:
    if not selector or node is None:
        return None
    el = node.select_one(selector)
    if not el:
        return None
    t = " ".join(el.get_text(" ", strip=True).split())
    return t or None


def all_texts(node, selector: str) -> list[str]:
    if not selector or node is None:
        return []
    return [" ".join(e.get_text(" ", strip=True).split()) for e in node.select(selector) if e.get_text(strip=True)]
