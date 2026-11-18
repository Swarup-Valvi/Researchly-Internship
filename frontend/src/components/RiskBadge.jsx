import React from 'react';
import { ShieldCheck, AlertTriangle, AlertOctagon, CircleDashed } from 'lucide-react';
import { riskDisplay } from '../lib/risk';

// Semantic colours are reserved for risk states. "Not enough evidence" is a neutral chip, never a warning.
const STYLE = {
  low: { cls: 'bg-risk-low-soft text-risk-low border-risk-low-line', Icon: ShieldCheck },
  medium: { cls: 'bg-risk-medium-soft text-risk-medium border-risk-medium-line', Icon: AlertTriangle },
  high: { cls: 'bg-risk-high-soft text-risk-high border-risk-high-line', Icon: AlertOctagon },
  unknown: { cls: 'bg-risk-none-soft text-risk-none border-risk-none-line', Icon: CircleDashed }
};

export default function RiskBadge({ risk, score, size = 'sm' }) {
  const d = riskDisplay(risk, score);
  const { cls, Icon } = STYLE[d.key] || STYLE.unknown;
  return (
    <span className={`chip ${cls} ${size === 'lg' ? 'px-2.5 py-1 text-sm' : ''}`}>
      <Icon aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
      <span>{d.label}</span>
      {d.score !== null && <span className="font-mono tabular-nums opacity-80">· {d.score}</span>}
    </span>
  );
}
