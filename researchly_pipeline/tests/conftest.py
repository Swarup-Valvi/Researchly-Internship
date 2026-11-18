import logging
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
FIX = Path(__file__).resolve().parent / "fixtures"

from observability import Metrics  # noqa: E402
from store import Store  # noqa: E402


@pytest.fixture
def fx():
    return lambda name: (FIX / name).read_text()


@pytest.fixture
def env(tmp_path):
    from fetcher import FixtureFetcher
    log = logging.getLogger("test")
    return {"store": Store(tmp_path / "storage"), "metrics": Metrics(), "logger": log, "fetcher": FixtureFetcher(FIX, log)}


def make_scraper(cls, env, selectors=None, **kw):
    import yaml
    cfg = yaml.safe_load((ROOT / "config" / "sources.yaml").read_text())["sources"][cls.name]
    cfg = {**cfg, "max_pages": 5}
    return cls(cfg, env["fetcher"], env["store"], env["metrics"], env["logger"], kw.pop("options", {}), **kw)
