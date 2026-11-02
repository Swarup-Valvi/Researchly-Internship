"""Fixture adapter for local, deterministic test and offline ingestion."""

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Union
from .base import SourceAdapter
from ..core.models import RawConferenceData


class FixtureAdapter(SourceAdapter):
    """Loads conference raw records from a JSON fixture file."""

    def __init__(self, fixture_path: Union[str, Path], source_name: str = "fixture_adapter"):
        self.fixture_path = Path(fixture_path)
        self._source_name = source_name

    @property
    def source_name(self) -> str:
        return self._source_name

    def fetch(self) -> List[RawConferenceData]:
        if not self.fixture_path.exists():
            raise FileNotFoundError(f"Fixture file not found at {self.fixture_path}")

        with open(self.fixture_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        records: List[RawConferenceData] = []
        for item in data:
            records.append(RawConferenceData(
                source_name=self.source_name,
                source_url=str(self.fixture_path),
                raw_name=item.get("raw_name", ""),
                raw_edition_or_year=item.get("raw_edition_or_year"),
                raw_topics=item.get("raw_topics", []),
                raw_submission_deadline=item.get("raw_submission_deadline"),
                raw_start_date=item.get("raw_start_date"),
                raw_end_date=item.get("raw_end_date"),
                raw_location=item.get("raw_location"),
                raw_format=item.get("raw_format"),
                raw_publisher=item.get("raw_publisher"),
                raw_organizer=item.get("raw_organizer"),
                raw_fees=item.get("raw_fees"),
                raw_official_website=item.get("raw_official_website"),
                extra_metadata=item.get("extra_metadata", {}),
            ))
        return records

