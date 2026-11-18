"""Filesystem storage: gzipped raw snapshots, dead-letter queue, incremental state, atomic output."""
from __future__ import annotations

import gzip
import hashlib
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

COPYRIGHT_NOTE = ("Raw page stored for audit/provenance only. Copyright remains with the original site owner; "
                  "do not redistribute.")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.raw = self.root / "raw"
        self.failed = self.root / "failed"
        self.output = self.root / "output"
        for d in (self.raw, self.failed, self.output):
            d.mkdir(parents=True, exist_ok=True)
        self.state_path = self.root / "state.json"
        self.state: dict[str, Any] = self._load_state()

    # --- state (for incremental mode) -------------------------------------------------
    def _load_state(self) -> dict[str, Any]:
        try:
            return json.loads(self.state_path.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return {"urls": {}}

    def save_state(self) -> None:
        self._atomic_write(self.state_path, json.dumps(self.state, indent=2, sort_keys=True))

    def url_state(self, url: str) -> dict[str, Any]:
        return self.state["urls"].get(url, {})

    def set_url_state(self, url: str, **kw: Any) -> None:
        self.state["urls"].setdefault(url, {}).update(kw)

    # --- snapshots ---------------------------------------------------------------------
    def save_snapshot(self, source: str, url: str, content: bytes) -> str:
        digest = hashlib.sha256(content).hexdigest()
        rel = f"raw/{source}/{digest[:24]}.html.gz"
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            with gzip.open(path, "wb") as fh:
                fh.write(content)
            meta = {"url": url, "sha256": digest, "fetched_at": _now(), "note": COPYRIGHT_NOTE}
            path.with_suffix(".meta.json").write_text(json.dumps(meta, indent=2))
        return rel

    def read_snapshot(self, ref: str) -> bytes:
        with gzip.open(self.root / ref, "rb") as fh:
            return fh.read()

    # --- dead-letter queue -------------------------------------------------------------
    def dead_letter(self, source: str, url: str, reason: str, content: Optional[bytes] = None, extra: Optional[dict] = None) -> str:
        key = hashlib.sha256(f"{source}|{url}|{reason}".encode()).hexdigest()[:16]
        path = self.failed / f"{source}-{key}.json"
        payload = {"source": source, "url": url, "reason": reason, "failed_at": _now(), **(extra or {})}
        if content is not None:
            payload["snapshot_ref"] = self.save_snapshot(source, url, content)
        self._atomic_write(path, json.dumps(payload, indent=2))
        return str(path.relative_to(self.root))

    # --- output ------------------------------------------------------------------------
    def load_output(self, path: Path) -> list[dict]:
        try:
            data = json.loads(Path(path).read_text())
            return data if isinstance(data, list) else []
        except (FileNotFoundError, json.JSONDecodeError):
            return []

    def write_output(self, path: Path, records: list[dict]) -> None:
        records = sorted(records, key=lambda r: r["conference_id"])
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._atomic_write(Path(path), json.dumps(records, indent=2, ensure_ascii=False))

    @staticmethod
    def _atomic_write(path: Path, text: str) -> None:
        fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=path.name, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(text)
            os.replace(tmp, path)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
