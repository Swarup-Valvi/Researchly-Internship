import React, { useEffect, useState } from 'react';
import { Mail, Eye, X } from 'lucide-react';
import { api } from '../lib/api';

/** Opt-in switch for the weekly digest (new connections, network posts, new events) plus a preview of this week's email. */
export default function NewsletterCard() {
  const [optIn, setOptIn] = useState(null);       // null = loading / unavailable
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    api.getNewsletterSubscription()
      .then((r) => (r?.success ? setOptIn(r.data.opt_in) : setError(r?.error || 'Digest settings unavailable.')))
      .catch(() => setError('Digest settings unavailable.'));
  }, []);

  useEffect(() => {
    if (!preview) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setPreview(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [preview]);

  const toggle = async () => {
    setSaving(true); setError('');
    try {
      const r = await api.setNewsletterSubscription(!optIn);
      if (r?.success) setOptIn(r.data.opt_in); else setError(r?.error || 'Could not save.');
    } catch { setError('Could not save.'); } finally { setSaving(false); }
  };

  const showPreview = async () => {
    setPreviewing(true); setError('');
    try {
      const r = await api.getNewsletterPreview();
      if (r?.success) setPreview(r.data); else setError(r?.error || 'Preview unavailable.');
    } catch { setError('Preview unavailable.'); } finally { setPreviewing(false); }
  };

  return (
    <div className="bg-surface rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <Mail aria-hidden="true" className="w-4 h-4 text-slate-500" /> Weekly digest
          </h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            One email a week: new connections, posts from your network, and newly listed events with open deadlines.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!optIn}
          aria-label="Weekly digest email"
          disabled={optIn === null || saving}
          onClick={toggle}
          className={`relative shrink-0 w-10 h-6 rounded-full transition-colors duration-150 disabled:opacity-50 cursor-pointer ${optIn ? 'bg-blue-600' : 'bg-slate-300'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-150 ${optIn ? 'translate-x-4' : ''}`} />
        </button>
      </div>
      {error && <p className="text-xs text-rose-700 mt-2" role="alert">{error}</p>}
      {optIn !== null && (
        <button type="button" onClick={showPreview} disabled={previewing}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50 cursor-pointer">
          <Eye aria-hidden="true" className="w-3.5 h-3.5" /> {previewing ? 'Building preview…' : "Preview this week's email"}
        </button>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setPreview(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="digest-subject"
            className="bg-surface rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-200">
              <div>
                <p className="text-xs text-slate-500">Preview (not sent)</p>
                <h3 id="digest-subject" className="text-sm font-bold text-slate-900">{preview.subject}</h3>
              </div>
              <button type="button" onClick={() => setPreview(null)} aria-label="Close preview"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* the digest is built server-side from escaped data; shown in a sandboxed frame, scripts disabled */}
            <iframe title="Digest preview" sandbox="" srcDoc={preview.html} className="flex-1 min-h-[50vh] w-full bg-white rounded-b-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
