-- 004_location_fields.sql
-- Additive columns written by ingestService.mapPipelineRecord so the Discover page can filter by country
-- without re-parsing the display string `location`:
--   city     city as extracted by the pipeline (NULL when not stated or multi-site)
--   country  country as extracted by the pipeline (NULL when not stated; never guessed)
-- Idempotent. Apply AFTER 003. Run it yourself (see README.md).

BEGIN;

ALTER TABLE public.conferences
    ADD COLUMN IF NOT EXISTS city    TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT;

COMMIT;
