-- 005_evidence.sql
-- One JSONB column holding the evidence the pipeline gathered for the credibility engine (written by
-- ingestService.buildEvidence): ccfddl series years, quote-verified organizer / peer-review / fee statements,
-- risk phrases with verbatim quotes, the pages read, and live lookup results (DBLP SPARQL, RDAP, OpenAlex
-- AGGREGATE counts only; never committee names).
-- Idempotent. Apply AFTER 004. Run it yourself (see README.md).

BEGIN;

ALTER TABLE public.conferences
    ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '{}'::JSONB;

COMMIT;
