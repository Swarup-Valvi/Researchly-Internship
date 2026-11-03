const RISK_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  Low: {
    bg: 'bg-emerald-50 border border-emerald-200/80',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    label: 'Low Risk',
  },
  Medium: {
    bg: 'bg-amber-50 border border-amber-200/80',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    label: 'Medium Risk',
  },
  High: {
    bg: 'bg-rose-50 border border-rose-200/80',
    text: 'text-rose-700',
    dot: 'bg-rose-500',
    label: 'High Risk',
  },
  'Insufficient Evidence': {
    bg: 'bg-slate-100 border border-slate-200',
    text: 'text-slate-700',
    dot: 'bg-slate-400',
    label: 'Insufficient Evidence',
  },
  'Not assessed': {
    bg: 'bg-slate-50 border border-slate-200 text-slate-500',
    text: 'text-slate-500',
    dot: 'bg-slate-300',
    label: 'Not Assessed',
  },
};

export function CredibilityBadge({
  riskLevel,
  size = 'md',
}: {
  riskLevel?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const cfg = (riskLevel && RISK_CONFIG[riskLevel]) || RISK_CONFIG['Not assessed'];

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5 font-medium',
  }[size];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${cfg.bg} ${cfg.text} ${sizeClasses}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}
