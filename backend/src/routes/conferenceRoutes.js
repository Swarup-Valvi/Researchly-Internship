import express from 'express';
import { store } from '../db/store.js';
import crypto from 'node:crypto';
import { syncEventsNow, getSchedulerStatus } from '../services/scheduler.js';
import { ingestRecords } from '../services/ingestService.js';
import { config } from '../config/env.js';

const router = express.Router();

// GET all conferences with filters
router.get('/', async (req, res) => {
  try {
    const { search, field, format, risk, status, event_type } = req.query;
    const conferences = await store.getConferences({ search, field, format, risk, status, event_type });
    res.json({
      success: true,
      count: conferences.length,
      data: conferences
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET sync status
router.get('/sync/status', (req, res) => {
  res.json({
    success: true,
    data: getSchedulerStatus()
  });
});

// POST pipeline output (used by the scheduled GitHub Actions). Protected by INGEST_TOKEN.
// Storing + auditing a full batch takes minutes, so the request only validates and queues the batch, answers
// 202 with a job id at once, and processes in the background. Poll GET /ingest/status for the outcome.
function checkIngestToken(req, res) {
  if (!config.ingestToken) {
    res.status(503).json({ success: false, error: 'Ingest endpoint disabled: INGEST_TOKEN is not configured' });
    return false;
  }
  const given = Buffer.from(String(req.get('x-ingest-token') || ''));
  const want = Buffer.from(config.ingestToken);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    res.status(401).json({ success: false, error: 'Invalid ingest token' });
    return false;
  }
  return true;
}

let ingestJob = null;   // { id, state: 'running'|'done'|'failed', received, started_at, finished_at, result?, error? }

router.post('/ingest', async (req, res) => {
  if (!checkIngestToken(req, res)) return;
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ success: false, error: 'expected an array of conference records' });
  }
  if (ingestJob?.state === 'running') {
    return res.status(409).json({ success: false, error: 'An ingest is already running', data: ingestJob });
  }
  const job = { id: crypto.randomUUID(), state: 'running', received: req.body.length, started_at: new Date().toISOString() };
  ingestJob = job;
  const records = req.body;
  setImmediate(async () => {
    try {
      job.result = await ingestRecords(records);
      job.state = 'done';
    } catch (err) {
      job.state = 'failed';
      job.error = err.message;
    } finally {
      job.finished_at = new Date().toISOString();
      console.log(`[Ingest] job ${job.id} ${job.state}: ${job.error || JSON.stringify({ ...job.result, rejected: job.result?.rejected?.length })}`);
    }
  });
  res.status(202).json({ success: true, data: job });
});

// GET status of the latest ingest job
router.get('/ingest/status', (req, res) => {
  if (!checkIngestToken(req, res)) return;
  if (!ingestJob) return res.json({ success: true, data: { state: 'idle' } });
  const { result, ...rest } = ingestJob;
  res.json({ success: true, data: { ...rest, result: result && { ...result, rejected: result.rejected?.length ?? 0 } } });
});

// POST manually trigger pipeline import + re-audit
router.post('/sync', async (req, res) => {
  try {
    const result = await syncEventsNow();
    res.json({
      success: true,
      message: 'Pipeline import and credibility re-audit completed.',
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET conference detail by id or slug
router.get('/:id', async (req, res) => {
  try {
    const conf = await store.getConferenceById(req.params.id);
    if (!conf) {
      return res.status(404).json({ success: false, error: 'Conference not found' });
    }

    const audit = await store.getCredibilityAudit(conf.id);
    const deadlineHistory = await store.getDeadlineHistory(conf.id);

    res.json({
      success: true,
      data: {
        ...conf,
        credibility_audit: audit,
        deadline_history: deadlineHistory
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create custom conference
router.post('/', async (req, res) => {
  try {
    const created = await store.saveConference(req.body);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

