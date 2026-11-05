import express from 'express';
import { store } from '../db/store.js';
import { evaluateConferenceCredibility } from '../services/credibilityEngine.js';

const router = express.Router();

// GET credibility audit by conference id
router.get('/:conferenceId', async (req, res) => {
  try {
    const { conferenceId } = req.params;
    let audit = await store.getCredibilityAudit(conferenceId);

    if (!audit) {
      const conf = await store.getConferenceById(conferenceId);
      if (conf) {
        audit = evaluateConferenceCredibility(conf);
        await store.saveCredibilityAudit(audit);
      }
    }

    if (!audit) {
      return res.status(404).json({ success: false, error: 'Credibility audit record not found' });
    }

    res.json({
      success: true,
      data: audit
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST re-evaluate or audit a custom conference
router.post('/evaluate', async (req, res) => {
  try {
    const confData = req.body;
    if (!confData || !confData.name) {
      return res.status(400).json({ success: false, error: 'Conference data with at least name is required' });
    }

    const audit = evaluateConferenceCredibility(confData);
    res.json({
      success: true,
      data: audit
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

