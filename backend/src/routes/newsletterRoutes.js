import express from 'express';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { getSupabase, isSupabaseReady } from '../db/supabase.js';
import { getCurrentUserContext } from '../services/userContext.js';
import { buildDigest, gatherDigestData, sendWeeklyDigests } from '../services/newsletter.js';

const router = express.Router();
const UUID_RX = /^[0-9a-f-]{36}$/i;

async function requireUser(req, res) {
  const u = await getCurrentUserContext(req);
  if (!u.id) { res.status(401).json({ success: false, error: 'Sign in first.' }); return null; }
  if (!isSupabaseReady() || !UUID_RX.test(u.id)) {
    res.status(503).json({ success: false, error: 'The weekly digest needs a Supabase account.' }); return null;
  }
  return u;
}

// GET /api/newsletter/subscription -> { opt_in }
router.get('/subscription', async (req, res) => {
  const u = await requireUser(req, res); if (!u) return;
  const { data, error } = await getSupabase().from('profiles').select('newsletter_opt_in').eq('id', u.id).maybeSingle();
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, data: { opt_in: !!data?.newsletter_opt_in } });
});

// PUT /api/newsletter/subscription { opt_in: boolean }
router.put('/subscription', async (req, res) => {
  const u = await requireUser(req, res); if (!u) return;
  const optIn = req.body?.opt_in === true;
  const { error } = await getSupabase().from('profiles').update({ newsletter_opt_in: optIn }).eq('id', u.id);
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, data: { opt_in: optIn } });
});

// GET /api/newsletter/preview -> this week's digest for the caller (nothing is sent)
router.get('/preview', async (req, res) => {
  const u = await requireUser(req, res); if (!u) return;
  try {
    const now = new Date();
    const { data } = await gatherDigestData(u.id, new Date(now.getTime() - 7 * 86400000));
    res.json({ success: true, data: buildDigest(data, { siteUrl: config.siteUrl, now }) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/newsletter/send  (weekly GitHub Action; x-ingest-token). ?dry_run=1 builds without sending.
router.post('/send', async (req, res) => {
  if (!config.ingestToken) return res.status(503).json({ success: false, error: 'INGEST_TOKEN is not configured' });
  const given = Buffer.from(String(req.get('x-ingest-token') || ''));
  const want = Buffer.from(config.ingestToken);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
  const report = await sendWeeklyDigests({ dryRun: req.query.dry_run === '1' });
  res.status(report.error ? 503 : 200).json({ success: !report.error, data: report });
});

export default router;
