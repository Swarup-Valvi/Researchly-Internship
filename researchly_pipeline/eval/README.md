# Credibility-engine evaluation set

`score.py` measures how well the backend credibility engine (run offline, no live lookups) separates conferences you
have labelled. It prints precision / recall / F1 for the **High-risk** class and the **"Insufficient evidence"** rate.

## Setup

```bash
cp eval/labelled.example.csv eval/labelled.csv   # labelled.csv is git-ignored: it stays on your machine
python eval/score.py                             # or: --labels <file> --records <conferences.json>
```

Columns: `conference, url, label, label_source, notes`

- `url` must equal the `website_url` the pipeline scraped for that conference (rows without a pipeline record are
  listed but not scored, so scrape them first).
- `label` is `legit` or `risky`. Rows labelled `PLACEHOLDER` are skipped.
- `label_source` is **required**: where the label comes from (e.g. a CORE ranking page, a published report, your
  own documented review). Rows without one are rejected.

## Labels about real organisers: source them and keep them private

A `risky` label attached to a real conference or organiser is a serious statement about real people and organisations.

- **Every label needs a verifiable source** in `label_source`. Do not label from memory, rumour or the conference's
  name, and never from this engine's own output (that would make the evaluation circular).
- **Keep `labelled.csv` private.** It is in `.gitignore`; do not commit it, paste it into issues/PRs, upload it as a
  CI artifact, or share it outside the people doing the evaluation. Only `labelled.example.csv` (placeholders) is
  committed.
- Treat the results as an internal measure of the engine, not as a public list of "bad" venues. The engine produces
  *risk indicators*, not verdicts.
