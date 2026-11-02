"""Supporting scholarly metadata adapter using Crossref Works and Journals API."""

from __future__ import annotations

import json
import logging
import urllib.request
import urllib.parse
from typing import List, Optional

from .base import SourceAdapter
from ..core.models import RawConferenceData

logger = logging.getLogger("researchly.adapters.crossref")


class CrossrefMetadataAdapter(SourceAdapter):
    """Enriches conference proceedings and DOI publisher provenance using Crossref.
    
    Tier 2 supporting scholarly metadata source.
    """

    def __init__(self, query: str = "Machine Learning Conference", max_results: int = 5, timeout_sec: int = 6):
        self.query = query
        self.max_results = max_results
        self.timeout_sec = timeout_sec
        self.base_url = "https://api.crossref.org/works"

    @property
    def source_name(self) -> str:
        return "crossref_metadata"

    def fetch(self) -> List[RawConferenceData]:
        headers = {
            "User-Agent": "Researchly-Bot/1.0 (mailto:admin@researchly.io; scholarly verification)"
        }
        encoded_q = urllib.parse.quote(self.query)
        # Search for proceedings-article or book-chapter in conference proceedings
        url = f"{self.base_url}?query.container-title={encoded_q}&rows={self.max_results}"

        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            raise ConnectionError(f"Crossref API query failed at {url}: {e}")

        items = data.get("message", {}).get("items", [])
        records: List[RawConferenceData] = []

        seen_containers = set()
        for it in items:
            containers = it.get("container-title", [])
            container_name = containers[0] if containers else None
            if not container_name or container_name in seen_containers:
                continue
            seen_containers.add(container_name)

            publisher = it.get("publisher")
            doi_url = f"https://doi.org/{it.get('DOI')}" if it.get("DOI") else it.get("URL")
            
            # Extract year from date-parts
            date_parts = it.get("issued", {}).get("date-parts", [[]])
            year_str = str(date_parts[0][0]) if date_parts and date_parts[0] else None

            records.append(RawConferenceData(
                source_name=self.source_name,
                source_url=doi_url or url,
                raw_name=container_name,
                raw_edition_or_year=year_str,
                raw_topics=["Scholarly Proceedings", "Peer Reviewed Publications"],
                raw_submission_deadline=None,
                raw_start_date=None,
                raw_end_date=None,
                raw_location=None,
                raw_format=None,
                raw_publisher=publisher,
                raw_organizer=None,
                raw_fees=None,
                raw_official_website=None,
                extra_metadata={
                    "doi": it.get("DOI"),
                    "sample_work_title": it.get("title", [""])[0] if it.get("title") else None,
                    "source_type": "supporting_scholarly_metadata"
                }
            ))

        return records

