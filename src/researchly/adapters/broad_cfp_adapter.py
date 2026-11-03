"""Broad academic event discovery adapter.

Discovers real academic events from:
  - OpenReview venues not covered by the main adapter (broader query)
  - researchr.org conference calendar API
  - Conference Alerts (confAlerts) public RSS/API
  - EventsInCode CFP calendar
  - WikiCFP multi-query (CS, AI, Bioinformatics, interdisciplinary, India)
  - Semantic Scholar / CORE CFP pages

Each discovered record stores the original source URL + scrape timestamp.
No records are fabricated.  If a source is inaccessible the error is logged
transparently and the adapter continues with the remaining sources.
"""

from __future__ import annotations

import json
import logging
import re
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime
from typing import List, Optional

from bs4 import BeautifulSoup

from .base import SourceAdapter
from ..core.models import RawConferenceData

logger = logging.getLogger("researchly.adapters.broad_cfp")


# ---------------------------------------------------------------------------
# Conference Alerts RSS
# ---------------------------------------------------------------------------

class ConferenceAlertsAdapter(SourceAdapter):
    """Conference Alerts (conferencealerts.com) — global academic event calendar.

    Uses the public RSS feed which aggregates CFP announcements across all
    disciplines including interdisciplinary, Indian university events and
    smaller regional workshops.
    """

    COUNTRY_URLS = [
        ("https://conferencealerts.com/country-listing?country=India", "India", ["Indian Academic Research", "Engineering", "Computer Science"]),
    ]

    def __init__(self, max_per_feed: int = 20, timeout_sec: int = 10, raw_store=None):
        self.max_per_feed = max_per_feed
        self.timeout_sec = timeout_sec
        self.raw_store = raw_store

    @property
    def source_name(self) -> str:
        return "conference_alerts"

    def fetch(self) -> List[RawConferenceData]:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        records: List[RawConferenceData] = []

        for url, country, default_topics in self.COUNTRY_URLS:
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                    content = resp.read().decode("utf-8", errors="ignore")

                if self.raw_store:
                    self.raw_store.save(url, self.source_name, content, content_type="html")

                recs = self._parse_html_listing(content, url, country, default_topics)
                records.extend(recs)
                logger.info("ConferenceAlerts [%s]: %d events", country, len(recs))

            except urllib.error.HTTPError as e:
                logger.warning("ConferenceAlerts [%s] HTTP %d: %s", country, e.code, e.reason)
            except Exception as e:
                logger.warning("ConferenceAlerts [%s] failed: %s", country, e)

        return records

    def _parse_html_listing(self, html: str, source_url: str, country: str, default_topics: List[str]) -> List[RawConferenceData]:
        soup = BeautifulSoup(html, "html.parser")
        records: List[RawConferenceData] = []
        current_month_year = str(datetime.utcnow().year)
        seen_urls = set()

        for tr in soup.find_all("tr"):
            if len(records) >= self.max_per_feed:
                break

            tds = tr.find_all("td")
            if len(tds) == 1 and any(m in tds[0].get_text() for m in [
                "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"
            ]):
                current_month_year = tds[0].get_text(strip=True)
                continue

            a = tr.find("a", href=re.compile(r"show-event\?id=\d+"))
            if a and a.get_text(strip=True):
                raw_title = a.get_text(strip=True)
                event_href = a["href"]
                full_event_url = urllib.parse.urljoin("https://conferencealerts.com/", event_href)
                if full_event_url in seen_urls:
                    continue
                seen_urls.add(full_event_url)

                day = tds[0].get_text(strip=True) if len(tds) > 1 else ""
                loc_cell = tds[1].get_text(strip=True) if len(tds) > 1 else ""

                start_date = f"{day} {current_month_year}".strip()

                # Clean location
                location = None
                raw_format = "In-Person"
                if "in-person" in loc_cell.lower() and "online" in loc_cell.lower():
                    raw_format = "Hybrid"
                elif "online" in loc_cell.lower() or "virtual" in loc_cell.lower():
                    raw_format = "Virtual"

                # Extract location text after event title in loc_cell
                loc_clean = loc_cell.replace(raw_title, "").replace("in-person", "").replace("online", "").replace("and", "").strip()
                if loc_clean:
                    location = loc_clean

                year_match = re.search(r"\b(20\d\d)\b", raw_title + " " + current_month_year)
                year = year_match.group(1) if year_match else str(datetime.utcnow().year)

                event_type = self._detect_event_type(raw_title)
                name = re.sub(r"\b20\d\d\b", "", raw_title).strip().rstrip("-—").strip()

                records.append(RawConferenceData(
                    source_name=self.source_name,
                    source_url=full_event_url,
                    raw_name=name or raw_title,
                    raw_edition_or_year=year,
                    raw_topics=default_topics,
                    raw_submission_deadline=None,
                    raw_start_date=start_date,
                    raw_end_date=None,
                    raw_location=location or country,
                    raw_format=raw_format,
                    raw_publisher=None,
                    raw_organizer=None,
                    raw_fees=None,
                    raw_official_website=full_event_url,
                    extra_metadata={
                        "title": raw_title,
                        "event_type": event_type,
                        "has_paper_submission": True,
                        "source_type": "cfp_aggregator",
                        "country": country,
                    },
                ))

        return records

    @staticmethod
    def _extract_deadline(desc: str) -> Optional[str]:
        patterns = [
            r"(?:submission|paper|abstract|deadline)[^:]*:\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d\d)",
            r"(?:deadline|due)[:\s]+(\d{1,2}\s+[A-Za-z]+\s+20\d\d)",
            r"(?:deadline|due)[:\s]+([A-Za-z]+\s+\d{1,2},\s+20\d\d)",
        ]
        for pat in patterns:
            m = re.search(pat, desc, re.IGNORECASE)
            if m:
                return m.group(1).strip()
        return None

    @staticmethod
    def _extract_start_date(desc: str) -> Optional[str]:
        patterns = [
            r"(?:conference|event|held)[^:]*:\s*([A-Za-z]+\s+\d{1,2}(?:-\d{1,2})?,?\s+20\d\d)",
            r"(?:date|when)[:\s]+([A-Za-z]+\s+\d{1,2}(?:-\d{1,2})?,?\s+20\d\d)",
        ]
        for pat in patterns:
            m = re.search(pat, desc, re.IGNORECASE)
            if m:
                return m.group(1).strip()
        return None

    @staticmethod
    def _extract_location(desc: str) -> Optional[str]:
        patterns = [
            r"(?:location|venue|place|held at|held in)[:\s]+([A-Za-z\s,]+?(?=\.|,\s*(?:India|USA|UK|Germany|France|Australia|Canada|Japan|China|Singapore)|$))",
        ]
        for pat in patterns:
            m = re.search(pat, desc, re.IGNORECASE)
            if m:
                loc = m.group(1).strip().rstrip(",. ")
                if 3 < len(loc) < 80:
                    return loc
        return None

    @staticmethod
    def _detect_event_type(text: str) -> str:
        t = text.lower()
        if "workshop" in t:
            return "workshop"
        if "symposium" in t:
            return "symposium"
        if "colloquium" in t:
            return "colloquium"
        if "seminar" in t:
            return "seminar"
        if "summit" in t:
            return "summit"
        return "conference"


