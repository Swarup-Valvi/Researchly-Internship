# Database migrations

SQL in this folder is **never run by the app**. Apply it yourself, **in numeric order (001, 002, then 003)**, against your
Supabase project. A fresh install from `backend/schema.sql` already matches 001 + 002 + 003; the migrations are for databases
created from an older `schema.sql`.

| File | What it does |
|---|---|
| `001_pipeline_fields.sql` | Adds the pipeline/provenance columns written by `mapPipelineRecord` (and the aggregate `committee_summary`) to `public.conferences`; removes the invented defaults `credibility_score 90` and `ranking 'Core A*'` (both now nullable, no default); sets `risk_level` default to `'Not assessed'`. |
| `002_credibility_audits.sql` | Makes `credibility_audits.overall_score` and all nine dimension scores nullable with no default (no more 85-95 defaults), and adds `engine_version`, `coverage`, `checks` (jsonb) and `limitations` (jsonb). |
| `003_ccfddl_fields.sql` | Adds `conferences.dblp_key` (text), `ranking_claims` (jsonb, default `[]`), `deadline_at` (timestamptz, set only when the deadline's time zone is known) and `deadline_precision` (`datetime`/`date`). |

## How to apply

**Supabase dashboard:** SQL Editor → New query → paste the file → Run. It runs in one transaction and is
idempotent (`ADD COLUMN IF NOT EXISTS`), so re-running it is harmless.

**psql:** use the connection string from Settings → Database:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f backend/migrations/001_pipeline_fields.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f backend/migrations/002_credibility_audits.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f backend/migrations/003_ccfddl_fields.sql
```

Each file runs in its own transaction and is idempotent, so a partial run can simply be repeated.

**Before production:** run it on a branch/staging project first, and take a backup (Database → Backups).

## Check it worked

```sql
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'conferences'
order by ordinal_position;
```

`credibility_score` and `ranking` should show no default and `is_nullable = YES`; `risk_level` should default to
`'Not assessed'`; the 19 pipeline columns (`slug` … `committee_summary`) should be listed.

```sql
-- 002: no score column may be NOT NULL or carry a default; the four evidence columns must exist
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'credibility_audits'
  and (column_name like '%score' or column_name in ('engine_version', 'coverage', 'checks', 'limitations'))
order by column_name;

-- should return 0 rows:
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'credibility_audits'
  and column_name like '%score' and (column_default is not null or is_nullable = 'NO');

-- 003: both columns exist
select column_name, data_type, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'conferences' and column_name in ('dblp_key', 'ranking_claims', 'deadline_at', 'deadline_precision');

-- RLS is unchanged (both tables still have it enabled):
select relname, relrowsecurity from pg_class where relname in ('conferences', 'credibility_audits');
```

## Existing rows (optional, your decision)

Rows inserted before these migrations may hold the old defaults (`credibility_score = 90`, `ranking = 'Core A*'`,
`risk_level = 'Low'`, audit dimension scores of 85-95) that were never computed. The migration does **not** touch data. If you want to clear values
that no audit produced, review them first, for example:

```sql
select id, name, credibility_score, ranking, risk_level from public.conferences
where id not in (select conference_id from public.credibility_audits);
```

The next audit run (`reauditAll`) rewrites `credibility_score` / `risk_level` for every stored conference.

## Privacy

There is no column for program-committee member names or affiliations, by design. They are used only in memory during
an audit; only aggregate counts are stored in `committee_summary`.
