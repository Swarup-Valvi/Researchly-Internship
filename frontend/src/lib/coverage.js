/**
 * Which audit dimensions ran, which did not, and why, computed from the audit's own checks.
 * Mirrors backend credibilityEngine DIMENSIONS (weights) and the 0.30 coverage threshold.
 */
export const DIMENSIONS = [
  { key: 'domain', label: 'Domain & Infrastructure', weight: 0.10 },
  { key: 'organizer', label: 'Organizer & Sponsorship', weight: 0.15 },
  { key: 'publisher', label: 'Publisher Reputation', weight: 0.15 },
  { key: 'indexing', label: 'Indexing Validation', weight: 0.15 },
  { key: 'tpc', label: 'Program Committee', weight: 0.15 },
  { key: 'history', label: 'Past History & Longevity', weight: 0.10 },
  { key: 'venue', label: 'Physical Venue', weight: 0.05 },
  { key: 'fee', label: 'Fee Transparency', weight: 0.10 },
  { key: 'editorial', label: 'Submission & Review Process', weight: 0.05 }
];
export const MIN_COVERAGE = 0.30;
const RAN = new Set(['pass', 'warn', 'fail']);

export function dimensionCoverage(audit) {
  const checks = audit?.checks || [];
  return DIMENSIONS.map((d) => {
    const mine = checks.filter((c) => c.dimension === d.key);
    const ran = mine.filter((c) => RAN.has(c.status));
    return {
      ...d,
      score: audit?.[`${d.key}_score`] ?? null,
      ran: ran.length > 0,
      checksRun: ran.map((c) => ({ label: c.label, status: c.status })),
      info: mine.filter((c) => c.status === 'info').map((c) => ({ label: c.label, detail: c.detail })),
      reasons: mine.filter((c) => c.status === 'not_checked').map((c) => ({ label: c.label, reason: c.detail }))
    };
  });
}

export function coverageSummary(audit) {
  const dims = dimensionCoverage(audit);
  const covered = Math.round(dims.filter((d) => d.ran).reduce((s, d) => s + d.weight, 0) * 100) / 100;
  return { dims, covered, enough: covered >= MIN_COVERAGE, ranCount: dims.filter((d) => d.ran).length };
}
