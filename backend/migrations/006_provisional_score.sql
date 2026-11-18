-- 006_provisional_score.sql
-- credibility_audits.provisional_score: the weighted figure computed when evidence coverage is BELOW the 0.30
-- threshold. In that case overall_score is NULL (no result) and the UI may show this number only labelled
-- "provisional". NULL whenever coverage meets the threshold.
-- Idempotent. Apply AFTER 005. Run it yourself (see README.md).

BEGIN;

ALTER TABLE public.credibility_audits
    ADD COLUMN IF NOT EXISTS provisional_score INTEGER;

COMMIT;
