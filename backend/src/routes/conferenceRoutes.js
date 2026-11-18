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

// POST pipeline output (used by the scheduled GitHub Action). Protected by INGEST_TOKEN.
router.post('/ingest', async (req, res) => {
  if (!config.ingestToken) {
    return res.status(503).json({ success: false, error: 'Ingest endpoint disabled: INGEST_TOKEN is not configured' });
  }
  const given = Buffer.from(String(req.get('x-ingest-token') || ''));
  const want = Buffer.from(config.ingestToken);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    return res.status(401).json({ success: false, error: 'Invalid ingest token' });
  }
  try {
    const result = await ingestRecords(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
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

