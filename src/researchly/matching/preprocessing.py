"""Text preprocessing utilities for matching.

Handles tokenization, stopword removal, and stemming using only Python stdlib
and numpy (no scikit-learn or NLTK dependency).
"""

from __future__ import annotations

import re
import math
from typing import List, Set

# Lightweight English stopword list (sufficient for academic text matching)
_STOPWORDS: Set[str] = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "shall", "should", "may", "might", "can", "could", "must", "about",
    "above", "after", "again", "against", "all", "am", "any", "because",
    "before", "below", "between", "both", "during", "each", "few", "further",
    "here", "how", "i", "if", "into", "it", "its", "just", "me", "more",
    "most", "my", "no", "nor", "not", "now", "only", "other", "our", "out",
    "over", "own", "same", "she", "so", "some", "such", "than", "that",
    "their", "them", "then", "there", "these", "they", "this", "those",
    "through", "too", "under", "until", "up", "very", "we", "what", "when",
    "where", "which", "while", "who", "whom", "why", "you", "your",
    "also", "as", "he", "her", "him", "his", "if", "its",
    # Academic filler words
    "paper", "propose", "proposed", "present", "presented", "using", "based",
    "method", "methods", "approach", "approaches", "results", "show", "shows",
    "study", "studies", "work", "works", "new", "novel", "recent", "use",
}

# Simple suffix-stripping stemmer (Porter-lite)
_SUFFIX_RULES = [
    ("ational", "ate"), ("tional", "tion"), ("enci", "ence"), ("anci", "ance"),
    ("izer", "ize"), ("isation", "ize"), ("ization", "ize"),
    ("ation", "ate"), ("ator", "ate"),
    ("alism", "al"), ("iveness", "ive"), ("fulness", "ful"),
    ("ousness", "ous"), ("aliti", "al"), ("iviti", "ive"),
    ("biliti", "ble"), ("ibility", "ible"),
    ("ness", ""), ("ment", ""), ("ing", ""), ("ings", ""),
    ("tion", "t"), ("sion", "s"),
    ("ies", "y"), ("ive", ""),
    ("ly", ""), ("er", ""), ("ed", ""),
    ("es", ""), ("s", ""),
]


def simple_stem(word: str) -> str:
    """Apply lightweight suffix stripping to approximate stemming.
    
    Not a full Porter stemmer, but sufficient for matching academic terms
    like 'learning' -> 'learn', 'recognition' -> 'recognit'.
    """
    if len(word) <= 3:
        return word
    for suffix, replacement in _SUFFIX_RULES:
        if word.endswith(suffix) and len(word) - len(suffix) + len(replacement) >= 3:
            return word[:-len(suffix)] + replacement
            break
    return word


def tokenize(text: str) -> List[str]:
    """Tokenize text into lowercase alphanumeric tokens, removing stopwords and applying stemming."""
    if not text:
        return []
    # Lowercase and split on non-alphanumeric characters
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    # Remove stopwords, very short tokens, and pure numbers
    filtered = [t for t in tokens if t not in _STOPWORDS and len(t) > 1 and not t.isdigit()]
    # Apply lightweight stemming
    return [simple_stem(t) for t in filtered]


def build_document_text(
    name: str = "",
    title: str = "",
    topics: List[str] = None,
    location: str = "",
    publisher: str = "",
    organizer: str = "",
) -> str:
    """Combine conference fields into a single text document for TF-IDF.
    
    Topics are weighted by repeating them (they are the most important signal).
    """
    parts = []
    if name:
        # Conference acronym is important — repeat it
        parts.append(name)
        parts.append(name)
    if title:
        parts.append(title)
    if topics:
        # Topics are the primary matching signal — repeat for emphasis
        topic_text = " ".join(topics)
        parts.append(topic_text)
        parts.append(topic_text)
        parts.append(topic_text)
    if publisher:
        parts.append(publisher)
    if organizer:
        parts.append(organizer)
    if location:
        parts.append(location)
    return " ".join(parts)


def build_paper_text(
    title: str = "",
    abstract: str = "",
    keywords: List[str] = None,
    research_domain: str = "",
) -> str:
    """Combine paper fields into a single text document for TF-IDF.
    
    Keywords and title are weighted by repetition.
    """
    parts = []
    if title:
        parts.append(title)
        parts.append(title)
    if abstract:
        parts.append(abstract)
    if keywords:
        kw_text = " ".join(keywords)
        parts.append(kw_text)
        parts.append(kw_text)
        parts.append(kw_text)
    if research_domain:
        parts.append(research_domain)
        parts.append(research_domain)
    return " ".join(parts)

