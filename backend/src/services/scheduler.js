import cron from 'node-cron';
import { runEventPipeline } from './eventPipeline.js';

let lastSyncTimestamp = null;
let lastSyncStatus = 'idle';
let lastSyncResults = null;

export async function syncEventsNow() {
  lastSyncStatus = 'running';
  try {
    const result = await runEventPipeline();
    lastSyncTimestamp = result.timestamp;
    lastSyncStatus = 'success';
    lastSyncResults = result;
    console.log('[Scheduler] Sync complete:', JSON.stringify(result));
    return result;
  } catch (err) {
    lastSyncStatus = 'error';
    console.error('[Scheduler] Sync failed:', err.message);
    throw err;
  }
}

export function startScheduler() {
  syncEventsNow().catch((err) => console.warn('[Scheduler] Initial sync warning:', err.message));
  // NOTE: on Render's free tier the service sleeps when idle, so this in-process cron is best-effort.
  // The reliable trigger is .github/workflows/ingest.yml, which runs the pipeline and POSTs to /api/conferences/ingest.
  cron.schedule('0 */12 * * *', () => {
    syncEventsNow().catch((err) => console.error('[Scheduler] 12-hour sync failed:', err.message));
  });
  console.log('[Scheduler] Active: pipeline import + re-audit every 12 hours (best-effort while the server is awake).');
}

export function getSchedulerStatus() {
  return {
    interval: 'Every 12 Hours (best-effort); authoritative ingestion runs via GitHub Actions',
    last_sync_timestamp: lastSyncTimestamp,
    status: lastSyncStatus,
    results: lastSyncResults
  };
}
