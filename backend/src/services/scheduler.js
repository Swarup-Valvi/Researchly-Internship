import cron from 'node-cron';
import { runEventPipeline } from './eventPipeline.js';
import { discoverNewEvents } from './llmService.js';
import { evaluateConferenceCredibility } from './credibilityEngine.js';
import { store } from '../db/store.js';

let lastSyncTimestamp = null;
let lastSyncStatus = 'idle';
let lastSyncResults = null;

export async function syncEventsNow() {
  console.log('[Scheduler] Executing Real Conference, Webinar & CFP Ingestion Pipeline...');
  lastSyncStatus = 'running';

  try {
    // 1. Run real verified academic event pipeline (conferences, workshops, webinars)
    const pipelineResult = await runEventPipeline();

    let additionalDiscovered = 0;
    // 2. Optionally enrich with live AI discovery if available
    try {
      const aiDiscovered = await discoverNewEvents();
      if (Array.isArray(aiDiscovered) && aiDiscovered.length > 0) {
        for (const raw of aiDiscovered) {
          const slug = `${raw.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${raw.edition}`;
          const existing = await store.getConferenceById(slug);
          if (!existing) {
            const newConf = await store.saveConference({
              ...raw,
              id: slug,
              slug
            });
            const audit = evaluateConferenceCredibility(newConf);
            await store.saveCredibilityAudit(audit);
            additionalDiscovered++;
          }
        }
      }
    } catch (llmErr) {
      console.warn('[Scheduler] Live AI discovery skipped or unavailable:', llmErr.message);
    }

    lastSyncTimestamp = new Date().toISOString();
    lastSyncStatus = 'success';
    lastSyncResults = {
      timestamp: lastSyncTimestamp,
      discovered_count: pipelineResult.discovered_count + additionalDiscovered,
      updated_count: pipelineResult.updated_count,
      extensions_detected: pipelineResult.extensions_detected,
      total_active_events: pipelineResult.total_active_events + additionalDiscovered
    };

    console.log(`[Scheduler] Pipeline completed: ${lastSyncResults.discovered_count} discovered/verified, ${lastSyncResults.updated_count} updated, ${lastSyncResults.extensions_detected} extensions logged.`);
    return lastSyncResults;
  } catch (err) {
    lastSyncStatus = 'error';
    console.error('[Scheduler] Error in syncEventsNow:', err);
    throw err;
  }
}

export function startScheduler() {
  // Run on server boot to ensure events are synchronized
  syncEventsNow().catch(err => {
    console.warn('[Scheduler] Initial boot sync warning:', err.message);
  });

  // Cron schedule: every 12 hours ('0 */12 * * *')
  cron.schedule('0 */12 * * *', async () => {
    console.log('[Scheduler] 12-hour cron trigger firing...');
    try {
      await syncEventsNow();
    } catch (err) {
      console.error('[Scheduler] 12-hour cron job failed:', err.message);
    }
  });

  console.log('[Scheduler] 12-hour automated conference discovery & credibility audit scheduler active (0 */12 * * *).');
}

export function getSchedulerStatus() {
  return {
    interval: 'Every 12 Hours (0 */12 * * *)',
    last_sync_timestamp: lastSyncTimestamp,
    status: lastSyncStatus,
    results: lastSyncResults
  };
}
