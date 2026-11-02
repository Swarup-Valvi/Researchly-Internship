"""Source adapter abstractions and base interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List
from ..core.models import RawConferenceData


class SourceAdapter(ABC):
    """Base interface for all conference data source adapters."""

    @property
    @abstractmethod
    def source_name(self) -> str:
        """Name of the source adapter."""
        pass

    @abstractmethod
    def fetch(self) -> List[RawConferenceData]:
        """Fetch raw conference records from the source."""
        pass

