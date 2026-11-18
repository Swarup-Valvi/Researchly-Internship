-- 003_ccfddl_fields.sql
-- Additive columns for the ccfddl dataset source (written by ingestService.mapPipelineRecord):
--   dblp_key        DBLP venue key from the dataset (e.g. 'aaai' -> dblp.org/db/conf/aaai/); used by the DBLP lookup
--   ranking_claims  [{system, value, source_url}] as listed in the community dataset; claims, never verified ranks
--   deadline_at     exact submission deadline instant, ONLY when the time zone is known (else NULL)
--   deadline_precision 'datetime' | 'date': a 'date' deadline must never be displayed as a precise time
-- Idempotent. Apply AFTER 001 and 002. Run it yourself (see README.md).

BEGIN;

ALTER TABLE public.conferences
    ADD COLUMN IF NOT EXISTS dblp_key       TEXT,
    ADD COLUMN IF NOT EXISTS ranking_claims JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deadline_precision TEXT;

COMMIT;
