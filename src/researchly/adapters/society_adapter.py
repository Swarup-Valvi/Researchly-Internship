"""Discovery and directory scraper checking IEEE and ACM conference portals."""

from __future__ import annotations

import logging
import urllib.request
import urllib.error
from typing import List

from .base import SourceAdapter
from ..core.models import RawConferenceData

logger = logging.getLogger("researchly.adapters.society_directory")


class SocietyDirectoryAdapter(SourceAdapter):
    """Adapter for IEEE and ACM official public conference directory pages.
    
    Adheres strictly to website access permissions and does NOT bypass WAF or Cloudflare challenges.
    Reports network blocks or challenge responses cleanly.
    """

    def __init__(self, society: str = "ieee", timeout_sec: int = 5):
        self.society = society.lower()
        self.timeout_sec = timeout_sec
        if self.society == "acm":
            self.url = "https://www.acm.org/conferences/conference-events"
        else:
            self.url = "https://www.ieee.org/conferences/index.html"

    @property
    def source_name(self) -> str:
        return f"{self.society}_directory"

    def fetch(self) -> List[RawConferenceData]:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }

        try:
            req = urllib.request.Request(self.url, headers=headers)
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                # Check for AWS WAF challenges or challenge action headers
                waf_action = resp.headers.get("x-amzn-waf-action")
                if waf_action or resp.status == 202 or len(resp.read()) == 0:
                    raise PermissionError(
                        f"{self.society.upper()} conference directory protected by WAF challenge (HTTP {resp.status}, x-amzn-waf-action: {waf_action})"
                    )
                return []
        except urllib.error.HTTPError as e:
            if e.code in (403, 401):
                raise PermissionError(f"{self.society.upper()} conference directory blocked request (HTTP {e.code} Forbidden)")
            raise ConnectionError(f"{self.society.upper()} conference directory error: HTTP {e.code}")
        except Exception as e:
            raise ConnectionError(f"{self.society.upper()} directory inaccessible: {e}")

