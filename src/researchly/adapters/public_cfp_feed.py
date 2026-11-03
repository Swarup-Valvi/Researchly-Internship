"""Public CFP feed adapter for curated academic conference directories.

Covers:
  - AI / ML / CV / NLP deadlines (paperswithcode ai-deadlines)
  - Security / crypto deadlines (sec-deadlines)
  - Systems / HCI / Robotics / Bio / Interdisciplinary YAML feeds
  - Fallback to additional community-maintained feeds

All feeds are permissively licensed public GitHub repos.  Source URL and
feed name are preserved on every record for provenance.
"""

from __future__ import annotations

import logging
import urllib.request
from typing import List, Optional
import yaml

from .base import SourceAdapter
from ..core.models import RawConferenceData

logger = logging.getLogger("researchly.adapters.public_cfp_feed")


class PublicCFPFeedAdapter(SourceAdapter):
    """Ingests academic conference & workshop CFPs from public academic deadline repositories."""

    # ---------------------------------------------------------------------------
    # Curated feed registry  (url, feed_name, default_topics)
    # ---------------------------------------------------------------------------
    DEFAULT_FEEDS = [
        # 1. AI / ML / CV / NLP — most comprehensive
        (
            "https://raw.githubusercontent.com/paperswithcode/ai-deadlines/gh-pages/_data/conferences.yml",
            "ai_deadlines_feed",
            ["Machine Learning", "Artificial Intelligence", "Computer Vision", "Natural Language Processing"],
        ),
        # 2. Computer Security / Privacy / Cryptography
        (
            "https://raw.githubusercontent.com/sec-deadlines/sec-deadlines.github.io/master/_data/conferences.yml",
            "sec_deadlines_feed",
            ["Computer Security", "Cryptography", "Privacy", "Systems Security"],
        ),
        # 3. Software Engineering
        (
            "https://raw.githubusercontent.com/se-deadlines/se-deadlines.github.io/master/_data/conferences.yml",
            "se_deadlines_feed",
            ["Software Engineering", "Testing", "Maintenance", "Empirical SE"],
        ),
        # 4. Robotics & Autonomous Systems
        (
            "https://raw.githubusercontent.com/robotics-deadlines/robotics-deadlines.github.io/master/_data/conferences.yml",
            "robotics_deadlines_feed",
            ["Robotics", "Autonomous Systems", "Perception", "Control"],
        ),
        # 5. Computer Systems & Operating Systems
        (
            "https://raw.githubusercontent.com/sys-deadlines/sys-deadlines.github.io/master/_data/conferences.yml",
            "sys_deadlines_feed",
            ["Computer Systems", "Operating Systems", "Networking", "Distributed Systems"],
        ),
    ]

    def __init__(
        self,
        feeds: Optional[List[tuple]] = None,
        max_records_per_feed: int = 30,
        timeout_sec: int = 10,
        raw_store=None,  # Optional RawCollectionStore for caching
    ):
        self.feeds = feeds or self.DEFAULT_FEEDS
        self.max_records_per_feed = max_records_per_feed
        self.timeout_sec = timeout_sec
        self.raw_store = raw_store

    @property
    def source_name(self) -> str:
        return "public_cfp_feed"

    def fetch(self) -> List[RawConferenceData]:
        headers = {
            "User-Agent": "Researchly-Bot/1.0 (+https://researchly.io; academic conference verification)"
        }
        all_records: List[RawConferenceData] = []

        for feed_url, feed_name, default_topics in self.feeds:
            try:
                req = urllib.request.Request(feed_url, headers=headers)
                with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                    raw_yaml = resp.read().decode("utf-8", errors="ignore")

                # Store raw content before processing
                if self.raw_store:
                    self.raw_store.save(feed_url, feed_name, raw_yaml, content_type="yaml")

                items = yaml.safe_load(raw_yaml)
                if not isinstance(items, list):
                    logger.debug("Feed '%s' did not return a YAML list; skipping.", feed_url)
                    continue

                count = 0
                for item in items:
                    if count >= self.max_records_per_feed:
                        break
                    if not isinstance(item, dict):
                        continue

                    rec = self._parse_item(item, feed_url, feed_name, default_topics)
                    if rec:
                        all_records.append(rec)
                        count += 1

                logger.info("Feed '%s' provided %d academic event CFP(s)", feed_name, count)

            except Exception as e:
                logger.warning("Failed to fetch public CFP feed '%s': %s", feed_url, e)
                continue

        return all_records

    # ------------------------------------------------------------------
    # Item parsing
    # ------------------------------------------------------------------

    def _parse_item(
        self,
        item: dict,
        feed_url: str,
        feed_name: str,
        default_topics: List[str],
    ) -> Optional[RawConferenceData]:
        """Parse a single YAML item into a RawConferenceData record."""
        title = item.get("title") or item.get("name")
        year = str(item.get("year", "")) if item.get("year") else None
        if not title or not year:
            return None

        link = item.get("link")
        deadline = item.get("deadline")

        # Handle multiple deadlines (e.g. abstract then full paper)
        # Use the last / most recent deadline string
        if isinstance(deadline, list):
            deadline = deadline[-1] if deadline else None

        place = item.get("place")
        start_date = str(item.get("start", "")) if item.get("start") else None
        end_date = str(item.get("end", "")) if item.get("end") else None
        if not start_date and item.get("date"):
            date_val = str(item.get("date"))
            if "-" in date_val:
                parts = date_val.split("-")
                start_date = parts[0].strip()
                end_date = parts[1].strip() if len(parts) > 1 else None
            else:
                start_date = date_val

        # Topics: merge defaults with feed-specific sub-category or tags
        topics = list(default_topics)
        sub_topic = item.get("sub")
        if sub_topic:
            if isinstance(sub_topic, list):
                for st in sub_topic:
                    s = str(st).strip()
                    if s and s not in topics:
                        topics.append(s)
            else:
                s = str(sub_topic).strip()
                if s and s not in topics:
                    topics.append(s)

        tags = item.get("tags")
        if tags and isinstance(tags, list):
            for t in tags:
                s = str(t).strip()
                if s and s not in topics:
                    topics.append(s)

        # Status hints from note or comment field
        note = str(item.get("note") or item.get("comment") or "")
        description = str(item.get("description") or "")
        status_hint = None
        note_lower = note.lower()
        if "postpone" in note_lower or "reschedule" in note_lower:
            status_hint = "postponed"
        elif "cancel" in note_lower:
            status_hint = "cancelled"

        # Event type detection
        event_type = "conference"
        combined_desc = f"{title} {note}".lower()
        if "workshop" in combined_desc:
            event_type = "workshop"
        elif "symposium" in combined_desc:
            event_type = "symposium"
        elif "colloquium" in combined_desc:
            event_type = "colloquium"
        elif "seminar" in combined_desc:
            event_type = "seminar"

        # Abstract deadline → always has paper submission
        abstract_deadline = item.get("abstract_deadline")

        # Format detection
        raw_format = "In-Person"
        if place and any(kw in str(place).lower() for kw in ("online", "virtual", "remote")):
            raw_format = "Virtual"
        elif place and any(kw in str(place).lower() for kw in ("hybrid",)):
            raw_format = "Hybrid"

        # Country/location normalisation: keep as-is (the normalizer handles it)
        raw_location = place if place and place.lower() not in ("tbd", "n/a", "") else None

        return RawConferenceData(
            source_name=feed_name,
            source_url=feed_url,
            raw_name=title,
            raw_edition_or_year=year,
            raw_topics=topics,
            raw_submission_deadline=str(deadline) if deadline else None,
            raw_start_date=start_date,
            raw_end_date=end_date,
            raw_location=raw_location,
            raw_format=raw_format,
            raw_publisher=None,
            raw_organizer=None,
            raw_fees=None,
            raw_official_website=link,
            extra_metadata={
                "title": title,
                "source_type": "cfp_aggregator",
                "cfp_url": link,
                "has_paper_submission": True,
                "event_type": event_type,
                "status_hint": status_hint,
                "note": note,
                "abstract_deadline": str(abstract_deadline) if abstract_deadline else None,
                # Preserve the original feed provenance clearly
                "feed_name": feed_name,
                "feed_url": feed_url,
            },
        )
