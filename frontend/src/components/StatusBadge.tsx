import type { ApplicationStatus } from '../types';

const STATUS_CONFIG: Record<ApplicationStatus, { bg: string; text: string }> = {
  Interested: { bg: 'bg-blue-50 border border-blue-200', text: 'text-blue-700' },
  Shortlisted: { bg: 'bg-indigo-50 border border-indigo-200', text: 'text-indigo-700' },
  Preparing: { bg: 'bg-amber-50 border border-amber-200', text: 'text-amber-700' },
  Submitted: { bg: 'bg-violet-50 border border-violet-200', text: 'text-violet-700' },
  'Under Review': { bg: 'bg-purple-50 border border-purple-200', text: 'text-purple-700' },
  Accepted: { bg: 'bg-emerald-50 border border-emerald-200', text: 'text-emerald-700' },
  Rejected: { bg: 'bg-rose-50 border border-rose-200', text: 'text-rose-700' },
  Withdrawn: { bg: 'bg-slate-100 border border-slate-200', text: 'text-slate-600' },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as ApplicationStatus] || {
    bg: 'bg-slate-100 border border-slate-200',
    text: 'text-slate-600',
  };

  return (
    <span className={`badge ${cfg.bg} ${cfg.text} font-medium`}>
      {status}
    </span>
  );
}
