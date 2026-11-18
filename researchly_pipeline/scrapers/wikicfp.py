"""WikiCFP: community wiki, semi-structured two-row tables. LOWEST trust source.

Only CFP metadata is read. It is never used as authority for sponsorship or indexing claims, so those
fields are intentionally left empty here.
"""
from __future__ import annotations

from typing import Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from models import RawRecord
from normalizer.names import clean_ws, extract_acronym, extract_edition, extract_year
from scrapers.base import BaseScraper, register


@register
class WikiCFPScraper(BaseScraper):
    name = "wikicfp"

    def parse(self, html: str, url: str) -> list[RawRecord]:
        soup = BeautifulSoup(html, "lxml")
        out: list[RawRecord] = []
        header_sel = self.sel.get("row_header", "tr[bgcolor] td[rowspan='2']")
        link_sel = self.sel.get("event_link", "a[href*='eventid=']")
        for first_cell in soup.select(header_sel):
            link = first_cell.select_one(link_sel)
            row1 = first_cell.find_parent("tr")
            row2 = row1.find_next_sibling("tr") if row1 else None
            if not link or not row1 or not row2:
                continue
            cells1 = row1.find_all("td")
            cells2 = [c.get_text(" ", strip=True) for c in row2.find_all("td")]
            title = clean_ws(link.get_text(" ", strip=True))
            full_name = clean_ws(cells1[1].get_text(" ", strip=True)) if len(cells1) > 1 else None
            href = urljoin(url, link["href"])
            name = full_name or title
            out.append(RawRecord(
                source="wikicfp", source_url=url, website_url=href, name=name,
                acronym=extract_acronym(title), year=extract_year(title) or extract_year(cells2[0] if cells2 else None),
                edition=extract_edition(name), dates_text=cells2[0] if len(cells2) > 0 else None,
                location_text=cells2[1] if len(cells2) > 1 else None,
                deadline_text=cells2[2] if len(cells2) > 2 else None, extraction_method="structured"))
        if self.options.get("details"):
            self._enrich(out)
        return out

    def _enrich(self, records: list[RawRecord]) -> None:
        """Optional: fetch each event page to get the external site link + categories (extra requests)."""
        for r in records:
            res = self.fetcher.get(r.website_url)
            if not res.ok or not res.text:
                continue
            ref = self.store.save_snapshot("wikicfp", r.website_url, res.content)
            detail = self.parse_detail(res.text, r.website_url)
            if detail.get("link"):
                r.extra_source_urls.append(r.website_url)  # keep the WikiCFP event page as provenance
                r.website_url = detail["link"]
            if detail.get("categories"):
                r.topics = detail["categories"]
            r.raw_snapshot_ref = ref

    @staticmethod
    def parse_detail(html: str, url: str) -> dict:
        soup = BeautifulSoup(html, "lxml")
        link = None
        for td in soup.find_all(["th", "td"]):
            if td.get_text(strip=True).lower().rstrip(":") == "link":
                a = td.find_next("a", href=True)
                if a and a["href"].startswith("http"):
                    link = a["href"]
                break
        cats = [a.get_text(strip=True) for a in soup.select("a[href*='conference=']") if a.get_text(strip=True)]
        return {"link": link, "categories": cats}

    def next_page_url(self, html: str, url: str) -> Optional[str]:
        return super().next_page_url(html, url)
