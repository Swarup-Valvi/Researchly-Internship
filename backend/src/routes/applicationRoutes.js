import express from 'express';
import { store } from '../db/store.js';

const router = express.Router();

// GET all applications
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    const apps = await store.getApplications(userId || 'current-user');
    res.json({
      success: true,
      count: apps.length,
      data: apps
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create application
router.post('/', async (req, res) => {
  try {
    const { conference_id, conference_name, paper_title, abstract, status, target_deadline, co_authors, notes, userId } = req.body;
    
    if (!paper_title) {
      return res.status(400).json({ success: false, error: 'Paper title is required' });
    }

    const created = await store.createApplication({
      user_id: userId || 'current-user',
      conference_id,
      conference_name: conference_name || 'Target Conference',
      paper_title,
      abstract,
      status: status || 'Bookmarked',
      target_deadline,
      co_authors,
      notes
    });

    res.status(201).json({
      success: true,
      data: created
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH update status or details (Kanban drag-and-drop)
router.patch('/:id', async (req, res) => {
  try {
    const updated = await store.updateApplication(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Application entry not found' });
    }

    res.json({
      success: true,
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE application
router.delete('/:id', async (req, res) => {
  try {
    const success = await store.deleteApplication(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Application entry not found' });
    }

    res.json({
      success: true,
      message: 'Application entry deleted.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

