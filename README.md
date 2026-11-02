# Researchly.io — Phase 1: Backend Data Foundation

This repository provides the backend ingestion pipeline for **Researchly.io**, an AI-powered conference discovery, credibility verification, and submission planning platform.

## Features

- **Source Adapters**: Extensible adapter interface supporting seed fixtures, official conference websites (e.g. ICML), and directory scraping (with strict anti-bot and access control verification).
- **Canonical Normalization**: Standardized schema storing core conference attributes, dates, locations, format, publisher/organizer provenance, and data-quality warnings.
- **Conservative Deduplication**: Deterministic composite slugging (`{name}-{edition}`) preventing false merges across distinct years/editions.
- **Local Persistence**: Pluggable storage layer built on SQLite with non-destructive updates and idempotent upsert mechanics.
- **Deadline Change Tracking**: Automatically detects shifts in submission deadlines and logs audit records capturing the previous deadline, new deadline, source, and detection timestamp.
- **Credibility Intelligence Engine (Phase 2)**: Evidence-based verification system evaluating conferences across 9 categories (Domain, Organizer, Publisher, Indexing, TPC, Previous Editions, Venue/Dates, Fees, Contact) with transparent rule-based risk classification (`Low`, `Medium`, `High`, `Insufficient Evidence`).
- **Explainable Assessments**: Transparent reporting linking positive indicators, warnings, contradictions, and missing fields directly to underlying evidence citations.
- **CLI & Reporting**: Command-line interface with summary metrics, credibility reports, and graceful failure isolation.

## Directory Structure

```text
researchly.io/
├── fixtures/
│   ├── sample_conferences.json       # Representative conference fixture data
│   └── sample_evidence.json          # Independent verification and claim fixtures
├── src/
│   └── researchly/
│       ├── adapters/
│       │   ├── base.py               # Abstract SourceAdapter interface
│       │   ├── fixture_adapter.py    # Local JSON fixture loader
│       │   ├── icml_adapter.py       # Live official ICML conference adapter
│       │   └── wikicfp_adapter.py    # WikiCFP adapter (handles reachability/rules)
│       ├── core/
│       │   ├── models.py             # Pydantic schemas: Raw, Normalized, History
│       │   ├── normalizer.py         # Date parsing and field normalization
│       │   └── pipeline.py           # Ingestion orchestrator
│       ├── credibility/
│       │   ├── models.py             # Evidence, Finding, and Assessment models
│       │   ├── collector.py          # Evidence extraction and claim tagging
│       │   ├── engine.py             # Rule-based credibility evaluation engine
│       │   └── service.py            # Public service interface for API/UI
│       ├── storage/
│       │   └── repository.py         # SQLite persistence for conferences, evidence, and assessments
│       └── cli.py                    # CLI entrypoint with assessment support
├── sanity_check.py                   # Phase 1 Ingestion sanity check suite
├── targeted_checks.py                # Targeted Phase 1 hardening checks
├── sanity_check_phase2.py            # Phase 2 Credibility intelligence check suite
└── README.md
```

## Running the Pipeline and Credibility Assessments

Before executing, ensure the user's Conda environment (`/opt/anaconda3/envs/py310`) is used:

```bash
# 1. Ingest conferences and run credibility assessments for all stored records
PYTHONPATH=src /opt/anaconda3/envs/py310/bin/python -m researchly.cli --with-live --assess all

# 2. Assess credibility for a specific conference
PYTHONPATH=src /opt/anaconda3/envs/py310/bin/python -m researchly.cli --assess icml-2026

# 3. Run Phase 2 Credibility verification checks
PYTHONPATH=src /opt/anaconda3/envs/py310/bin/python sanity_check_phase2.py

# 4. Run Phase 1 Ingestion verification checks
PYTHONPATH=src /opt/anaconda3/envs/py310/bin/python sanity_check.py
```

