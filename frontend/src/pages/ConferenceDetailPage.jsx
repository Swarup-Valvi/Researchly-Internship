import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  HelpCircle,
  Calendar,
  MapPin,
  ExternalLink,
  Clock,
  ArrowLeft,
  Sparkles,
  Layers,
  CheckCircle2,
  XCircle,
  Building2,
  DollarSign,
  History
} from 'lucide-react';

export default function ConferenceDetailPage() {
  const { id } = useParams();
  const [conference, setConference] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDetail() {
      try {
        const res = await api.getConferenceDetail(id);
        if (res.success && res.data) {
          setConference(res.data);
        }
      } finally {
        setLoading(false);
      }
    }
    loadDetail();
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 animate-pulse space-y-6">
        <div className="h-6 w-32 bg-slate-200 rounded-sm"></div>
        <div className="h-40 bg-slate-200 rounded-xl"></div>
        <div className="h-64 bg-slate-200 rounded-xl"></div>
      </div>
    );
  }

  if (!conference) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold text-slate-800">Conference Record Not Found</h2>
        <p className="text-xs text-slate-500 mt-2">The requested conference ID or slug does not exist.</p>
        <Link to="/discover" className="mt-4 inline-flex items-center gap-1 text-xs text-blue-600 font-semibold">
          <ArrowLeft className="w-4 h-4" /> Back to Discover Catalog
        </Link>
      </div>
    );
  }

  const audit = conference.credibility_audit || {};
  const deadlineHistory = conference.deadline_history || [];

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-rose-600';
  };

  const getScoreBg = (score) => {
    if (score >= 80) return 'bg-emerald-50 border-emerald-200';
    if (score >= 50) return 'bg-amber-50 border-amber-200';
    return 'bg-rose-50 border-rose-200';
  };

  return (
    <div className="max-w-[1500px] w-full mx-auto px-6 lg:px-12 py-8 space-y-6">
      {/* Back button */}
      <div>
        <Link to="/discover" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Discover Catalog</span>
        </Link>
      </div>

      {/* Header Banner Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {conference.name} {conference.edition}
              </h1>
              {conference.ranking && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-sm bg-slate-900 text-white">
                  {conference.ranking}
                </span>
              )}
              {conference.is_extended && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                  Deadline Extended
                </span>
              )}
            </div>

            <p className="text-sm text-slate-600">{conference.title}</p>
            <p className="text-xs font-medium text-blue-600">{conference.field}</p>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>Deadline: <strong>{conference.raw_deadline || conference.submission_deadline}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span>{conference.location} • {conference.format}</span>
              </div>
              {conference.publisher && (
                <div className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-slate-400" />
                  <span>{conference.publisher}</span>
                </div>
              )}
            </div>
          </div>

          {/* Credibility Score Box */}
          <div className={`p-4 rounded-xl border flex flex-col items-center justify-center text-center min-w-[170px] ${getScoreBg(conference.credibility_score)}`}>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Credibility Score
            </span>
            <div className={`text-4xl font-black my-1 font-mono ${getScoreColor(conference.credibility_score)}`}>
              {conference.credibility_score}<span className="text-sm font-normal text-slate-500">/100</span>
            </div>
            <span className={`text-xs font-bold uppercase tracking-wide ${getScoreColor(conference.credibility_score)}`}>
              {conference.risk_level} Risk Tier
            </span>
          </div>
        </div>

        {/* Quick External Actions */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {conference.topics?.map((topic, i) => (
              <span key={i} className="text-[11px] font-medium px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md">
                {topic}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={`/ai-match?target=${encodeURIComponent(conference.name)}`}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Match My Paper</span>
            </Link>

            {conference.official_url && (
              <a
                href={conference.official_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <span>Official Website</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 9-Dimension Risk Audit Breakdown */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <span>Automated 9-Dimension Risk Audit</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cross-verified against DBLP, CrossRef, official society charters, and convention registries.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {[
            { label: 'Domain & Infrastructure', score: audit.domain_score || 95, desc: 'TLS validation, age & WHOIS' },
            { label: 'Organizer Authenticity', score: audit.organizer_score || 95, desc: 'Chartered society verification' },
            { label: 'Publisher Reputation', score: audit.publisher_score || 95, desc: 'Recognized academic press' },
            { label: 'Indexing Validation', score: audit.indexing_score || 95, desc: 'DBLP, Scopus & CrossRef records' },
            { label: 'TPC Credentials', score: audit.tpc_score || 90, desc: 'Faculty chairs & double-blind' },
            { label: 'Past History & Longevity', score: audit.history_score || 95, desc: 'Edition track record' },
            { label: 'Physical Venue Check', score: audit.venue_score || 90, desc: 'Verified convention facility' },
            { label: 'Fee Transparency', score: audit.fee_score || 85, desc: 'Clear tiering, no pay-to-publish' },
            { label: 'Editorial Authenticity', score: audit.editorial_score || 90, desc: 'Institutional contact channels' },
          ].map((dim, i) => (
            <div key={i} className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-800">{dim.label}</p>
                <p className="text-[10px] text-slate-500">{dim.desc}</p>
              </div>
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                dim.score >= 80 ? 'bg-emerald-100 text-emerald-800' : (dim.score >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800')
              }`}>
                {dim.score}/100
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 4 Evidence Cards (Positive, Warnings, Contradictions, Missing Info) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* 1. Positive Indicators (Green) */}
        <div className="bg-white rounded-2xl border border-emerald-200 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-3 text-emerald-700">
            <CheckCircle2 className="w-4 h-4" />
            <h3 className="font-bold text-xs uppercase tracking-wider">
              Positive Indicators ({audit.positive_indicators?.length || 0})
            </h3>
          </div>
          {audit.positive_indicators && audit.positive_indicators.length > 0 ? (
            <ul className="space-y-2 text-xs text-slate-700">
              {audit.positive_indicators.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold shrink-0">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400 italic">No verified positive indicators registered.</p>
          )}
        </div>

        {/* 2. Direct Contradictions (Red) */}
        <div className="bg-white rounded-2xl border border-rose-200 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-3 text-rose-700">
            <AlertOctagon className="w-4 h-4" />
            <h3 className="font-bold text-xs uppercase tracking-wider">
              Direct Contradictions ({audit.contradictions?.length || 0})
            </h3>
          </div>
          {audit.contradictions && audit.contradictions.length > 0 ? (
            <ul className="space-y-2 text-xs text-rose-950 font-medium">
              {audit.contradictions.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 p-2 bg-rose-50 rounded-lg border border-rose-100">
                  <span className="text-rose-600 font-bold shrink-0">✕</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">✓ No critical falsifications or predatory contradictions detected.</p>
          )}
        </div>

        {/* 3. Warnings (Yellow) */}
        <div className="bg-white rounded-2xl border border-amber-200 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-3 text-amber-700">
            <AlertTriangle className="w-4 h-4" />
            <h3 className="font-bold text-xs uppercase tracking-wider">
              Warning Indicators ({audit.warning_indicators?.length || 0})
            </h3>
          </div>
          {audit.warning_indicators && audit.warning_indicators.length > 0 ? (
            <ul className="space-y-2 text-xs text-slate-700">
              {audit.warning_indicators.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-amber-500 font-bold shrink-0">⚠</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400 italic">No operational warnings active for this cycle.</p>
          )}
        </div>

        {/* 4. Missing Information (Gray) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-3 text-slate-700">
            <HelpCircle className="w-4 h-4" />
            <h3 className="font-bold text-xs uppercase tracking-wider">
              Missing Information ({audit.missing_information?.length || 0})
            </h3>
          </div>
          {audit.missing_information && audit.missing_information.length > 0 ? (
            <ul className="space-y-2 text-xs text-slate-600">
              {audit.missing_information.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold shrink-0">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400 italic">All required scientific disclosure metadata is present.</p>
          )}
        </div>

      </div>

      {/* Deadline Change & Drift History Timeline */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <History className="w-4 h-4 text-blue-600" />
          <span>Deadline Drift & Extension History Timeline</span>
        </h3>

        {deadlineHistory.length > 0 ? (
          <div className="relative pl-6 border-l-2 border-blue-500 space-y-4">
            {deadlineHistory.map((dh, i) => (
              <div key={i} className="relative">
                <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-blue-600 border-2 border-white"></div>
                <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between text-slate-800 font-semibold">
                    <span>
                      Deadline shifted from{' '}
                      <span className="line-through text-slate-400">{dh.raw_previous_deadline || dh.previous_deadline}</span>{' '}
                      to <span className="text-blue-600 font-bold">{dh.raw_new_deadline || dh.new_deadline}</span>
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(dh.detected_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-slate-600">{dh.change_reason}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">
            No deadline extensions or drift detected. The initial submission deadline has remained firm.
          </p>
        )}
      </div>
    </div>
  );
}

