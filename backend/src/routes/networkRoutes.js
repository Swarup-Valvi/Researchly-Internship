import express from 'express';
import { store } from '../db/store.js';
import { getSupabase, isSupabaseReady } from '../db/supabase.js';

const router = express.Router();

// Helper to extract caller user context
async function getCurrentUserContext(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) {
          const { data: profile } = await supabase.from('profiles').select('id, interests').eq('id', user.id).maybeSingle();
          return {
            id: user.id,
            interests: profile?.interests || []
          };
        }
      } catch (e) {
        console.warn('[Network] User context error:', e.message);
      }
    }

    // Local profile fallback
    const localUser = store.getLocalProfile(token);
    if (localUser) {
      return {
        id: localUser.id,
        interests: localUser.interests || []
      };
    }
  }
  return { id: null, interests: [] };
}

// GET all researchers & interest-based recommendations
router.get('/colleagues', async (req, res) => {
  try {
    const userCtx = await getCurrentUserContext(req);
    const colleagues = await store.getResearchers(userCtx.id, userCtx.interests);
    
    // Top recommended: high similarity score and not yet connected
    const recommendations = colleagues
      .filter(c => c.connection_status === 'none' && (c.similarity_score || 0) >= 50)
      .slice(0, 4);

    res.json({
      success: true,
      data: colleagues,
      recommendations
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET pending incoming requests for the caller
router.get('/requests', async (req, res) => {
  try {
    const userCtx = await getCurrentUserContext(req);
    const requests = await store.getPendingRequests(userCtx.id);
    res.json({
      success: true,
      data: requests
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST send connection request
router.post('/request/:id', async (req, res) => {
  try {
    const userCtx = await getCurrentUserContext(req);
    const { message } = req.body;
    const updated = await store.sendConnectionRequest(userCtx.id, req.params.id, message);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Researcher not found' });
    }
    res.json({
      success: true,
      message: 'Connection request sent successfully.',
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST accept incoming connection request
router.post('/accept/:id', async (req, res) => {
  try {
    const userCtx = await getCurrentUserContext(req);
    const updated = await store.acceptConnectionRequest(userCtx.id, req.params.id);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }
    res.json({
      success: true,
      message: 'Connection accepted.',
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST reject / decline connection request
router.post('/reject/:id', async (req, res) => {
  try {
    const userCtx = await getCurrentUserContext(req);
    const updated = await store.rejectConnectionRequest(userCtx.id, req.params.id);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }
    res.json({
      success: true,
      message: 'Connection request declined.',
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST disconnect
router.post('/disconnect/:id', async (req, res) => {
  try {
    const userCtx = await getCurrentUserContext(req);
    const updated = await store.disconnectResearcher(userCtx.id, req.params.id);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Researcher not found' });
    }
    res.json({
      success: true,
      message: 'Disconnected successfully.',
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET academic communities
router.get('/communities', async (req, res) => {
  try {
    const communities = await store.getCommunities();
    res.json({
      success: true,
      data: communities
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
