# Researchly backend

Express API + evidence-based credibility engine. Conference records arrive from `researchly_pipeline` through
`POST /api/conferences/ingest` (header `x-ingest-token: $INGEST_TOKEN`); see the root README for setup.

## Environment (`.env.example`)

| Variable | Purpose |
|---|---|
| `INGEST_TOKEN` | Required for `POST /api/conferences/ingest` (endpoint disabled when unset). |
| `ENABLE_LIVE_CHECKS` | `true` = DBLP, RDAP and OpenAlex (committee) lookups during audits. Default off. |
| `OPENALEX_MAILTO` | Optional contact for OpenAlex's polite pool; sent only when set. |
| `ENABLE_CURATED_SEED` | `true` (default) also serves the 27 hand-entered seed conferences; `false` = pipeline data only. |
| `GEMINI_API_KEY` | LLM key (backend LLM features; the pipeline's grounded enrichment reads the same variable). |
| `ENABLE_LLM_ENRICHMENT`, `MAX_ENRICH_PER_RUN` | Pipeline enrichment switches (listed so one `.env` can serve both). |

## Credibility engine (`src/services/credibilityEngine.js`)

Scores only checks that ran; anything that could not be checked is `not_checked` and excluded. Relevant checks for
ccfddl data:

- `rank_listing`: **pass** when a CORE/CCF rank is in `ranking_claims` from the ccfddl dataset. Evidence kind
  `community_dataset`, URL = the dataset file. Wording: *listed in a community-maintained dataset, not verified
  against CORE's own site*. `not_checked` when absent.
- `dblp_presence` (live only): uses the record's `dblp_key` when present (match = DBLP venue URL
  `/db/conf/<key>/`), otherwise the name/acronym search.
- `scopus_wos_verification`: always `not_checked`. Indexing *claims* (from a site or from LLM enrichment) are never
  turned into a verified status.
- `committee_verification`: OpenAlex name/affiliation sampling; aggregates only (see migrations README, Privacy).

## Data

`mapPipelineRecord` (src/services/ingestService.js) maps pipeline records, including `dblp_key` and
`ranking_claims`. Committee names are never mapped or stored. Database changes are in `migrations/` (apply
001 → 002 → 003 → 004 → 005 → 006); `schema.sql` matches them for fresh installs.

## Cutover to live data

See the root README, "Cutover from the hand-entered list to live data" (`ENABLE_CURATED_SEED=false`).

## Tests

```bash
npm test     # node --test; all network calls are mocked
```
