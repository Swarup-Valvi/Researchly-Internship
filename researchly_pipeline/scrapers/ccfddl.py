"""ccfddl: the open CCF-Deadlines dataset (github.com/ccfddl/ccf-deadlines, MIT License, (c) 2021 CCFDDL).

Structured YAML, read from ONE shallow git clone per changed commit (no per-file API calls):
    conference/<area>/<name>.yml -> list of {title, description, sub, rank:{ccf,core,thcpl}, dblp,
        confs:[{year, id, link, timeline:[{abstract_deadline?, deadline, comment?}], timezone, date, place}]}

Rules: values are copied, never guessed. 'TBD' / missing -> None. Ranks of 'N' (not ranked) produce no claim.
Record identity uses the stable blob/main URL so a new dataset commit does not create new conference ids; the
commit SHA is recorded in provenance.dataset_version and raw_snapshot_ref.
"""
from __future__ import annotations

import hashlib
import logging
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import yaml

from models import RawRecord
from observability import log
from scrapers.base import BaseScraper, register

REPO_URL = "https://github.com/ccfddl/ccf-deadlines.git"
WEB_BASE = "https://github.com/ccfddl/ccf-deadlines/blob/main/"
_DBLP_KEY = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
RANK_SYSTEMS = {"core": "CORE", "ccf": "CCF"}   # thcpl (Tsinghua list) is not used
# Bump when read_dataset starts emitting new fields: an unchanged dataset commit is then re-read once, so records
# written by an older parser get the new fields (v2: series_years).
PARSER_VERSION = 2


def _val(v) -> Optional[str]:
    """Stringify a scalar; TBD / empty / None -> None."""
    if v is None:
        return None
    s = str(v).strip()
    return None if not s or s.upper() in ("TBD", "TBA", "N/A", "NONE") else s


def _deadline_text(deadline, tz) -> Optional[str]:
    d = _val(deadline)
    if not d:
        return None
    t = _val(tz)
    # ccfddl uses 'AoE', 'UTC', 'UTC+8', 'UTC-12', 'PT'... parse_date understands AoE/UTC/UTC±N natively.
    # Ambiguous labels (e.g. 'PT' = PST or PDT) are kept in the text but parse_date will not convert them.
    return f"{d} {t}" if t else d


def tree_digest(root: Path) -> str:
    """Stable content hash of all conference YAMLs (used when the checkout is not a git repo, e.g. fixtures)."""
    h = hashlib.sha256()
    for p in sorted((root / "conference").glob("*/*.yml")):
        h.update(str(p.relative_to(root)).encode()); h.update(p.read_bytes())
    return "sha256-" + h.hexdigest()[:40]


