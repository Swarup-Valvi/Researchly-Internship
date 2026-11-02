"""Supporting scholarly metadata adapter for DBLP venue queries."""

from __future__ import annotations

import logging
import urllib.request
import urllib.error
import urllib.parse
from typing import List

from .base import SourceAdapter
from ..core.models import RawConferenceData

logger = logging.getLogger("researchly.adapters.dblp")


class DBLPMetadataAdapter(SourceAdapter):
    """Adapter for DBLP Computer Science Bibliography venue search.
    
    Tier 2 supporting scholarly metadata source.
    Monitors access challenges transparently without bypassing bot protections.
    """

    def __init__(self, query: str = "Machine Learning", timeout_sec: int = 5):
        self.query = query
        self.timeout_sec = timeout_sec
        self.base_url = f"https://dblp.org/search/venue/api?q={urllib.parse.quote(query)}&format=json"

    @property
    def source_name(self) -> str:
        return "dblp_metadata"

    def fetch(self) -> List[RawConferenceData]:
        headers = {
            "User-Agent": "Researchly-Bot/1.0 (+https://researchly.io; academic metadata verification)",
            "Accept": "application/json,text/html"
        }

        try:
            req = urllib.request.Request(self.base_url, headers=headers)
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                content = resp.read()
                # Check if DBLP presented bot verification check
                if resp.status == 202 or b"Making sure you're not a bot" in content:
                    raise PermissionError("DBLP returned bot verification challenge (HTTP 202)")
                return []
        except urllib.error.HTTPError as e:
            raise PermissionError(f"DBLP access restricted: HTTP {e.code}")
        except Exception as e:
            raise ConnectionError(f"DBLP source error: {e}")

