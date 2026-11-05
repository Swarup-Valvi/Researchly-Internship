/**
 * Production-Ready Real Academic Event Pipeline for Researchly.io
 * 
 * Ingests, normalizes, audits, and tracks real academic conferences,
 * research paper calls (CFPs), workshops, and prestigious academic webinars.
 */

import { store } from '../db/store.js';
import { evaluateConferenceCredibility } from './credibilityEngine.js';
import { REAL_ACADEMIC_EVENTS } from '../db/realEvents.js';

export { REAL_ACADEMIC_EVENTS };

/**
 * Execute real event synchronization pipeline
 */
export async function runEventPipeline() {
  console.log('[EventPipeline] Running real academic event ingestion & credibility audit pipeline...');
  let discoveredCount = 0;
  let updatedCount = 0;
  let extensionsCount = 0;

  for (const event of REAL_ACADEMIC_EVENTS) {
    const slug = `${event.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${event.edition}`;
    const existing = await store.getConferenceById(slug);

    if (existing) {
      // Check for deadline drift
      if (
        event.submission_deadline &&
        existing.submission_deadline &&
        event.submission_deadline !== existing.submission_deadline
      ) {
        console.log(`[EventPipeline] Deadline drift detected for ${event.name} ${event.edition}: ${existing.submission_deadline} -> ${event.submission_deadline}`);
        await store.recordDeadlineChange({
          conference_id: slug,
          previous_deadline: existing.submission_deadline,
          new_deadline: event.submission_deadline,
          raw_previous_deadline: existing.raw_deadline,
          raw_new_deadline: event.raw_deadline,
          change_reason: event.extension_reason || 'Official extension or calendar adjustment announced.'
        });
        extensionsCount++;
      }

      const updated = await store.saveConference({
        ...existing,
        ...event,
        id: slug,
        slug,
        is_extended: existing.is_extended || !!event.is_extended
      });

      // Run 9-dimension credibility evaluation
      const audit = evaluateConferenceCredibility(updated);
      await store.saveCredibilityAudit(audit);
      updatedCount++;
    } else {
      // New event
      const newEvent = await store.saveConference({
        ...event,
        id: slug,
        slug
      });

      // Run 9-dimension credibility evaluation
      const audit = evaluateConferenceCredibility(newEvent);
      await store.saveCredibilityAudit(audit);

      if (event.is_extended) {
        await store.recordDeadlineChange({
          conference_id: slug,
          previous_deadline: event.submission_deadline,
          new_deadline: event.submission_deadline,
          change_reason: event.extension_reason || 'Initial extended deadline verified.'
        });
        extensionsCount++;
      }

      discoveredCount++;
    }
  }

  const result = {
    timestamp: new Date().toISOString(),
    discovered_count: discoveredCount,
    updated_count: updatedCount,
    extensions_detected: extensionsCount,
    total_active_events: REAL_ACADEMIC_EVENTS.length
  };

  console.log(`[EventPipeline] Pipeline complete: ${discoveredCount} new, ${updatedCount} updated, ${extensionsCount} extensions logged. Total active events: ${REAL_ACADEMIC_EVENTS.length}`);
  return result;
}
