// Single place that decides how a risk level / score is shown.
// A missing score is NEVER treated as good (or as predatory): it is "not enough evidence".
export function riskDisplay(risk, score) {
  const hasScore = typeof score === 'number';
  if (risk === 'High') return { key: 'high', label: 'High-Risk Indicators', score: hasScore ? score : null };
  if (risk === 'Medium') return { key: 'medium', label: 'Medium Risk', score: hasScore ? score : null };
  if (risk === 'Low') return { key: 'low', label: 'Low Risk', score: hasScore ? score : null };
  return { key: 'unknown', label: 'Not enough evidence', score: null };
}

export const scoreText = (score) => (typeof score === 'number' ? `${score}/100` : '—');
