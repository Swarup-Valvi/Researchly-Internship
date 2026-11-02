"""Generic event website adapter for industry conferences and attendance-only events."""

from __future__ import annotations

import logging
import re
import urllib.request
from datetime import datetime
from typing import List, Optional
from bs4 import BeautifulSoup
import json

from .base import SourceAdapter
from ..core.models import RawConferenceData

logger = logging.getLogger("researchly.adapters.generic_event")


class GenericEventAdapter(SourceAdapter):
    """Adapter for ingesting from generic event websites (industry conferences, summits)."""

    def __init__(self, urls: Optional[List[str]] = None, timeout_sec: int = 8, reference_date: Optional[datetime] = None):
        self.urls = urls or []
        self.timeout_sec = timeout_sec
        self.reference_year = str((reference_date or datetime.utcnow()).year)

    @property
    def source_name(self) -> str:
        return "generic_event_adapter"

    def fetch(self) -> List[RawConferenceData]:
        headers = {
            "User-Agent": "Researchly-Bot/1.0 (+https://researchly.io; academic conference verification)"
        }
        records: List[RawConferenceData] = []

        for url in self.urls:
            try:
                rec = self._scrape_event(url, headers)
                if rec:
                    records.append(rec)
            except Exception as e:
                logger.warning("Could not scrape event URL '%s': %s", url, e)
                continue

        return records

    def _scrape_event(self, url: str, headers: dict) -> Optional[RawConferenceData]:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
        except Exception as e:
            raise ConnectionError(f"Failed to fetch {url}: {e}")

        soup = BeautifulSoup(html, "html.parser")

        # Try to extract from schema.org JSON-LD first
        schema_data = self._extract_schema_org(soup)
        
        # Extract basic information
        name = self._extract_name(soup, schema_data)
        title = schema_data.get("name") if schema_data else name
        location = self._extract_location(soup, schema_data)
        start_date = schema_data.get("startDate") if schema_data else None
        end_date = schema_data.get("endDate") if schema_data else None
        event_status = schema_data.get("eventStatus") if schema_data else None
        
        status_hint = None
        if event_status:
            if "postponed" in event_status.lower() or "rescheduled" in event_status.lower():
                status_hint = "postponed"
            elif "cancelled" in event_status.lower():
                status_hint = "cancelled"

        # Extract topics from meta keywords or description
        topics = self._extract_topics(soup)
        
        # Extract organizer from meta or schema
        organizer = schema_data.get("organizer", {}).get("name") if schema_data else None
        if not organizer:
            organizer = self._extract_organizer(soup)

        # Industry events typically don't have paper submission deadlines
        # We leave submission_deadline as None to distinguish from academic CFPs
        submission_deadline = None

        return RawConferenceData(
            source_name=self.source_name,
            source_url=url,
            raw_name=name,
            raw_edition_or_year=self._extract_year(soup, start_date),
            raw_topics=topics,
            raw_submission_deadline=submission_deadline,
            raw_start_date=start_date,
            raw_end_date=end_date,
            raw_location=location,
            raw_format="In-Person",
            raw_publisher=None,
            raw_organizer=organizer,
            raw_fees=None,
            raw_official_website=url,
            extra_metadata={
                "title": title,
                "event_type": "summit",
                "has_paper_submission": False,
                "schema_data": schema_data,
                "status_hint": status_hint,
            }
        )

    def _extract_schema_org(self, soup: BeautifulSoup) -> Optional[dict]:
        """Extract schema.org JSON-LD data."""
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
                if isinstance(data, dict):
                    if data.get("@type") == "Event":
                        return data
                    if isinstance(data.get("@graph"), list):
                        for item in data["@graph"]:
                            if item.get("@type") == "Event":
                                return item
            except (json.JSONDecodeError, AttributeError):
                continue
        return None

    def _extract_name(self, soup: BeautifulSoup, schema_data: Optional[dict]) -> str:
        """Extract event name from title, meta, or schema."""
        if schema_data and schema_data.get("name"):
            return schema_data["name"]
        
        # Try og:title
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            content = og_title["content"]
            # Clean up - remove dates and location
            return re.sub(r"\s*\|.*$", "", content).strip()
        
        # Try title tag
        title_tag = soup.find("title")
        if title_tag:
            content = title_tag.get_text()
            return re.sub(r"\s*\|.*$", "", content).strip()
        
        return "Unknown Event"

    def _extract_location(self, soup: BeautifulSoup, schema_data: Optional[dict]) -> Optional[str]:
        """Extract location from schema, meta, or page content."""
        if schema_data:
            loc = schema_data.get("location", {})
            if isinstance(loc, dict):
                if loc.get("name"):
                    return loc["name"]
                addr = loc.get("address", {})
                if isinstance(addr, dict):
                    parts = []
                    if addr.get("addressLocality"):
                        parts.append(addr["addressLocality"])
                    if addr.get("addressRegion"):
                        parts.append(addr["addressRegion"])
                    if addr.get("addressCountry"):
                        parts.append(addr["addressCountry"])
                    if parts:
                        return ", ".join(parts)
        
        # Try geo.placename meta
        geo_place = soup.find("meta", attrs={"name": "geo.placename"})
        if geo_place and geo_place.get("content"):
            return geo_place["content"]
        
        # Try og:description for location hints
        og_desc = soup.find("meta", property="og:description")
        if og_desc and og_desc.get("content"):
            desc = og_desc["content"]
            # Look for city names
            cities = ["Mumbai", "Delhi", "Bangalore", "Chennai", "Hyderabad", "Pune"]
            for city in cities:
                if city in desc:
                    return city
        
        return None

    def _extract_year(self, soup: BeautifulSoup, start_date: Optional[str]) -> str:
        """Extract year from start_date or page content."""
        if start_date:
            match = re.search(r"(\d{4})", start_date)
            if match:
                return match.group(1)
        
        # Try to find year in title or meta
        title = soup.find("title")
        if title:
            match = re.search(r"20(2[4-9]|3[0-9])", title.get_text())
            if match:
                return match.group(0)
        
        return self.reference_year

    def _extract_topics(self, soup: BeautifulSoup) -> List[str]:
        """Extract topics from keywords meta or description."""
        topics = []
        
        # Try keywords meta
        keywords = soup.find("meta", attrs={"name": "keywords"})
        if keywords and keywords.get("content"):
            content = keywords["content"]
            # Split by comma and clean
            for kw in content.split(","):
                kw = kw.strip()
                if len(kw) > 2 and len(kw) < 50:
                    topics.append(kw)
        
        # Try og:description for AI-related topics
        og_desc = soup.find("meta", property="og:description")
        if og_desc and og_desc.get("content"):
            desc = og_desc["content"].lower()
            ai_terms = ["artificial intelligence", "machine learning", "ai", "generative ai", "llm", "deep learning"]
            for term in ai_terms:
                if term in desc and term not in topics:
                    topics.append(term.title())
        
        return topics[:10]  # Limit to 10 topics

    def _extract_organizer(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract organizer from meta tags."""
        author = soup.find("meta", attrs={"name": "author"})
        if author and author.get("content"):
            return author["content"]
        return None
