"""Small topic taxonomy: maps common synonyms to canonical labels; unknown topics are kept (cleaned)."""
from __future__ import annotations

TAXONOMY = {
    "ml": "Machine Learning", "machine learning": "Machine Learning", "deep learning": "Deep Learning",
    "ai": "Artificial Intelligence", "artificial intelligence": "Artificial Intelligence",
    "cv": "Computer Vision", "computer vision": "Computer Vision",
    "nlp": "Natural Language Processing", "natural language processing": "Natural Language Processing",
    "computational linguistics": "Natural Language Processing",
    "security": "Security & Privacy", "cybersecurity": "Security & Privacy", "privacy": "Security & Privacy",
    "information security": "Security & Privacy",
    "hci": "Human-Computer Interaction", "human computer interaction": "Human-Computer Interaction",
    "human-computer interaction": "Human-Computer Interaction",
    "databases": "Databases", "data mining": "Data Mining", "big data": "Data Mining",
    "networking": "Networking", "computer networks": "Networking",
    "robotics": "Robotics", "software engineering": "Software Engineering",
    "systems": "Systems", "operating systems": "Systems", "distributed systems": "Systems",
    "iot": "Internet of Things", "internet of things": "Internet of Things",
    "reinforcement learning": "Reinforcement Learning", "bioinformatics": "Bioinformatics",
}


def normalize_topics(items: list[str]) -> list[str]:
    out: list[str] = []
    for raw in items or []:
        t = " ".join((raw or "").replace("_", " ").split())
        if not t:
            continue
        label = TAXONOMY.get(t.lower(), t if any(c.isupper() for c in t) else t.title())
        if label not in out:
            out.append(label)
    return out
