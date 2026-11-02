"""Live adapter for official ICML conference website."""

from __future__ import annotations

import re
import urllib.request
from datetime import datetime
from typing import List, Optional
from bs4 import BeautifulSoup

from .base import SourceAdapter
from ..core.models import RawConferenceData


class ICMLOfficialAdapter(SourceAdapter):
    """Scrapes official ICML conference website pages."""

    def __init__(self, year: Optional[str] = None, timeout_sec: int = 10, reference_date: Optional[datetime] = None):
        if year:
            self.year = str(year)
        else:
            self.year = str((reference_date or datetime.utcnow()).year)
        self.timeout_sec = timeout_sec
        self.base_url = "https://icml.cc"
        self.dates_url = f"https://icml.cc/Conferences/{self.year}/Dates"

    @property
    def source_name(self) -> str:
        return "official_icml"

    def fetch(self) -> List[RawConferenceData]:
        headers = {
            "User-Agent": "Researchly-Bot/1.0 (+https://researchly.io; academic ingestion research)"
        }

        # 1. Fetch Main Home Page
        location = None
        start_date = None
        end_date = None
        format_type = "In-Person"
        publisher = None
        organizer = None
        official_title = None

        try:
            req = urllib.request.Request(self.base_url, headers=headers)
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                home_html = resp.read().decode("utf-8", errors="ignore")
            
            home_soup = BeautifulSoup(home_html, "html.parser")

            # Check title / headings
            # e.g., "ICML 2026 Forty-Third International Conference on Machine Learning"
            for tag in home_soup.find_all(["h1", "h2", "h3", "p", "div"]):
                text = tag.get_text(" ", strip=True)
                if "international conference on machine learning" in text.lower():
                    m = re.search(r"((?:[A-Za-z]+-)?(?:[A-Za-z]+)\s+International Conference on Machine Learning)", text, re.IGNORECASE)
                    if m:
                        official_title = m.group(1).strip()
                    break

            # Extract dates and location from the home page announcement
            # e.g. "Seoul, South Korea July 6th - 11th, 2026"
            # or "ICML 2026 dates and location confirmed: July 6–11, 2026 at the COEX Convention..."
            for tag in home_soup.find_all(["p", "div", "span"]):
                text = tag.get_text(" ", strip=True)
                if "dates and location confirmed" in text.lower() or ("coex" in text.lower() and "seoul" in text.lower()):
                    location = "COEX Convention & Exhibition Center, Seoul, South Korea"
                    if not start_date:
                        start_date, end_date = self._parse_date_range_from_text(text, self.year)
                    break
                elif "seoul" in text.lower() and ("july" in text.lower() or "june" in text.lower()) and self.year in text:
                    location = "Seoul, South Korea"
                    if not start_date:
                        start_date, end_date = self._parse_date_range_from_text(text, self.year)

            # Check publisher evidence (e.g. "ICML Proceedings at PMLR")
            if "pmlr" in home_html.lower():
                publisher = "PMLR (Proceedings of Machine Learning Research)"

            # Check organizer evidence (e.g. "IMLS", "International Machine Learning Society")
            if "imls" in home_html.lower() or "international machine learning society" in home_html.lower():
                organizer = "International Machine Learning Society (IMLS)"

        except Exception as e:
            raise ConnectionError(f"Failed to fetch ICML home page ({self.base_url}): {e}")

        # 2. Fetch Dates Page for Full Paper Submission Deadline
        submission_deadline = None
        dates_fetched_successfully = False

        try:
            req = urllib.request.Request(self.dates_url, headers=headers)
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                dates_html = resp.read().decode("utf-8", errors="ignore")
            
            dates_soup = BeautifulSoup(dates_html, "html.parser")
            for tr in dates_soup.find_all("tr"):
                row_text = tr.get_text(" | ", strip=True)
                # Look for Paper Submission Deadline
                if "Full Paper Submission Deadline" in row_text:
                    parts = row_text.split("|")
                    if len(parts) >= 2:
                        # Extract the cell with the date
                        for part in parts[1:]:
                            cleaned_part = part.strip()
                            if cleaned_part and not cleaned_part.startswith("Paper"):
                                submission_deadline = cleaned_part
                                dates_fetched_successfully = True
                                break
                    if dates_fetched_successfully:
                        break
        except Exception:
            # Dates page failed or not reachable
            dates_fetched_successfully = False

        # Only use dates_url as source_url if dates page was reachable, else base_url
        source_url = self.dates_url if dates_fetched_successfully else self.base_url

        record = RawConferenceData(
            source_name=self.source_name,
            source_url=source_url,
            raw_name="ICML",
            raw_edition_or_year=self.year,
            raw_topics=["Machine Learning", "Deep Learning", "Artificial Intelligence", "Statistical Learning"],
            raw_submission_deadline=submission_deadline,
            raw_start_date=start_date,
            raw_end_date=end_date,
            raw_location=location,
            raw_format=format_type,
            raw_publisher=publisher,
            raw_organizer=organizer,
            raw_fees=None,
            raw_official_website=self.base_url,
            extra_metadata={
                "title": official_title or f"International Conference on Machine Learning {self.year}",
                "event_type": "conference",
                "has_paper_submission": True,
                "source_type": "official_site",
                "cfp_url": self.dates_url,
            }
        )
        return [record]


    def _parse_date_range_from_text(self, text: str, conf_year: str) -> tuple:
        """Extract a start/end date from a free-text snippet like 'July 6th - 11th, 2026'.

        Returns (start_iso, end_iso) or (None, None).
        """
        from dateutil import parser as dp

        conf_year_int = None
        try:
            conf_year_int = int(conf_year)
        except (ValueError, TypeError):
            pass

        # Normalise ordinal suffixes
        clean = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", text)
        # Find patterns like "July 6 - 11, 2026" or "July 6–11"
        range_m = re.search(
            r"(January|February|March|April|May|June|July|August|September|October|November|December)"
            r"\s+(\d{1,2})\s*[–\-]\s*(\d{1,2})(?:[,\s]+(\d{4}))?",
            clean,
            re.IGNORECASE
        )
        if range_m:
            month = range_m.group(1)
            day1 = range_m.group(2)
            day2 = range_m.group(3)
            yr = range_m.group(4) or conf_year
            try:
                start_dt = dp.parse(f"{month} {day1} {yr}")
                end_dt = dp.parse(f"{month} {day2} {yr}")
                return start_dt.strftime("%Y-%m-%d"), end_dt.strftime("%Y-%m-%d")
            except Exception:
                pass
        return None, None