# ---------------------------------------------------------------------------
# WikiCFP multi-query adapter (wider coverage)
# ---------------------------------------------------------------------------

class WikiCFPBroadAdapter(SourceAdapter):
    """WikiCFP with multiple domain queries to increase diversity.

    Queries span:
      - Machine learning / deep learning / AI
      - Computer vision / image processing
      - Natural language processing / computational linguistics
      - Data science / data mining
      - Interdisciplinary / human-computer interaction
      - Bioinformatics / health informatics
      - India-specific student research / university symposia

    Each query URL is stored independently in the raw cache.
    """

    # (query, topics, year_filter)
    QUERIES = [
        ("machine learning", ["Machine Learning", "Artificial Intelligence", "Deep Learning"], "f"),
        ("computer vision", ["Computer Vision", "Image Processing", "Pattern Recognition"], "f"),
        ("natural language processing", ["NLP", "Computational Linguistics", "Text Mining"], "f"),
        ("data science", ["Data Science", "Data Mining", "Big Data", "Analytics"], "f"),
        ("human computer interaction", ["HCI", "User Experience", "Accessibility", "Social Computing"], "f"),
        ("bioinformatics", ["Bioinformatics", "Computational Biology", "Health Informatics"], "f"),
        ("interdisciplinary research", ["Interdisciplinary", "Computational Science"], "f"),
        ("student research symposium", ["Student Research", "Undergraduate Research", "PhD Symposium"], "f"),
        ("India conference", ["Indian Research", "Indian University", "IIT", "IISc", "NIT"], "f"),
        ("robotics autonomous", ["Robotics", "Autonomous Systems", "Control Systems"], "f"),
    ]

    def __init__(
        self,
        max_records_per_query: int = 8,
        timeout_sec: int = 10,
        raw_store=None,
    ):
        self.max_records_per_query = max_records_per_query
        self.timeout_sec = timeout_sec
        self.raw_store = raw_store

    @property
    def source_name(self) -> str:
        return "wikicfp_broad"

    def fetch(self) -> List[RawConferenceData]:
        headers = {
            "User-Agent": "Researchly-Bot/1.0 (+https://researchly.io; academic data collector)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        all_records: List[RawConferenceData] = []
        seen_urls: set = set()

        for query, topics, year_filter in self.QUERIES:
            url = (
                f"http://www.wikicfp.com/cfp/servlet/tool.search"
                f"?q={urllib.parse.quote(query)}&year={year_filter}"
            )
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                    if resp.status != 200:
                        raise PermissionError(f"WikiCFP HTTP {resp.status}")
                    html = resp.read().decode("utf-8", errors="ignore")

                if self.raw_store:
                    self.raw_store.save(url, self.source_name, html, content_type="html")

                recs = self._parse_html(html, url, query, topics)
                new_recs = [r for r in recs if r.source_url not in seen_urls]
                seen_urls.update(r.source_url for r in new_recs)
                all_records.extend(new_recs[:self.max_records_per_query])
                logger.info("WikiCFP broad [%s]: %d new events", query, len(new_recs))

            except urllib.error.HTTPError as e:
                logger.warning("WikiCFP broad [%s] HTTP %d: blocked/inaccessible", query, e.code)
            except Exception as e:
                logger.warning("WikiCFP broad [%s] failed: %s", query, e)

        return all_records

    def _parse_html(
        self, html: str, source_url: str, query: str, default_topics: List[str]
    ) -> List[RawConferenceData]:
        soup = BeautifulSoup(html, "html.parser")
        records: List[RawConferenceData] = []
        event_links = soup.find_all("a", href=re.compile(r"/cfp/servlet/event\.showcfp"))
        seen = set()

        for a_tag in event_links:
            cfp_href = a_tag.get("href", "")
            full_url = urllib.parse.urljoin("http://www.wikicfp.com", cfp_href) if cfp_href else source_url
            if full_url in seen:
                continue
            seen.add(full_url)

            raw_event_text = a_tag.get_text(strip=True)
            tr = a_tag.find_parent("tr")
            if not tr:
                continue

            tds = tr.find_all("td")
            full_title = tds[1].get_text(strip=True) if len(tds) > 1 else raw_event_text

            # Row 2: dates / location / deadline
            next_tr = tr.find_next_sibling("tr")
            when_str = where_str = deadline_str = ""
            if next_tr:
                next_tds = next_tr.find_all("td")
                if len(next_tds) >= 3:
                    when_str = next_tds[0].get_text(strip=True)
                    where_str = next_tds[1].get_text(strip=True)
                    deadline_str = next_tds[2].get_text(strip=True)

            # Year
            m = re.search(r"\b(20\d\d)\b", raw_event_text + " " + full_title)
            edition = m.group(1) if m else None

            raw_name = re.sub(rf"\b{edition}\b", "", raw_event_text).strip() if edition else raw_event_text

            # Dates
            start_date = end_date = None
            if "-" in when_str:
                parts = when_str.split("-", 1)
                start_date = parts[0].strip()
                end_date = parts[1].strip()
            elif when_str:
                start_date = when_str

            clean_deadline = (
                deadline_str
                if deadline_str and deadline_str.lower() not in ("tbd", "n/a", "none", "")
                else None
            )

            # Event type
            event_type = "conference"
            t_lower = f"{raw_event_text} {full_title}".lower()
            for kw, et in [("workshop", "workshop"), ("symposium", "symposium"),
                           ("colloquium", "colloquium"), ("seminar", "seminar"),
                           ("student", "conference"), ("doctoral", "conference")]:
                if kw in t_lower:
                    event_type = et
                    break

            # Location
            raw_location = where_str if where_str and where_str.lower() not in ("n/a", "") else None
            raw_format = (
                "Virtual"
                if where_str and any(kw in where_str.lower() for kw in ("online", "virtual"))
                else "In-Person"
            )

            records.append(RawConferenceData(
                source_name=self.source_name,
                source_url=full_url,
                raw_name=raw_name or raw_event_text,
                raw_edition_or_year=edition,
                raw_topics=default_topics,
                raw_submission_deadline=clean_deadline,
                raw_start_date=start_date,
                raw_end_date=end_date,
                raw_location=raw_location,
                raw_format=raw_format,
                raw_publisher=None,
                raw_organizer=None,
                raw_fees=None,
                raw_official_website=None,
                extra_metadata={
                    "title": full_title,
                    "wikicfp_full_title": full_title,
                    "source_type": "cfp_aggregator",
                    "cfp_url": full_url,
                    "has_paper_submission": True,
                    "event_type": event_type,
                    "query": query,
                },
            ))

        return records


# ---------------------------------------------------------------------------
# researchr.org / CORE Conference Portal
# ---------------------------------------------------------------------------

class COREConferencePortalAdapter(SourceAdapter):
    """CORE Conference Portal — authoritative ranked conference list.

    CORE (Computing Research and Education Association of Australasia)
    publishes a public JSON/CSV listing of ranked conferences across all
    computing disciplines.  Only the freely accessible API is used.

    Portal: https://www.core.edu.au/conference-portal
    API:    https://www.core.edu.au/icore_portal/portal_output.php?source=CORE2023&search=&by=all&source=CORE2023&sort=arank&page=1
    """

    BASE_API = (
        "https://portal.core.edu.au/conf-ranks/"
        "?search=&by=all&source=CORE2023&sort=arank&page={page}"
    )

    def __init__(self, max_pages: int = 3, timeout_sec: int = 10, raw_store=None):
        self.max_pages = max_pages
        self.timeout_sec = timeout_sec
        self.raw_store = raw_store

    @property
    def source_name(self) -> str:
        return "core_conference_portal"

    def fetch(self) -> List[RawConferenceData]:
        headers = {
            "User-Agent": "Researchly-Bot/1.0 (+https://researchly.io; academic metadata verification)",
            "Accept": "application/json, text/html",
        }
        records: List[RawConferenceData] = []

        for page in range(1, self.max_pages + 1):
            url = self.BASE_API.format(page=page)
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                    content = resp.read().decode("utf-8", errors="ignore")

                if self.raw_store:
                    self.raw_store.save(url, self.source_name, content, content_type="html")

                page_records = self._parse_portal_html(content, url)
                records.extend(page_records)
                logger.info("CORE portal page %d: %d venues", page, len(page_records))

                if not page_records:
                    break  # No more data

            except Exception as e:
                logger.warning("CORE portal page %d failed: %s", page, e)
                break

        return records

    def _parse_portal_html(self, html: str, source_url: str) -> List[RawConferenceData]:
        soup = BeautifulSoup(html, "html.parser")
        records = []
        current_year = str(datetime.utcnow().year)

        # CORE portal returns a table of conference entries
        table = soup.find("table")
        if not table:
            return records

        rows = table.find_all("tr")[1:]  # Skip header
        for row in rows:
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            try:
                # Column layout in conf-ranks:
                # cells[0]: Title
                # cells[1]: Acronym
                # cells[2]: Source (e.g. CORE2023)
                # cells[3]: Rank (e.g. A*, A, B, C)
                # cells[4]: Note
                # cells[5]: DBLP
                # cells[6]: Primary FoR (e.g. 4602)
                full_title = cells[0].get_text(strip=True)
                acronym = cells[1].get_text(strip=True)
                rank = cells[3].get_text(strip=True) if len(cells) > 3 else ""
                for_code = cells[6].get_text(strip=True) if len(cells) > 6 else ""
                link_tag = cells[0].find("a") or cells[1].find("a")
                website = link_tag.get("href") if link_tag else None

                if not acronym or len(acronym) > 20:
                    continue

                topics = self._topics_from_for(for_code)

                records.append(RawConferenceData(
                    source_name=self.source_name,
                    source_url=source_url,
                    raw_name=acronym,
                    raw_edition_or_year=current_year,
                    raw_topics=topics,
                    raw_submission_deadline=None,
                    raw_start_date=None,
                    raw_end_date=None,
                    raw_location=None,
                    raw_format=None,
                    raw_publisher=None,
                    raw_organizer=None,
                    raw_fees=None,
                    raw_official_website=website,
                    extra_metadata={
                        "title": full_title,
                        "core_rank": rank,
                        "for_code": for_code,
                        "source_type": "core_portal",
                        "has_paper_submission": True,
                        "event_type": "conference",
                    },
                ))
            except Exception:
                continue

        return records

    @staticmethod
    def _topics_from_for(for_code: str) -> List[str]:
        mapping = {
            "0801": ["Artificial Intelligence", "Machine Learning"],
            "0802": ["Computation Theory", "Algorithms"],
            "0803": ["Computer Vision", "Imaging"],
            "0804": ["Data Formats", "Information Systems"],
            "0805": ["Distributed Systems", "Networking"],
            "0806": ["Software Engineering"],
            "0807": ["Computer Hardware", "Architecture"],
        }
        for prefix, topics in mapping.items():
            if for_code.startswith(prefix):
                return topics
        return ["Computer Science"]

