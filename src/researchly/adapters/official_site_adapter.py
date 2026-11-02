"""Reusable official conference website adapter for reputable academic events."""

from __future__ import annotations

import logging
import re
import urllib.request
from datetime import datetime
from typing import List, Optional, Dict, Any
from bs4 import BeautifulSoup

from .base import SourceAdapter
from ..core.models import RawConferenceData

logger = logging.getLogger("researchly.adapters.official_site")


class OfficialSiteConfig:
    """Configuration descriptor for an official conference website."""
    def __init__(
        self,
        name: str,
        year: str,
        base_url: str,
        dates_path: Optional[str] = None,
        publisher: Optional[str] = None,
        organizer: Optional[str] = None,
        default_topics: Optional[List[str]] = None,
        event_type: str = "conference",
    ):
        self.name = name
        self.year = year
        self.base_url = base_url.rstrip("/")
        self.dates_path = dates_path
        self.publisher = publisher
        self.organizer = organizer
        self.default_topics = default_topics or []
        self.event_type = event_type


class OfficialSiteAdapter(SourceAdapter):
    """Reusable adapter for ingesting from official academic conference portals."""

    def __init__(self, configs: Optional[List[OfficialSiteConfig]] = None, timeout_sec: int = 8, reference_date: Optional[datetime] = None):
        ref_year = (reference_date or datetime.utcnow()).year
        self.configs = configs or self._default_configs(ref_year)
        self.timeout_sec = timeout_sec

    @property
    def source_name(self) -> str:
        return "official_site_adapter"

    @classmethod
    def _default_configs(cls, current_year: int = 2026) -> List[OfficialSiteConfig]:
        y_curr = str(current_year)
        y_next = str(current_year + 1)
        return [
            OfficialSiteConfig(
                name="NeurIPS",
                year=y_curr,
                base_url="https://neurips.cc",
                dates_path=f"/Conferences/{y_curr}/Dates",
                publisher="Curran Associates / NeurIPS Proceedings",
                organizer="Neural Information Processing Systems Foundation",
                default_topics=["Machine Learning", "Neural Information Processing", "Artificial Intelligence"],
                event_type="conference"
            ),
            OfficialSiteConfig(
                name="ACL",
                year=y_curr,
                base_url=f"https://{y_curr}.aclweb.org",
                dates_path="/calls/main_conference_papers/",
                publisher="Association for Computational Linguistics (ACL)",
                organizer="Association for Computational Linguistics (ACL)",
                default_topics=["Natural Language Processing", "Computational Linguistics"],
                event_type="conference"
            ),
            OfficialSiteConfig(
                name="ICLR",
                year=y_next,
                base_url="https://iclr.cc",
                dates_path=f"/Conferences/{y_next}/Dates",
                publisher="OpenReview / ICLR Proceedings",
                organizer="International Conference on Learning Representations",
                default_topics=["Deep Learning", "Representation Learning", "Machine Learning"],
                event_type="conference"
            ),
            # University research symposium
            OfficialSiteConfig(
                name="Stanford AI Salon & Symposium",
                year=y_curr,
                base_url="https://ai.stanford.edu",
                dates_path=None,
                publisher=None,
                organizer="Stanford Institute for Human-Centered Artificial Intelligence (HAI)",
                default_topics=["Artificial Intelligence", "Human-Centered AI", "Ethics in AI"],
                event_type="symposium"
            ),
            # University research workshop
            OfficialSiteConfig(
                name="MIT Vision & Learning Workshop",
                year=y_curr,
                base_url="https://cbmm.mit.edu",
                dates_path=None,
                publisher=None,
                organizer="Center for Brains, Minds and Machines (MIT/Harvard)",
                default_topics=["Cognitive Science", "Computer Vision", "Neuroscience"],
                event_type="workshop"
            )
        ]

    def fetch(self) -> List[RawConferenceData]:
        headers = {
            "User-Agent": "Researchly-Bot/1.0 (+https://researchly.io; academic conference verification)"
        }
        records: List[RawConferenceData] = []

        for conf in self.configs:
            try:
                rec = self._scrape_site(conf, headers)
                if rec:
                    records.append(rec)
            except Exception as e:
                logger.warning("Could not scrape official site '%s' (%s): %s", conf.name, conf.base_url, e)
                continue

        return records

    def _scrape_site(self, conf: OfficialSiteConfig, headers: dict) -> Optional[RawConferenceData]:
        # 1. Fetch Home Page
        try:
            req = urllib.request.Request(conf.base_url, headers=headers)
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                home_html = resp.read().decode("utf-8", errors="ignore")
        except Exception as e:
            raise ConnectionError(f"Home page fetch failed for {conf.base_url}: {e}")

        soup = BeautifulSoup(home_html, "html.parser")

        location = None
        start_date = None
        end_date = None
        title = None

        # Look for full title in headings
        for h in soup.find_all(["h1", "h2", "h3"]):
            text = h.get_text(" ", strip=True)
            if conf.name.lower() in text.lower() or "international" in text.lower() or "annual" in text.lower():
                if len(text) < 120:
                    title = text
                    break

        # Check location and optionally dates from home text.
        # Use a year-range that includes the conf year and adjacent years so pages
        # with implicit years (e.g. "Dec 6 - 12") can still be matched.
        year_tokens = {conf.year, str(int(conf.year) - 1), str(int(conf.year) + 1)} if conf.year.isdigit() else set()
        for tag in soup.find_all(["p", "div", "span", "li"]):
            text = tag.get_text(" ", strip=True)
            t_lower = text.lower()
            if any(city in t_lower for city in ["vienna", "seoul", "sydney", "paris", "san diego", "seattle", "honolulu", "california"]):
                # Match if any nearby year token appears OR if the text is short enough
                # that it's clearly an event-date snippet (no year required for short snippets)
                if any(yr in text for yr in year_tokens) or (5 < len(text) < 80):
                    if len(text) < 200:
                        location = self._clean_location(text)
                        if not start_date:
                            start_date, end_date = self._extract_home_dates(text, conf.year)
                        break

        # 2. Fetch Dates / CFP Page
        submission_deadline = None
        dates_url = f"{conf.base_url}{conf.dates_path}" if conf.dates_path else conf.base_url

        try:
            req = urllib.request.Request(dates_url, headers=headers)
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                dates_html = resp.read().decode("utf-8", errors="ignore")

            dates_soup = BeautifulSoup(dates_html, "html.parser")

            # Table-based submission deadline (e.g. NeurIPS, ICML, ICLR)
            # Prioritize specific "full paper submission deadline" over generic "submission deadline"
            deadline_candidates = []
            for tr in dates_soup.find_all("tr"):
                row_str = tr.get_text(" | ", strip=True)
                norm_row = re.sub(r"\s+", " ", row_str).lower()
                for k in ["full paper submission deadline", "paper submission deadline", "paper deadline", "submission deadline"]:
                    if k in norm_row:
                        parts = row_str.split("|")
                        if len(parts) >= 2:
                            for p in parts[1:]:
                                cleaned = p.strip()
                                if cleaned and not any(cleaned.lower().startswith(x) for x in ["paper", "submission", "deadline", "abstract"]):
                                    deadline_candidates.append((k, cleaned))
                                    break

            if deadline_candidates:
                # Sort by priority of the matched key
                priority_order = {
                    "full paper submission deadline": 1,
                    "paper submission deadline": 2,
                    "paper deadline": 3,
                    "submission deadline": 4,
                }
                deadline_candidates.sort(key=lambda c: priority_order.get(c[0], 99))
                submission_deadline = deadline_candidates[0][1]

            # Paragraph/list-based deadline (e.g. ACL)
            if not submission_deadline:
                for tag in dates_soup.find_all(["li", "p", "div"]):
                    t = tag.get_text(" ", strip=True)
                    if "submission deadline" in t.lower():
                        # Extract the deadline cleanly, stopping before subsequent headers like Conference Dates, Location, etc.
                        m = re.search(
                            r"submission deadline\s*(?:\([^)]*\))?\s*[:|-]\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,\s*\d{4}|\d{4}-\d{2}-\d{2}|[A-Za-z0-9\s,\'-]+?(?=\s*(?:conference dates|location|commitment|notification|note|tutorials|workshops|\n|$)))",
                            t,
                            re.IGNORECASE
                        )
                        if m:
                            submission_deadline = m.group(1).strip()
                            break

            # Extract main conference start/end dates from the dates-page table
            if not start_date:
                start_date, end_date = self._extract_conf_dates_from_table(dates_soup, conf.year)

        except Exception as e:
            logger.debug("Could not scrape dates page %s: %s", dates_url, e)

        return RawConferenceData(
            source_name=self.source_name,
            source_url=dates_url,
            raw_name=conf.name,
            raw_edition_or_year=conf.year,
            raw_topics=conf.default_topics,
            raw_submission_deadline=submission_deadline,
            raw_start_date=start_date,
            raw_end_date=end_date,
            raw_location=location,
            raw_format="In-Person",
            raw_publisher=conf.publisher,
            raw_organizer=conf.organizer,
            raw_fees=None,
            raw_official_website=conf.base_url,
            extra_metadata={
                "title": title or f"{conf.name} {conf.year}",
                "event_type": conf.event_type,
                "has_paper_submission": True,
                "source_type": "official_site",
                "cfp_url": dates_url,
            }
        )

    def _clean_location(self, raw_location: str) -> str:
        """Extract a clean city/country string from a noisy page snippet.

        Handles cases where a full paragraph was captured instead of just the address.
        e.g. 'The 64th Annual Meeting of the ACL San Diego, California, United States July 2–7, 2026 Photo by ...'
          => 'San Diego, California, United States'
        """
        city_patterns = [
            r"(San Diego[,\s]+California[,\s]+United States)",
            r"(Vienna[,\s]+Austria)",
            r"(Seoul[,\s]+South Korea)",
            r"(Sydney[,\s]*(?:NSW|New South Wales|Australia)?[,\s]*(?:Australia)?)",
            r"(Paris[,\s]+France)",
            r"(Seattle[,\s]+(?:WA|Washington)?(?:[,\s]+USA)?)",
            r"(Honolulu[,\s]+(?:Hawaii|HI)?(?:[,\s]+USA)?)",
            r"(California[,\s]+(?:USA)?)",
            r"(Singapore)",
            r"(Barcelona[,\s]+Spain)",
            r"(Vancouver[,\s]+(?:BC|Canada)?)",
            r"(Toronto[,\s]+(?:ON|Ontario|Canada)?)",
            r"(New Orleans[,\s]+(?:LA|Louisiana)?(?:[,\s]+USA)?)",
        ]
        for pattern in city_patterns:
            m = re.search(pattern, raw_location, re.IGNORECASE)
            if m:
                return m.group(1).strip().rstrip(",").strip()
        # Fallback: strip photo credits and trailing date annotations
        cleaned = re.sub(r"\s+Photo by\s+.*$", "", raw_location, flags=re.IGNORECASE).strip()
        cleaned = re.sub(
            r"\s+(January|February|March|April|May|June|July|August|September|October|November|December)"
            r"\s+\d+.*$",
            "",
            cleaned,
            flags=re.IGNORECASE
        ).strip()
        return cleaned[:100] if len(cleaned) > 100 else cleaned

    def _extract_conf_dates_from_table(self, dates_soup: BeautifulSoup, conf_year: str) -> tuple:
        """Extract main-conference start and end dates from the dates-page HTML table.

        Scans for rows labelled 'Main Conference' with a date cell containing a range
        such as 'April 26 - 28' or 'Dec 6th – 10th'. Returns (start_iso, end_iso) or
        (None, None) if not found.
        """
        from dateutil import parser as dp

        conf_year_int: Optional[int] = None
        try:
            conf_year_int = int(conf_year)
        except (ValueError, TypeError):
            pass

        for tr in dates_soup.find_all("tr"):
            row_str = tr.get_text(" | ", strip=True)
            if "main conference" not in row_str.lower():
                continue
            for part in row_str.split("|"):
                date_str = part.strip()
                # Skip cells that look like labels, not dates
                if not re.match(r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d)", date_str, re.IGNORECASE):
                    continue
                # Normalise ordinal suffixes: 6th -> 6
                date_clean = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", date_str)
                # Try "Month D1 – D2 [optional suffix]"
                range_m = re.match(
                    r"^([A-Za-z]+\s+\d+)\s*[–\-]\s*(\d+)(.*)?$",
                    date_clean
                )
                if range_m:
                    start_str = range_m.group(1).strip()
                    end_day = range_m.group(2).strip()
                    suffix = (range_m.group(3) or "").strip()
                    try:
                        start_dt = dp.parse(start_str, fuzzy=True)
                        if conf_year_int and start_dt.year != conf_year_int:
                            start_dt = start_dt.replace(year=conf_year_int)
                        month = start_dt.strftime("%B")
                        end_str = f"{month} {end_day}"
                        yr_in_suffix = re.search(r"\d{4}", suffix)
                        if yr_in_suffix:
                            end_str += " " + yr_in_suffix.group(0)
                        end_dt = dp.parse(end_str, fuzzy=True)
                        if conf_year_int and end_dt.year != conf_year_int:
                            end_dt = end_dt.replace(year=conf_year_int)
                        return start_dt.strftime("%Y-%m-%d"), end_dt.strftime("%Y-%m-%d")
                    except Exception:
                        pass
                else:
                    # Single date
                    try:
                        dt = dp.parse(date_clean, fuzzy=True)
                        if conf_year_int and dt.year != conf_year_int:
                            dt = dt.replace(year=conf_year_int)
                        return dt.strftime("%Y-%m-%d"), None
                    except Exception:
                        pass
        return None, None


    def _extract_home_dates(self, text: str, conf_year: str) -> tuple:
        """Extract a conference start/end date from a home-page text snippet.

        Handles short fragments like 'Dec 6 - 12' where there is no explicit year,
        by falling back to conf_year.  Returns (start_iso, end_iso) or (None, None).
        """
        from dateutil import parser as dp

        conf_year_int: Optional[int] = None
        try:
            conf_year_int = int(conf_year)
        except (ValueError, TypeError):
            pass

        clean = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", text)
        # Pattern: "Month D1 – D2 [optional year]"
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

        # Fallback: abbreviated "Dec 6 - 12" with no month spelled out
        # Try "Mon D1 – D2" (3-letter month)
        range_m2 = re.search(
            r"\b([A-Za-z]{3,9})\s+(\d{1,2})\s*[–\-]\s*(\d{1,2})\b",
            clean
        )
        if range_m2 and conf_year_int:
            month = range_m2.group(1)
            day1 = range_m2.group(2)
            day2 = range_m2.group(3)
            try:
                start_dt = dp.parse(f"{month} {day1} {conf_year_int}")
                end_dt = dp.parse(f"{month} {day2} {conf_year_int}")
                return start_dt.strftime("%Y-%m-%d"), end_dt.strftime("%Y-%m-%d")
            except Exception:
                pass

        return None, None
