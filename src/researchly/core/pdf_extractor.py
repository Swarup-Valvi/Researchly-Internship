"""PDF and CFP document text extractor for academic announcements.

Safely parses PDF links and binary documents without external binary dependencies.
Uses pypdf for pure-Python parsing, extracts deadline, date, venue, and track text.
"""

from __future__ import annotations

import base64
import io
import logging
import re
import urllib.request
import urllib.error
from typing import Optional, Dict, Any

logger = logging.getLogger("researchly.core.pdf_extractor")


def extract_text_from_pdf_bytes(pdf_bytes: bytes, max_pages: int = 5) -> str:
    """Extract text from PDF raw bytes up to max_pages."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(pdf_bytes))
        extracted = []
        for i, page in enumerate(reader.pages):
            if i >= max_pages:
                break
            text = page.extract_text()
            if text:
                extracted.append(text)
        return "\n".join(extracted)
    except Exception as e:
        logger.warning("PDF extraction failed: %s", e)
        return ""


def text_from_stored_pdf(raw_content: str, content_type: str = "") -> Optional[str]:
    """Extract text from PDF bytes already stored on a raw record.

    Returns None when the record is not a PDF. Returns an empty string when it
    is a PDF but extraction is unavailable or yields no text. This never
    downloads a URL and never attempts to bypass access controls.
    """
    if not raw_content:
        return "" if (content_type or "").lower() == "pdf" else None

    ctype = (content_type or "").lower()
    is_pdf = ctype == "pdf" or raw_content.lstrip().startswith("%PDF")
    if not is_pdf:
        return None

    payload = raw_content.lstrip()
    pdf_bytes = b""
    if payload.startswith("%PDF"):
        pdf_bytes = payload.encode("latin-1", errors="ignore")
    else:
        compact = "".join(payload.split())
        try:
            decoded = base64.b64decode(compact, validate=True)
        except Exception:
            decoded = b""
        if decoded.startswith(b"%PDF"):
            pdf_bytes = decoded

    if not pdf_bytes:
        return ""
    return extract_text_from_pdf_bytes(pdf_bytes)


def fetch_and_extract_pdf(pdf_url: str, timeout_sec: int = 10, max_pages: int = 5) -> Optional[str]:
    """Download a remote PDF and extract text."""
    headers = {
        "User-Agent": "Researchly-Bot/1.0 (+https://researchly.io; academic CFP text extractor)",
        "Accept": "application/pdf,*/*"
    }
    try:
        req = urllib.request.Request(pdf_url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if "pdf" not in content_type.lower() and not pdf_url.lower().endswith(".pdf"):
                logger.debug("URL %s does not appear to be a PDF (Content-Type: %s)", pdf_url, content_type)
            pdf_bytes = resp.read()
            text = extract_text_from_pdf_bytes(pdf_bytes, max_pages=max_pages)
            return text if text.strip() else None
    except Exception as e:
        logger.warning("Failed to download or extract PDF from %s: %s", pdf_url, e)
        return None


def parse_cfp_text_heuristics(text: str) -> Dict[str, Any]:
    """Parse dates, deadlines, and location heuristics from extracted CFP text."""
    info: Dict[str, Any] = {}
    
    # 1. Submission deadline patterns
    dl_patterns = [
        r"(?:submission\s+deadline|paper\s+submission|full\s+paper\s+deadline|submission\s+due|due\s+date)[:\s]+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d\d)",
        r"(?:submission\s+deadline|paper\s+submission|full\s+paper\s+deadline)[:\s]+(\d{1,2}\s+[A-Za-z]+\s+20\d\d)",
        r"(?:submission\s+deadline|paper\s+submission)[:\s]+(20\d\d-\d{2}-\d{2})",
    ]
    for pat in dl_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            info["submission_deadline"] = m.group(1).strip()
            break

    # 2. Conference dates
    date_patterns = [
        r"(?:conference\s+dates|event\s+dates|dates\s+of\s+conference)[:\s]+([A-Za-z]+\s+\d{1,2}(?:\s*-\s*\d{1,2})?,?\s+20\d\d)",
        r"(?:held\s+on|held\s+during)[:\s]+([A-Za-z]+\s+\d{1,2}(?:\s*-\s*\d{1,2})?,?\s+20\d\d)",
    ]
    for pat in date_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            info["dates_str"] = m.group(1).strip()
            break

    # 3. Location / Venue
    venue_patterns = [
        r"(?:venue|location|held\s+at|conference\s+location)[:\s]+([^\n,]+,\s*[^\n.]+)",
    ]
    for pat in venue_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            cand = m.group(1).strip()
            if len(cand) < 80:
                info["location"] = cand
                break

    return info

