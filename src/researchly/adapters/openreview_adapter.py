"""OpenReview public API adapter for discovering conferences and venues."""

from __future__ import annotations

import json
import logging
import re
import urllib.request
import urllib.error
import urllib.parse
from typing import List, Optional
from datetime import datetime

from .base import SourceAdapter
from ..core.models import RawConferenceData

logger = logging.getLogger("researchly.adapters.openreview")


class OpenReviewAdapter(SourceAdapter):
    """Discovers peer-reviewed venues and conferences from OpenReview's public API."""

    def __init__(self, target_years: Optional[List[str]] = None, max_venues: int = 25, timeout_sec: int = 8, reference_date: Optional[datetime] = None):
        if target_years:
            self.target_years = [str(y) for y in target_years]
        else:
            ref_year = (reference_date or datetime.utcnow()).year
            # Dynamically discover current year and next 2 upcoming years
            self.target_years = [str(ref_year + i) for i in range(0, 3)]
        self.max_venues = max_venues
        self.timeout_sec = timeout_sec
        self.base_api = "https://api2.openreview.net"

    @property
    def source_name(self) -> str:
        return "openreview_api"

    def fetch(self) -> List[RawConferenceData]:
        headers = {
            "User-Agent": "Researchly-Bot/1.0 (+https://researchly.io; academic conference discovery)"
        }
        
        # 1. Fetch venue group member list
        venues_url = f"{self.base_api}/groups?id=venues"
        try:
            req = urllib.request.Request(venues_url, headers=headers)
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            raise ConnectionError(f"Failed to access OpenReview API at {venues_url}: {e}")

        groups = data.get("groups", [])
        if not groups:
            return []

        all_members = groups[0].get("members", [])
        
        # Filter for academic venues in our target years (conferences, workshops, symposiums, colloquiums, student research)
        valid_event_types = ("conference", "workshop", "symposium", "colloquium", "track", "student", "doctoral", "consortium", "colloq")
        matched_venues = []
        for m in all_members:
            m_lower = m.lower()
            if any(y in m for y in self.target_years) and any(et in m_lower for et in valid_event_types):
                matched_venues.append(m)

        # Ensure representation across diverse categories: workshops, symposia, student/doctoral, university events
        categorized = {"workshop": [], "symposium": [], "student": [], "colloquium": [], "university": [], "conference": []}
        for v in matched_venues:
            v_low = v.lower()
            if any(t in v_low for t in ["student", "doctoral", "consortium"]):
                categorized["student"].append(v)
            elif "symposium" in v_low:
                categorized["symposium"].append(v)
            elif any(c in v_low for c in ["colloquium", "colloq"]):
                categorized["colloquium"].append(v)
            elif "workshop" in v_low:
                categorized["workshop"].append(v)
            elif any(d in v_low for d in [".edu", ".ac.", "uni-", "university"]):
                categorized["university"].append(v)
            else:
                categorized["conference"].append(v)

        selected_venues = []
        # Round-robin selection across categories to prevent monoculture
        cats = ["conference", "workshop", "symposium", "student", "colloquium", "university"]
        idx = 0
        while len(selected_venues) < self.max_venues and any(categorized[c] for c in cats):
            cat = cats[idx % len(cats)]
            if categorized[cat]:
                item = categorized[cat].pop(0)
                if item not in selected_venues:
                    selected_venues.append(item)
            idx += 1

        logger.info("Selected %d diverse venues on OpenReview (conferences, workshops, symposia, student events)", len(selected_venues))

        records: List[RawConferenceData] = []
        for venue_id in selected_venues:
            try:
                conf_data = self._fetch_venue_details(venue_id, headers)
                if conf_data:
                    records.append(conf_data)
            except Exception as e:
                logger.debug("Could not fetch details for venue '%s': %s", venue_id, e)
                continue

        return records

    def _fetch_venue_details(self, venue_id: str, headers: dict) -> Optional[RawConferenceData]:
        group_url = f"{self.base_api}/groups?id={urllib.parse.quote(venue_id, safe='')}"
        req = urllib.request.Request(group_url, headers=headers)
        with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        groups = data.get("groups", [])
        if not groups:
            return None

        g = groups[0]
        cnt = g.get("content", {})

        raw_title = cnt.get("title", {}).get("value")
        raw_subtitle = cnt.get("subtitle", {}).get("value")
        website = cnt.get("website", {}).get("value")
        location = cnt.get("location", {}).get("value")
        start_date = cnt.get("start_date", {}).get("value")
        if start_date is not None:
            # OpenReview can provide timestamps in milliseconds (e.g. 1784185200000)
            if isinstance(start_date, (int, float)):
                try:
                    start_date = datetime.utcfromtimestamp(start_date / 1000.0).strftime("%Y-%m-%d")
                except Exception:
                    start_date = str(start_date)
            else:
                start_date = str(start_date)
        date_field = cnt.get("date", {}).get("value") or ""

        # Extract conference name & year
        # venue_id often has format like 'ACM.org/TheWebConf/2025/Conference' or 'AAAI.org/2025/Conference'
        parts = venue_id.split("/")
        year = None
        for p in parts:
            if re.match(r"^20\d\d$", p):
                year = p
                break

        # Fallback to name from subtitle or title or venue_id
        conf_name = raw_subtitle or raw_title or (parts[1] if len(parts) > 2 else parts[0])
        # Clean year if at the end of acronym
        if year and conf_name.endswith(year):
            conf_name = conf_name[:-len(year)].strip()

        # Extract submission deadline from date string
        # e.g.: 'Submission Start: Jul 08 2024, Submission Deadline: Aug 16 2024 11:59AM UTC-0'
        submission_deadline = None
        if "submission deadline:" in date_field.lower():
            m = re.search(r"submission deadline:\s*([^,;]+)", date_field, re.IGNORECASE)
            if m:
                submission_deadline = m.group(1).strip()
        elif "deadline:" in date_field.lower():
            m = re.search(r"deadline:\s*([^,;]+)", date_field, re.IGNORECASE)
            if m:
                submission_deadline = m.group(1).strip()

        # Parse publisher/organizer if in domain
        publisher = None
        organizer = None
        first_part = parts[0].lower()
        if "acm" in first_part:
            publisher = "Association for Computing Machinery (ACM)"
            organizer = "ACM"
        elif "ieee" in first_part:
            publisher = "IEEE"
            organizer = "IEEE"
        elif "thecvf" in first_part:
            publisher = "Computer Vision Foundation (CVF)"
            organizer = "CVF"
        elif "aaai" in first_part:
            publisher = "AAAI Press"
            organizer = "Association for the Advancement of Artificial Intelligence (AAAI)"

        source_url = f"https://openreview.net/group?id={venue_id}"

        # Detect event type from venue_id or title
        event_type = "conference"
        v_lower = f"{venue_id} {raw_title or ''}".lower()
        if any(w in v_lower for w in ["workshop"]):
            event_type = "workshop"
        elif any(s in v_lower for s in ["symposium", "symp"]):
            event_type = "symposium"
        elif any(c in v_lower for c in ["colloquium", "colloq"]):
            event_type = "colloquium"

        # Check for university / institution in venue_id (e.g. uni-saarland.de, kaist.ac.kr, cornell.edu)
        if not organizer:
            domain_part = parts[0]
            if any(tld in domain_part.lower() for tld in [".edu", ".ac.", "uni-", "university", "universidad"]):
                organizer = domain_part

        return RawConferenceData(
            source_name=self.source_name,
            source_url=source_url,
            raw_name=conf_name,
            raw_edition_or_year=year,
            raw_topics=["Computer Science", "Artificial Intelligence"],
            raw_submission_deadline=submission_deadline,
            raw_start_date=start_date,
            raw_end_date=None,
            raw_location=location,
            raw_format="In-Person" if location and "virtual" not in str(location).lower() else "Hybrid",
            raw_publisher=publisher,
            raw_organizer=organizer,
            raw_fees=None,
            raw_official_website=website,
            extra_metadata={
                "title": raw_title,
                "openreview_venue_id": venue_id,
                "contact": cnt.get("contact", {}).get("value"),
                "event_type": event_type,
                "has_paper_submission": True,
                "source_type": "openreview",
                "submission_url": f"https://openreview.net/group?id={venue_id}",
            }
        )

