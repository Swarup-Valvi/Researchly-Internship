"""Public CFP feed adapter for curated academic conference directories (ai-deadlines, sec-deadlines)."""

from __future__ import annotations

import logging
import urllib.request
from typing import List, Optional
import yaml

from .base import SourceAdapter
from ..core.models import RawConferenceData

logger = logging.getLogger("researchly.adapters.public_cfp_feed")


class PublicCFPFeedAdapter(SourceAdapter):
    """Ingests academic conference & workshop CFPs from public academic deadline repositories.
    
    Covers broad machine learning, computer vision, natural language processing,
    and cybersecurity research conferences, workshops, and symposiums.
    """

    DEFAULT_FEEDS = [
        (
            "https://raw.githubusercontent.com/paperswithcode/ai-deadlines/gh-pages/_data/conferences.yml",
            "ai_deadlines_feed",
            ["Machine Learning", "Artificial Intelligence", "Computer Vision", "Natural Language Processing"]
        ),
        (
            "https://raw.githubusercontent.com/sec-deadlines/sec-deadlines.github.io/master/_data/conferences.yml",
            "sec_deadlines_feed",
            ["Computer Security", "Cryptography", "Privacy", "Systems"]
        )
    ]

    def __init__(self, feeds: Optional[List[tuple]] = None, max_records_per_feed: int = 25, timeout_sec: int = 8):
        self.feeds = feeds or self.DEFAULT_FEEDS
        self.max_records_per_feed = max_records_per_feed
        self.timeout_sec = timeout_sec

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
                
                items = yaml.safe_load(raw_yaml)
                if not isinstance(items, list):
                    continue

                count = 0
                for item in items:
                    if count >= self.max_records_per_feed:
                        break
                    if not isinstance(item, dict):
                        continue

                    title = item.get("title")
                    year = str(item.get("year", "")) if item.get("year") else None
                    if not title or not year:
                        continue

                    # Extract details
                    link = item.get("link")
                    deadline = item.get("deadline")
                    place = item.get("place")
                    start_date = str(item.get("start", "")) if item.get("start") else None
                    end_date = str(item.get("end", "")) if item.get("end") else None
                    sub_topic = item.get("sub")
                    topics = list(default_topics)
                    if sub_topic:
                        if isinstance(sub_topic, list):
                            for st in sub_topic:
                                if str(st) not in topics:
                                    topics.append(str(st))
                        elif str(sub_topic) not in topics:
                            topics.append(str(sub_topic))

                    # Extract note for status hints (e.g. postponed, cancelled, extended)
                    note = item.get("note") or ""
                    status_hint = None
                    if note:
                        note_lower = str(note).lower()
                        if "postpone" in note_lower or "reschedule" in note_lower:
                            status_hint = "postponed"
                        elif "cancel" in note_lower:
                            status_hint = "cancelled"

                    # Detect event type from title or note
                    event_type = "conference"
                    combined_desc = f"{title} {note}".lower()
                    if "workshop" in combined_desc:
                        event_type = "workshop"
                    elif "symposium" in combined_desc:
                        event_type = "symposium"
                    elif "colloquium" in combined_desc:
                        event_type = "colloquium"

                    all_records.append(RawConferenceData(
                        source_name=feed_name,
                        source_url=feed_url,
                        raw_name=title,
                        raw_edition_or_year=year,
                        raw_topics=topics,
                        raw_submission_deadline=str(deadline) if deadline else None,
                        raw_start_date=start_date,
                        raw_end_date=end_date,
                        raw_location=place,
                        raw_format="Virtual" if place and "online" in place.lower() else "In-Person",
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
                        }
                    ))
                    count += 1

                logger.info("Feed '%s' provided %d academic event CFP(s)", feed_name, count)

            except Exception as e:
                logger.warning("Failed to fetch public CFP feed '%s': %s", feed_url, e)
                continue

        return all_records
