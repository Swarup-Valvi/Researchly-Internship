"""schema.org Event extraction from <script type="application/ld+json">."""
from __future__ import annotations

import json
from typing import Any, Iterable, Optional

from bs4 import BeautifulSoup

EVENT_TYPES = {"Event", "EducationEvent", "AcademicEvent", "BusinessEvent", "SocialEvent"}


def _walk(node: Any) -> Iterable[dict]:
    if isinstance(node, list):
        for n in node:
            yield from _walk(n)
    elif isinstance(node, dict):
        yield node
        for key in ("@graph", "subEvent"):
            if key in node:
                yield from _walk(node[key])


def _is_event(d: dict) -> bool:
    t = d.get("@type")
    types = t if isinstance(t, list) else [t]
    return any(isinstance(x, str) and x.split("/")[-1] in EVENT_TYPES for x in types)


def _loc(d: dict) -> tuple[Optional[str], Optional[str], Optional[bool]]:
    loc = d.get("location")
    virtual = None
    if d.get("eventAttendanceMode", "").endswith("OnlineEventAttendanceMode"):
        virtual = True
    locs = loc if isinstance(loc, list) else [loc]
    parts: list[str] = []
    venue: Optional[str] = None
    for l in locs:
        if isinstance(l, str):
            parts.append(l)
        elif isinstance(l, dict):
            if l.get("@type") == "VirtualLocation":
                virtual = True
                continue
            name = l.get("name")
            addr = l.get("address")
            if isinstance(addr, dict):
                bits = [addr.get("addressLocality"), addr.get("addressRegion"), addr.get("addressCountry")]
                bits = [b if isinstance(b, str) else (b or {}).get("name") for b in bits]
                text = ", ".join(b for b in bits if b)
                venue = venue or name
                parts.append(text)
            elif isinstance(addr, str):
                venue = venue or name
                parts.append(addr)
            elif name:
                parts.append(name)
    return (", ".join(p for p in parts if p) or None), venue, virtual


def extract_events(html: str) -> list[dict]:
    """Return raw field dicts for each schema.org Event found. Missing fields are simply absent."""
    soup = BeautifulSoup(html, "lxml")
    events: list[dict] = []
    for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            data = json.loads(tag.string or tag.get_text() or "")
        except (json.JSONDecodeError, TypeError):
            continue
        for node in _walk(data):
            if not _is_event(node):
                continue
            loc_text, venue, virtual = _loc(node)
            org = node.get("organizer")
            orgs = org if isinstance(org, list) else [org]
            sponsors = [o.get("name") if isinstance(o, dict) else o for o in orgs if o]
            events.append({
                "name": node.get("name"),
                "url": node.get("url"),
                "start": node.get("startDate"),
                "end": node.get("endDate"),
                "location_text": loc_text,
                "venue": venue,
                "is_virtual": virtual,
                "description": node.get("description"),
                "sponsors": [s for s in sponsors if isinstance(s, str)],
            })
    return events
