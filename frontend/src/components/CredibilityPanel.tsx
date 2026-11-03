import { useState } from 'react';
import type { CredibilityAssessment } from '../types';
import { CredibilityBadge } from './CredibilityBadge';

interface Props {
  assessment: CredibilityAssessment;
  onReassess?: () => void;
  assessing?: boolean;
}

export function CredibilityPanel({ assessment: a, onReassess, assessing }: Props) {
  const [activeTab, setActiveTab] = useState<'summary' | 'findings' | 'evidence'>('summary');

  const statusBadge = (status: string) => {
    switch (status) {
      case 'Verified':
        return <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">Verified</span>;
      case 'Contradicted':
        return <span className="badge bg-rose-50 text-rose-700 border border-rose-200">Contradicted</span>;
      case 'Missing':
        return <span className="badge bg-slate-100 text-slate-600 border border-slate-200">Missing</span>;
      default:
        return <span className="badge bg-amber-50 text-amber-700 border border-amber-200">Unverified</span>;
    }
  };

  return (
    <div className="card overflow-hidden">
      {/* Top Banner */}
      <div className="p-6 bg-slate-50 border-b border-slate-200/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <h2 className="text-lg font-bold text-slate-900">Credibility & Risk Assessment</h2>
              <CredibilityBadge riskLevel={a.risk_level} size="lg" />
            </div>
            <p className="text-sm text-slate-700 leading-relaxed font-medium">
              {a.credibility_status}
            </p>
            {a.assessed_at && (
              <p className="text-xs text-slate-400 mt-1">
                Assessed at: {new Date(a.assessed_at).toLocaleString()} • Engine v{a.version ?? '2.0'}
              </p>
            )}
          </div>

          {onReassess && (
            <button
              onClick={onReassess}
              disabled={assessing}
              className="btn-secondary text-xs self-start sm:self-auto shrink-0"
            >
              {assessing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  Evaluating...
                </>
              ) : (
                '🔄 Re-evaluate credibility'
              )}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-6">
        <button
          onClick={() => setActiveTab('summary')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'summary'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Executive Summary
        </button>
        <button
          onClick={() => setActiveTab('findings')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'findings'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Rule-Based Findings
          {a.findings && a.findings.length > 0 && (
            <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.2 rounded-full">
              {a.findings.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('evidence')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'evidence'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Raw Collected Evidence
          {a.evidence && a.evidence.length > 0 && (
            <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.2 rounded-full">
              {a.evidence.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Executive Summary */}
      {activeTab === 'summary' && (
        <div className="p-6 space-y-6">
          {/* Contradictions Alert */}
          {a.contradictions && a.contradictions.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
              <div className="flex items-center gap-2 mb-2 text-rose-800 font-semibold text-sm">
                <span>🚫</span> Direct Contradictions Detected
              </div>
              <ul className="space-y-1.5">
                {a.contradictions.map((c, i) => (
                  <li key={i} className="text-xs text-rose-700 flex items-start gap-2">
                    <span className="text-rose-500 font-bold">•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings Alert */}
          {a.warning_indicators && a.warning_indicators.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex items-center gap-2 mb-2 text-amber-800 font-semibold text-sm">
                <span>⚠️</span> Credibility Warnings
              </div>
              <ul className="space-y-1.5">
                {a.warning_indicators.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700 flex items-start gap-2">
                    <span className="text-amber-500 font-bold">•</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Positive Indicators */}
          {a.positive_indicators && a.positive_indicators.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="flex items-center gap-2 mb-2 text-emerald-800 font-semibold text-sm">
                <span>✅</span> Verified Positive Indicators
              </div>
              <ul className="space-y-1.5">
                {a.positive_indicators.map((p, i) => (
                  <li key={i} className="text-xs text-emerald-700 flex items-start gap-2">
                    <span className="text-emerald-500 font-bold">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Missing Information */}
          {a.missing_information && a.missing_information.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center gap-2 mb-2 text-slate-700 font-semibold text-sm">
                <span>ℹ️</span> Missing Public Verification Claims
              </div>
              <ul className="space-y-1.5">
                {a.missing_information.map((m, i) => (
                  <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                    <span className="text-slate-400 font-bold">•</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Rule-Based Findings */}
      {activeTab === 'findings' && (
        <div className="p-6">
          {!a.findings || a.findings.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              No detailed verification findings recorded for this evaluation.
            </p>
          ) : (
            <div className="space-y-3">
              {a.findings.map(f => (
                <div
                  key={f.rule_id}
                  className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors bg-white flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">{f.rule_name}</span>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider bg-slate-100 px-1.5 py-0.5 rounded">
                          {f.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{f.reason}</p>
                    </div>
                    {statusBadge(f.status)}
                  </div>

                  {f.evidence_excerpts && f.evidence_excerpts.length > 0 && (
                    <div className="mt-1 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-600">
                      <p className="font-semibold text-slate-700 text-[11px] mb-1">Supporting Evidence:</p>
                      {f.evidence_excerpts.map((excerpt, idx) => (
                        <p key={idx} className="italic text-slate-500 border-l-2 border-slate-300 pl-2 my-1">
                          "{excerpt}"
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Raw Evidence */}
      {activeTab === 'evidence' && (
        <div className="p-6">
          {!a.evidence || a.evidence.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              No primary evidence records collected.
            </p>
          ) : (
            <div className="space-y-3">
              {a.evidence.map(e => (
                <div
                  key={e.id ?? e.claim}
                  className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {e.category}
                        </span>
                        {e.is_self_claimed ? (
                          <span className="badge bg-amber-50 text-amber-700 border border-amber-200 text-[10px]">
                            Self-Claimed
                          </span>
                        ) : (
                          <span className="badge bg-blue-50 text-blue-700 border border-blue-200 text-[10px]">
                            Independently Verified
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-slate-900">{e.claim}</p>
                    </div>
                    {statusBadge(e.verification_status)}
                  </div>

                  {e.supporting_excerpt && (
                    <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 italic">
                      "{e.supporting_excerpt}"
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                    <div>
                      Source: <span className="text-slate-600 font-medium">{e.source_name}</span>
                      {e.source_url && (
                        <a
                          href={e.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-blue-600 hover:underline"
                        >
                          Visit citation ↗
                        </a>
                      )}
                    </div>
                    {e.retrieved_at && <span>Retrieved: {e.retrieved_at.slice(0, 10)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
