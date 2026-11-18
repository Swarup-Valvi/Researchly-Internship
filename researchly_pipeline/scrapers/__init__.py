"""Auto-registers every scraper module in this package (so new sources need no core changes)."""
import importlib
import pkgutil

from scrapers.base import SCRAPERS, BaseScraper, register  # noqa: F401

for _m in pkgutil.iter_modules(__path__):
    if _m.name not in ("base", "listing"):
        importlib.import_module(f"scrapers.{_m.name}")
