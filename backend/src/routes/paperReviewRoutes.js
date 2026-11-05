import express from 'express';
import multer from 'multer';
import { store } from '../db/store.js';
import { reviewResearchPaper } from '../services/llmService.js';

const router = express.Router();
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// GET user's previous paper reviews
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    const reviews = await store.getPaperReviews(userId || 'current-user');
    res.json({
      success: true,
      count: reviews.length,
      data: reviews
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST review paper draft with LLM (supports text body or uploaded file)
router.post('/analyze', upload.single('paper_file'), async (req, res) => {
  try {
    let title = req.body.title;
    let abstract = req.body.abstract;
    let fullText = req.body.full_text || req.body.fullText || '';

    // If a file was uploaded, extract its text content
    if (req.file) {
      const fileBuffer = req.file.buffer.toString('utf-8');
      if (!title) {
        title = req.file.originalname.replace(/\.[^/.]+$/, '');
      }
      if (!fullText) {
        fullText = fileBuffer;
      }
      if (!abstract && fileBuffer.length > 50) {
        abstract = fileBuffer.substring(0, 500);
      }
    }

    if (!title && !abstract && !fullText) {
      return res.status(400).json({
        success: false,
        error: 'Please provide at least a paper Title, Abstract, or full paper text/file.'
      });
    }

    console.log(`[PaperReview] Initiating LLM peer review for: "${title || 'Untitled'}"`);
    const reviewResult = await reviewResearchPaper({
      title: title || 'Novel Deep Learning Framework',
      abstract: abstract || 'We propose a novel architecture with linear complexity.',
      fullText
    });

    const saved = await store.savePaperReview({
      title: title || 'Novel Deep Learning Framework',
      abstract: abstract || '',
      full_text: fullText,
      ...reviewResult
    });

    res.json({
      success: true,
      message: 'Paper review completed.',
      data: saved
    });
  } catch (err) {
    console.error('[PaperReview] Error during review:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

