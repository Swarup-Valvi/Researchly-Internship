"""Supporting scholarly metadata adapter using OpenAlex public API."""

from __future__ import annotations

import json
import logging
import urllib.request
import urllib.parse
from typing import List, Optional

from .base import SourceAdapter
from ..core.models import RawConferenceData

logger = logging.getLogger("researchly.adapters.openalex")


class OpenAlexMetadataAdapter(SourceAdapter):
    """Enriches and corroborates conference publication metadata using OpenAlex.
    
    Tier 2 supporting scholarly metadata source.
    """

    def __init__(self, query: str = "Conference on Machine Learning", max_results: int = 5, timeout_sec: int = 6):
        self.query = query
        self.max_results = max_results
        self.timeout_sec = timeout_sec
        self.base_url = "https://api.openalex.org/sources"

    @property
    def source_name(self) -> str:
        return "openalex_metadata"

    def fetch(self) -> List[RawConferenceData]:
        headers = {
            "User-Agent": "Researchly-Bot/1.0 (mailto:admin@researchly.io; scholarly metadata verification)"
        }
        encoded_q = urllib.parse.quote(self.query)
        url = f"{self.base_url}?search={encoded_q}&per-page={self.max_results}"

        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            raise ConnectionError(f"OpenAlex API query failed at {url}: {e}")

        records: List[RawConferenceData] = []
        for src in data.get("results", []):
            src_type = src.get("type")
            # Only consider conferences or proceedings
            if src_type != "conference":
                continue

            name = src.get("display_name", "")
            publisher = src.get("host_organization_name")
            homepage = src.get("homepage_url")
            works_count = src.get("works_count", 0)

            records.append(RawConferenceData(
                source_name=self.source_name,
                source_url=src.get("id") or url,
                raw_name=name,
                raw_edition_or_year=None,
                raw_topics=["Scholarly Conference", "Academic Proceedings"],
                raw_submission_deadline=None,
                raw_start_date=None,
                raw_end_date=None,
                raw_location=None,
                raw_format=None,
                raw_publisher=publisher,
                raw_organizer=None,
                raw_fees=None,
                raw_official_website=homepage,
                extra_metadata={
                    "openalex_id": src.get("id"),
                    "works_count": works_count,
                    "is_oa": src.get("is_oa"),
                    "issn_l": src.get("issn_l"),
                    "source_type": "supporting_scholarly_metadata"
                }
            ))

        return records

