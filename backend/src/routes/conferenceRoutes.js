import express from 'express';
import { store } from '../db/store.js';
import { syncEventsNow, getSchedulerStatus } from '../services/scheduler.js';

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

// POST manually trigger 12-hour LLM discovery pipeline
router.post('/sync', async (req, res) => {
  try {
    const result = await syncEventsNow();
    res.json({
      success: true,
      message: 'LLM conference discovery & credibility pipeline completed successfully.',
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