@register
class CCFDDLScraper(BaseScraper):
    name = "ccfddl"

    def parse(self, html: str, url: str) -> list[RawRecord]:  # not page-based; see run()
        return []

    # --- dataset access ----------------------------------------------------------------------------------
    def _git(self, *args: str, cwd: Optional[Path] = None) -> str:
        return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True, timeout=300).stdout.strip()

    def remote_sha(self) -> Optional[str]:
        """One cheap request to learn the current commit without cloning."""
        try:
            out = self._git("ls-remote", self.cfg.get("repo_url", REPO_URL), "HEAD")
            return out.split()[0] if out else None
        except (subprocess.SubprocessError, OSError) as exc:
            log(self.logger, logging.WARNING, "ccfddl ls-remote failed", error=str(exc)[:200])
            return None

    def checkout(self) -> tuple[Optional[Path], Optional[str], Optional[Path]]:
        """-> (dataset_root, sha, temp_dir_to_delete). Uses options['ccfddl_path'] when given (tests / reuse)."""
        local = self.options.get("ccfddl_path")
        if local:
            root = Path(local)
            sha = None
            if (root / ".git").exists():
                try:
                    sha = self._git("rev-parse", "HEAD", cwd=root)
                except (subprocess.SubprocessError, OSError):
                    sha = None
            return root, sha or tree_digest(root), None
        tmp = Path(tempfile.mkdtemp(prefix="ccfddl-"))
        try:
            self._git("clone", "--quiet", "--depth", "1", self.cfg.get("repo_url", REPO_URL), str(tmp / "repo"))
            return tmp / "repo", self._git("rev-parse", "HEAD", cwd=tmp / "repo"), tmp
        except (subprocess.SubprocessError, OSError) as exc:
            shutil.rmtree(tmp, ignore_errors=True)
            self.metrics.inc(self.name, "pages_failed")
            self.store.dead_letter(self.name, self.cfg.get("repo_url", REPO_URL), f"git clone failed: {type(exc).__name__}")
            return None, None, None

    # --- driver ----------------------------------------------------------------------------------------------
    def run(self, limit: Optional[int] = None, since: Optional[str] = None, full: bool = False) -> list[RawRecord]:
        state = self.store.state.setdefault("ccfddl", {})
        if not self.options.get("ccfddl_path") and not full:
            sha = self.remote_sha()
            if sha and state.get("sha") == sha and state.get("parser_version") == PARSER_VERSION:
                self.metrics.inc(self.name, "pages_unchanged")
                log(self.logger, logging.INFO, "ccfddl unchanged; skipping", sha=sha)
                return []
        root, sha, tmp = self.checkout()
        if root is None:
            return []
        try:
            if not full and state.get("sha") == sha and state.get("parser_version") == PARSER_VERSION:
                self.metrics.inc(self.name, "pages_unchanged")
                log(self.logger, logging.INFO, "ccfddl unchanged; skipping", sha=sha)
                return []
            records = self.read_dataset(root, sha, limit)
            state.update(sha=sha, parser_version=PARSER_VERSION, processed_at=datetime.now(timezone.utc).isoformat(timespec="seconds"), records=len(records))
            return records
        finally:
            if tmp:
                shutil.rmtree(tmp, ignore_errors=True)

    def read_dataset(self, root: Path, sha: str, limit: Optional[int] = None) -> list[RawRecord]:
        min_year = int(self.options.get("min_year") or datetime.now(timezone.utc).year - 1)
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        out: list[RawRecord] = []
        for path in sorted((root / "conference").glob("*/*.yml")):
            rel = path.relative_to(root).as_posix()
            try:
                entries = yaml.safe_load(path.read_text(encoding="utf-8")) or []
            except (yaml.YAMLError, UnicodeDecodeError) as exc:
                self.metrics.inc(self.name, "pages_failed")
                self.store.dead_letter(self.name, WEB_BASE + rel, f"yaml error: {type(exc).__name__}")
                continue
            self.metrics.inc(self.name, "pages_fetched")
            for e in entries if isinstance(entries, list) else []:
                for rec in self.records_for(e, rel, sha, now, min_year):
                    out.append(rec)
                    if limit is not None and len(out) >= limit:
                        self.metrics.inc(self.name, "records_scraped", len(out))
                        return out
        self.metrics.inc(self.name, "records_scraped", len(out))
        return out

    @staticmethod
    def series_key(c) -> Optional[tuple[str, str]]:
        """(ccfddl file URL, normalised acronym) for a Conference, or None if it did not come from ccfddl."""
        url = next((u for u in c.provenance.source_urls if u.startswith(WEB_BASE)), None)
        acr = re.sub(r"[^a-z0-9]", "", (c.acronym or "").lower())
        return (url, acr) if url and acr else None

    @staticmethod
    def fill_series_years(confs) -> int:
        """Series matching across records: every record of the same ccfddl series gets the union of the series
        years recorded on any of its records plus the records' own years. Fixes records written before
        series_years existed (e.g. DAC 2027 had none although DAC 2025-2027 are all in the data).
        Returns the number of records whose series_years changed."""
        groups: dict = {}
        for c in confs:
            k = CCFDDLScraper.series_key(c)
            if k:
                groups.setdefault(k, set()).update(c.series_years, [c.year])
        changed = 0
        for c in confs:
            k = CCFDDLScraper.series_key(c)
            if k and sorted(groups[k]) != c.series_years:
                c.series_years = sorted(groups[k])
                changed += 1
        return changed

    @staticmethod
    def records_for(e: dict, rel: str, sha: str, now: str, min_year: int) -> list[RawRecord]:
        if not isinstance(e, dict):
            return []
        url = WEB_BASE + rel
        ranks = []
        for key, system in RANK_SYSTEMS.items():
            v = _val((e.get("rank") or {}).get(key)) if isinstance(e.get("rank"), dict) else None
            if v and v.upper() != "N":
                ranks.append({"system": system, "value": v, "source_url": url})
        dblp = _val(e.get("dblp"))
        # Every year this series appears in the dataset (including years < min_year): evidence for the history
        # check. It is a lower bound on the series' age (the dataset only goes back so far), never a guess.
        series_years = sorted({c["year"] for c in e.get("confs") or [] if isinstance(c, dict) and isinstance(c.get("year"), int)})
        out = []
        for c in e.get("confs") or []:
            if not isinstance(c, dict) or not isinstance(c.get("year"), int) or c["year"] < min_year:
                continue
            tl = [t for t in (c.get("timeline") or []) if isinstance(t, dict)]
            tz = c.get("timezone")
            link = _val(c.get("link"))
            out.append(RawRecord(
                source="ccfddl", source_url=url,
                website_url=link if link and re.match(r"^https?://", link) else None,
                name=_val(e.get("description")) or _val(e.get("title")),
                acronym=_val(e.get("title")),
                year=c["year"],
                dates_text=_val(c.get("date")),
                location_text=_val(c.get("place")),
                deadline_text=_deadline_text(tl[0].get("deadline"), tz) if tl else None,
                tracks=[{"name": _val(t.get("comment")), "deadline_text": _deadline_text(t.get("deadline"), tz)}
                        for t in tl[1:] if _val(t.get("comment"))],
                ranking=ranks,
                dblp_key=dblp if dblp and _DBLP_KEY.match(dblp) else None,
                dataset_version=f"ccfddl@{sha}",
                series_years=series_years,
                extraction_method="structured",
                raw_snapshot_ref=f"ccfddl@{sha}:{rel}",
                scraped_at=now,
            ))
        return out
