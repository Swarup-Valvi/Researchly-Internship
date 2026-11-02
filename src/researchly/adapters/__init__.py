"""Adapters package."""

from .base import SourceAdapter
from .fixture_adapter import FixtureAdapter
from .icml_adapter import ICMLOfficialAdapter
from .official_site_adapter import OfficialSiteAdapter, OfficialSiteConfig
from .openreview_adapter import OpenReviewAdapter
from .openalex_adapter import OpenAlexMetadataAdapter
from .crossref_adapter import CrossrefMetadataAdapter
from .wikicfp_adapter import WikiCFPAdapter
from .society_adapter import SocietyDirectoryAdapter
from .dblp_adapter import DBLPMetadataAdapter
from .generic_event_adapter import GenericEventAdapter
from .public_cfp_feed import PublicCFPFeedAdapter

__all__ = [
    "SourceAdapter",
    "FixtureAdapter",
    "ICMLOfficialAdapter",
    "OfficialSiteAdapter",
    "OfficialSiteConfig",
    "OpenReviewAdapter",
    "OpenAlexMetadataAdapter",
    "CrossrefMetadataAdapter",
    "WikiCFPAdapter",
    "SocietyDirectoryAdapter",
    "DBLPMetadataAdapter",
    "GenericEventAdapter",
    "PublicCFPFeedAdapter",
]

