"""WikiCFP source adapter with robust parsing and transparent access error reporting."""

from __future__ import annotations

import logging
import re
import urllib.request
import urllib.error
import urllib.parse
from typing import List, Optional
from bs4 import BeautifulSoup

from .base import SourceAdapter
from ..core.models import RawConferenceData

logger = logging.getLogger("researchly.adapters.wikicfp")


class WikiCFPAdapter(SourceAdapter):
    """Adapter for WikiCFP conference and call-for-papers listings.
    
    Extracts conference event title, dates, location, deadline, topics, and showcfp link.
    Respects network timeouts and anti-bot rules without circumventing protections.
    """

    def __init__(self, query: str = "machine learning", max_records: int = 10, timeout_sec: int = 8, year_filter: str = "f"):
        self.query = query
        self.max_records = max_records
        self.timeout_sec = timeout_sec
        self.year_filter = year_filter  # 'f' for future/upcoming, 'a' for all
        self.base_url = f"http://www.wikicfp.com/cfp/servlet/tool.search?q={urllib.parse.quote(query)}&year={year_filter}"

    @property
    def source_name(self) -> str:
        return "wikicfp"

    def fetch(self) -> List[RawConferenceData]:
        headers = {
            "User-Agent": "Researchly-Bot/1.0 (+https://researchly.io; academic data collector)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }

        html_content = ""
        try:
            req = urllib.request.Request(self.base_url, headers=headers)
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                if resp.status != 200:
                    raise PermissionError(f"WikiCFP returned HTTP {resp.status}")
                html_content = resp.read().decode("utf-8", errors="ignore")
        except urllib.error.HTTPError as e:
            raise PermissionError(f"WikiCFP access restricted: HTTP {e.code} ({e.reason})")
        except Exception as e:
            raise ConnectionError(f"WikiCFP source inaccessible or timed out: {e}")

        return self.parse_html(html_content, self.base_url)

    def parse_html(self, html_content: str, source_url: str) -> List[RawConferenceData]:
        """Parses WikiCFP search results HTML table."""
        soup = BeautifulSoup(html_content, "html.parser")
        records: List[RawConferenceData] = []

        # Find all showcfp links in the search result
        event_links = soup.find_all("a", href=re.compile(r"/cfp/servlet/event\.showcfp"))
        
        seen_urls = set()
        for a_tag in event_links:
            if len(records) >= self.max_records:
                break
            cfp_href = a_tag.get("href", "")
            full_cfp_url = urllib.parse.urljoin("http://www.wikicfp.com", cfp_href) if cfp_href else source_url
            if full_cfp_url in seen_urls:
                continue
            seen_urls.add(full_cfp_url)

            raw_event_text = a_tag.get_text(strip=True)
            tr = a_tag.find_parent("tr")
            if not tr:
                continue

            tds = tr.find_all("td")
            # Usually row 1: [Short Name / Link, Full Title]
            full_title = tds[1].get_text(strip=True) if len(tds) > 1 else raw_event_text
            
            # Row 2 (next sibling): [When (Dates), Where (Location), Deadline]
            next_tr = tr.find_next_sibling("tr")
            when_str = ""
            where_str = ""
            deadline_str = ""
            if next_tr:
                next_tds = next_tr.find_all("td")
                if len(next_tds) >= 3:
                    when_str = next_tds[0].get_text(strip=True)
                    where_str = next_tds[1].get_text(strip=True)
                    deadline_str = next_tds[2].get_text(strip=True)

            # Row 3 (optional): Topics/Categories
            topics = [self.query] if self.query else []
            if next_tr:
                tr_topics = next_tr.find_next_sibling("tr")
                if tr_topics:
                    topic_tds = tr_topics.find_all("td")
                    if len(topic_tds) == 1 and topic_tds[0].get("colspan"):
                        topic_text = topic_tds[0].get_text(strip=True)
                        extracted_topics = [t.strip() for t in topic_text.split(",") if t.strip()]
                        if extracted_topics:
                            topics = extracted_topics

            # Parse event acronym/name and edition/year
            m = re.search(r"\b(20\d\d)\b", raw_event_text)
            edition = m.group(1) if m else None
            if not edition and full_title:
                m_title = re.search(r"\b(20\d\d)\b", full_title)
                if m_title:
                    edition = m_title.group(1)

            raw_name = raw_event_text
            if edition:
                # Retain clean base name
                raw_name = re.sub(rf"\b{edition}\b", "", raw_name).strip()

            # Dates split
            start_date = None
            end_date = None
            if "-" in when_str:
                dparts = when_str.split("-")
                start_date = dparts[0].strip()
                end_date = dparts[1].strip()
            elif when_str:
                start_date = when_str

            # Clean deadline
            clean_deadline = None
            if deadline_str and deadline_str.lower() not in ("tbd", "n/a", "none"):
                clean_deadline = deadline_str

            # Detect event type from event title or acronym
            event_type = "conference"
            t_lower = f"{raw_event_text} {full_title}".lower()
            if "workshop" in t_lower:
                event_type = "workshop"
            elif "symposium" in t_lower:
                event_type = "symposium"
            elif "colloquium" in t_lower:
                event_type = "colloquium"
            elif "seminar" in t_lower:
                event_type = "seminar"

            records.append(RawConferenceData(
                source_name=self.source_name,
                source_url=full_cfp_url,
                raw_name=raw_name or raw_event_text,
                raw_edition_or_year=edition,
                raw_topics=topics,
                raw_submission_deadline=clean_deadline,
                raw_start_date=start_date,
                raw_end_date=end_date,
                raw_location=where_str if where_str and where_str != "N/A" else None,
                raw_format="Virtual" if "online" in where_str.lower() or "virtual" in where_str.lower() else "In-Person",
                raw_publisher=None,
                raw_organizer=None,
                raw_fees=None,
                raw_official_website=None,
                extra_metadata={
                    "title": full_title,
                    "wikicfp_full_title": full_title,
                    "source_type": "cfp_aggregator",
                    "cfp_url": full_cfp_url,
                    "has_paper_submission": True,
                    "event_type": event_type,
                }
            ))

        return records
