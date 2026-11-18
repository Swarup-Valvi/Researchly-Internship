-- 001_pipeline_fields.sql
-- Adds the columns that ingestService.mapPipelineRecord() writes to public.conferences, plus the aggregate
-- committee summary written by the audit, and removes defaults that invented a score/ranking.
-- Idempotent: safe to run more than once. Run it yourself (see README.md); the app never runs migrations.
--
-- PRIVACY: there is deliberately NO column for committee member names/affiliations. Only the aggregate
-- `committee_summary` (counts such as {"looked_up":9,"institution_matches":7}) is stored.

BEGIN;

-- 1. Pipeline / provenance columns used by mapPipelineRecord ------------------------------------------------
ALTER TABLE public.conferences
    ADD COLUMN IF NOT EXISTS slug                     TEXT,
    ADD COLUMN IF NOT EXISTS edition_number           INTEGER,
    ADD COLUMN IF NOT EXISTS notification_date        DATE,
    ADD COLUMN IF NOT EXISTS camera_ready             DATE,
    ADD COLUMN IF NOT EXISTS venue                    TEXT,
    ADD COLUMN IF NOT EXISTS data_origin              TEXT,            -- 'pipeline' | 'curated_seed'
    ADD COLUMN IF NOT EXISTS needs_verification       BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS source_primary           TEXT,            -- ieee | acm | springer | individual | wikicfp
    ADD COLUMN IF NOT EXISTS source_urls              TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS pipeline_confidence      REAL,
    ADD COLUMN IF NOT EXISTS extraction_method        TEXT,            -- structured | heuristic | llm_assisted
    ADD COLUMN IF NOT EXISTS scraped_at               TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS raw_snapshot_ref         TEXT,
    ADD COLUMN IF NOT EXISTS indexing_claims          JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS sponsors_claimed         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS sponsors_verified_source TEXT,
    ADD COLUMN IF NOT EXISTS claim_snippets           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS pipeline_conference_id   TEXT,
    ADD COLUMN IF NOT EXISTS committee_summary        JSONB;           -- aggregate counts only, never names

CREATE UNIQUE INDEX IF NOT EXISTS conferences_slug_key ON public.conferences (slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS conferences_pipeline_conference_id_idx ON public.conferences (pipeline_conference_id);

-- 2. No invented scores: a conference without an audit has no score and is "Not assessed" ---------------------
ALTER TABLE public.conferences ALTER COLUMN credibility_score DROP DEFAULT;
ALTER TABLE public.conferences ALTER COLUMN credibility_score DROP NOT NULL;
ALTER TABLE public.conferences ALTER COLUMN ranking DROP DEFAULT;
ALTER TABLE public.conferences ALTER COLUMN ranking DROP NOT NULL;
ALTER TABLE public.conferences ALTER COLUMN risk_level SET DEFAULT 'Not assessed';

COMMIT;
