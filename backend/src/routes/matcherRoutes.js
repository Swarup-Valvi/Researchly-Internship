import express from 'express';
import { matchPaperToConferences } from '../services/matchingEngine.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { title, abstract, keywords, region, format } = req.body;

    if (!title && !abstract) {
      return res.status(400).json({
        success: false,
        error: 'Please provide at least a paper Title or Abstract for AI matching.'
      });
    }

    const matchResults = await matchPaperToConferences({
      title,
      abstract,
      keywords: Array.isArray(keywords) ? keywords : (keywords ? keywords.split(',').map(s => s.trim()) : []),
      region: region || 'All',
      format: format || 'All'
    });

    res.json({
      success: true,
      data: matchResults
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

