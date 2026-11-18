-- 002_credibility_audits.sql
-- Makes public.credibility_audits match what credibilityEngine.evaluateConferenceCredibility() returns:
--   * no invented scores: overall_score and every dimension score are nullable with NO default
--     (an unchecked dimension is NULL, "Not enough evidence", never 85-95);
--   * adds the evidence fields the engine produces: checks, coverage, limitations, engine_version.
-- Idempotent. Apply AFTER 001_pipeline_fields.sql. Run it yourself (see README.md).

BEGIN;

ALTER TABLE public.credibility_audits ALTER COLUMN overall_score DROP NOT NULL;

ALTER TABLE public.credibility_audits ALTER COLUMN domain_score    DROP DEFAULT;
ALTER TABLE public.credibility_audits ALTER COLUMN organizer_score DROP DEFAULT;
ALTER TABLE public.credibility_audits ALTER COLUMN publisher_score DROP DEFAULT;
ALTER TABLE public.credibility_audits ALTER COLUMN indexing_score  DROP DEFAULT;
ALTER TABLE public.credibility_audits ALTER COLUMN tpc_score       DROP DEFAULT;
ALTER TABLE public.credibility_audits ALTER COLUMN history_score   DROP DEFAULT;
ALTER TABLE public.credibility_audits ALTER COLUMN venue_score     DROP DEFAULT;
ALTER TABLE public.credibility_audits ALTER COLUMN fee_score       DROP DEFAULT;
ALTER TABLE public.credibility_audits ALTER COLUMN editorial_score DROP DEFAULT;
-- (dimension score columns were already nullable; DROP NOT NULL is a no-op kept for safety)
ALTER TABLE public.credibility_audits ALTER COLUMN domain_score    DROP NOT NULL;
ALTER TABLE public.credibility_audits ALTER COLUMN organizer_score DROP NOT NULL;
ALTER TABLE public.credibility_audits ALTER COLUMN publisher_score DROP NOT NULL;
ALTER TABLE public.credibility_audits ALTER COLUMN indexing_score  DROP NOT NULL;
ALTER TABLE public.credibility_audits ALTER COLUMN tpc_score       DROP NOT NULL;
ALTER TABLE public.credibility_audits ALTER COLUMN history_score   DROP NOT NULL;
ALTER TABLE public.credibility_audits ALTER COLUMN venue_score     DROP NOT NULL;
ALTER TABLE public.credibility_audits ALTER COLUMN fee_score       DROP NOT NULL;
ALTER TABLE public.credibility_audits ALTER COLUMN editorial_score DROP NOT NULL;

ALTER TABLE public.credibility_audits
    ADD COLUMN IF NOT EXISTS engine_version TEXT,
    ADD COLUMN IF NOT EXISTS coverage       NUMERIC(4,2),                     -- 0.00-1.00, weight of dimensions checked
    ADD COLUMN IF NOT EXISTS checks         JSONB NOT NULL DEFAULT '[]'::JSONB, -- [{id,dimension,label,status,detail,evidence}]
    ADD COLUMN IF NOT EXISTS limitations    JSONB NOT NULL DEFAULT '[]'::JSONB;

COMMIT;
