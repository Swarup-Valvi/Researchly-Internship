# Third-party data and software

## ccfddl / CCF-Deadlines dataset

- **What:** conference metadata (names, acronyms, editions, dates, places, submission deadlines and time zones,
  CORE/CCF ranks, DBLP keys) read from `conference/<area>/<name>.yml`.
- **Source:** https://github.com/ccfddl/ccf-deadlines
- **Used by:** `researchly_pipeline/scrapers/ccfddl.py` (one shallow clone per changed commit); the commit SHA used
  is recorded in each record's `provenance.dataset_version`. Trimmed copies of three entries are test fixtures in
  `researchly_pipeline/tests/fixtures/ccfddl/`.
- **Note:** ranks are shown as "listed in a community-maintained dataset", not as verified CORE/CCF rankings.
- **Licence:** MIT, reproduced in full below.

```
MIT License

Copyright (c) 2021 CCFDDL

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
