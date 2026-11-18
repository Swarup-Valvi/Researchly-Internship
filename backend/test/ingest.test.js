import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import express from 'express';
import { store } from '../src/db/store.js';
import { config } from '../src/config/env.js';
import { ingestRecords, mapPipelineRecord, validatePipelineRecord } from '../src/services/ingestService.js';
import conferenceRoutes from '../src/routes/conferenceRoutes.js';

const SAMPLE = JSON.parse(fs.readFileSync(new URL('../../researchly_pipeline/storage/output/conferences.sample.json', import.meta.url)));

test('pipeline sample validates and maps to the store shape with provenance', () => {
  for (const r of SAMPLE) assert.deepEqual(validatePipelineRecord(r), []);
  const ieee = SAMPLE.find((r) => r.provenance.primary_source === 'ieee');
  const m = mapPipelineRecord(ieee);
  assert.equal(m.data_origin, 'pipeline');
  assert.equal(m.submission_deadline, '2027-01-20');
  assert.equal(m.location, 'Lisbon, Portugal');
  assert.equal(m.city, 'Lisbon');
  assert.equal(m.country, 'Portugal');
  assert.ok(m.source_urls.length >= 2);
  assert.equal(m.sponsors_verified_source, 'https://www.ieee.org/conferences/');
});

test('ingest creates, audits from evidence, and flags the red-flag record High', async () => {
  const res = await ingestRecords(SAMPLE, { live: false });
  assert.equal(res.created, SAMPLE.length); assert.deepEqual(res.rejected, []);
  const gcir = (await store.getConferences({})).find((c) => c.title === 'Global Congress of Innovative Research');
  assert.equal(gcir.risk_level, 'High');
  const audit = await store.getCredibilityAudit(gcir.id);
  assert.ok(audit.contradictions.some((x) => /pay-to-publish|guaranteed/i.test(x)));
  const icals = (await store.getConferences({})).find((c) => /Applied Learning/.test(c.title));
  assert.notEqual(icals.risk_level, 'High');
  assert.equal(icals.data_origin, 'pipeline');
});

test('re-ingest with a moved deadline records deadline drift; garbage is rejected', async () => {
  const rec = structuredClone(SAMPLE.find((r) => r.canonical_name.includes('Applied Learning')));
  rec.dates.submission_deadline = '2027-02-10';
  const res = await ingestRecords([rec, { conference_id: 'nope' }], { live: false });
  assert.equal(res.updated, 1); assert.equal(res.deadline_changes, 1); assert.equal(res.rejected.length, 1);
  const id = mapPipelineRecord(rec).id;
  const hist = await store.getDeadlineHistory(id);
  assert.equal(hist[0].previous_deadline, '2027-01-20'); assert.equal(hist[0].new_deadline, '2027-02-10');
});

test('a conference saved without a score is "Not assessed", not 85/Low', async () => {
  const c = await store.saveConference({ name: 'ZZTEST', edition: '2099' });
  assert.equal(c.credibility_score, null); assert.equal(c.risk_level, 'Not assessed');
});

test('POST /ingest requires the token (and is disabled when unset)', async () => {
  const app = express(); app.use(express.json()); app.use('/api/conferences', conferenceRoutes);
  const server = http.createServer(app); await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/api/conferences/ingest`;
  const post = (headers) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '[]' });
  try {
    config.ingestToken = '';
    assert.equal((await post({})).status, 503);
    config.ingestToken = 'secret-token';
    assert.equal((await post({})).status, 401);
    assert.equal((await post({ 'x-ingest-token': 'wrong-token!' })).status, 401);
    assert.equal((await post({ 'x-ingest-token': 'secret-token' })).status, 200);
  } finally { server.close(); }
});
