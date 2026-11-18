"""Shared selector-driven listing parser used by the publisher sources (IEEE / ACM / Springer)."""
from __future__ import annotations

from urllib.parse import urljoin

from bs4 import BeautifulSoup

from extractors.jsonld import extract_events
from models import RawRecord
from normalizer.names import clean_ws, extract_acronym, extract_edition, extract_year
from scrapers.base import BaseScraper, all_texts, first_text


class ListingScraper(BaseScraper):
    """JSON-LD first, then config-driven CSS selectors. Subclasses set name + publisher_name only."""

    publisher_name: str = ""

    def parse(self, html: str, url: str) -> list[RawRecord]:
        records: list[RawRecord] = []
        for ev in extract_events(html):
            if not ev.get("name"):
                continue
            records.append(RawRecord(
                source=self.name, source_url=url, website_url=ev.get("url") or url, name=clean_ws(ev["name"]),
                acronym=extract_acronym(ev["name"]), year=extract_year(ev.get("start") or ev["name"]),
                edition=extract_edition(ev["name"]), dates_text=f"{ev.get('start') or ''} - {ev.get('end') or ''}".strip(" -") or None,
                location_text=ev.get("location_text"), venue=ev.get("venue"), is_virtual=ev.get("is_virtual"), publisher=self.publisher_name or None,
                sponsors_text=ev.get("sponsors", []), sponsor_listed_by_publisher=True, extraction_method="structured"))
        if records:
            return records
        soup = BeautifulSoup(html, "lxml")
        for item in soup.select(self.sel.get("item", "")) if self.sel.get("item") else []:
            name = first_text(item, self.sel.get("name", ""))
            if not name:
                continue
            link = item.select_one(self.sel.get("link", "a"))
            href = urljoin(url, link["href"]) if link and link.get("href") else None
            dates = first_text(item, self.sel.get("dates", ""))
            records.append(RawRecord(
                source=self.name, source_url=url, website_url=href or url, name=name, acronym=extract_acronym(name),
                year=extract_year(name) or extract_year(dates), edition=extract_edition(name), dates_text=dates,
                location_text=first_text(item, self.sel.get("location", "")),
                deadline_text=first_text(item, self.sel.get("deadline", "")),
                sponsors_text=all_texts(item, self.sel.get("sponsor", "")), publisher=self.publisher_name or None,
                sponsor_listed_by_publisher=True, extraction_method="structured"))
        return records
