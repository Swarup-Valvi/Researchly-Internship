import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  FileCheck2,
  UploadCloud,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  Download,
  BookOpen,
  Award,
  Check,
  Send
} from 'lucide-react';

const SAMPLES = [
  {
    label: 'Sparse Attention (ML)',
    title: 'Scalable Sparse Attention for Billion-Scale Foundation Models',
    abstract: 'Standard self-attention mechanisms scale quadratically with context length, presenting prohibitive latency and VRAM footprints during long-sequence generation. In this paper, we propose Dynamic Top-K Routing Attention (DTRA), a parameter-efficient sparse routing formulation that bounds time complexity linearly while preserving language modeling perplexity across 128k token sequences.'
  },
  {
    label: 'Robust Diffusion (Vision)',
    title: 'Equivariant Latent Diffusion for Noise-Robust 3D Molecular Reconstruction',
    abstract: 'Generative diffusion models for biochemical structures struggle with SE(3) symmetry preservation under non-Euclidean cryo-EM noisy projections. We introduce LieGroupDiffusion, enforcing roto-translational equivariance across latent denoising stages.'
  }
];

export default function PaperReviewPage() {
  const [title, setTitle] = useState(SAMPLES[0].title);
  const [abstract, setAbstract] = useState(SAMPLES[0].abstract);
  const [fullText, setFullText] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    async function loadPastReviews() {
      try {
        const res = await api.getPaperReviews();
        if (res.success && res.data) {
          setHistory(res.data);
          if (res.data.length > 0 && !reviewResult) {
            setReviewResult(res.data[0]);
          }
        }
      } catch (e) {}
    }
    loadPastReviews();
  }, []);

  const handleAnalyze = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let res;
      if (file) {
        const formData = new FormData();
        formData.append('paper_file', file);
        formData.append('title', title);
        formData.append('abstract', abstract);
        res = await api.reviewPaper(formData, true);
      } else {
        res = await api.reviewPaper({ title, abstract, fullText });
      }

      if (res.success && res.data) {
        setReviewResult(res.data);
        setHistory([res.data, ...history]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getScoreBadge = (score) => {
    if (score >= 80) return 'bg-emerald-50 text-emerald-800 border-emerald-300';
    if (score >= 60) return 'bg-amber-50 text-amber-800 border-amber-300';
    return 'bg-rose-50 text-rose-800 border-rose-300';
  };

  return (
    <div className="max-w-[1700px] w-full mx-auto px-6 lg:px-12 py-8 space-y-6">
      {/* Header */}
      <div className="bg-surface rounded-2xl border border-slate-200/90 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <FileCheck2 className="w-4 h-4" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              AI Paper Peer Review & Quality Feedback
            </h1>
          </div>
          <p className="text-sm text-slate-500 max-w-2xl">
            Simulate an Area Chair meta-review using LLMs to critique methodology, highlight missing literature, and evaluate readiness before formal conference submission.
          </p>
        </div>

        {/* Sample Preset Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Load Preset:</span>
          {SAMPLES.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => { setTitle(s.title); setAbstract(s.abstract); }}
              className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-lg transition cursor-pointer"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ---------------- LEFT: Submission / Upload Form (5 cols) ---------------- */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-surface rounded-2xl border border-slate-200/90 p-6 shadow-sm space-y-4">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 pb-3 border-b border-slate-100">
              <UploadCloud className="w-4 h-4 text-blue-600" />
              <span>Submit Manuscript for Evaluation</span>
            </h2>

            <form onSubmit={handleAnalyze} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Paper Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Robust Optimization for Neural ODEs"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Abstract</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Paste your abstract..."
                  value={abstract}
                  onChange={(e) => setAbstract(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none transition resize-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Upload Paper File (Optional)</label>
                <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-4 text-center cursor-pointer transition bg-slate-50/50">
                  <input
                    type="file"
                    accept=".txt,.md,.pdf"
                    onChange={(e) => setFile(e.target.files[0])}
                    className="hidden"
                    id="paper-file-upload"
                  />
                  <label htmlFor="paper-file-upload" className="cursor-pointer block">
                    <FileText className="w-7 h-7 text-slate-400 mx-auto mb-1" />
                    <span className="text-xs text-blue-600 font-semibold">
                      {file ? file.name : 'Click to select PDF, TXT or MD'}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Supports papers up to 10MB</p>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Or Paste Methodology Excerpt</label>
                <textarea
                  rows={3}
                  placeholder="Paste experimental setup, proof outline, or algorithm..."
                  value={fullText}
                  onChange={(e) => setFullText(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none transition resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="bg-accent hover:bg-accent-hover w-full py-3 text-white rounded-xl font-semibold shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'Analyzing with Meta-Reviewer...' : 'Run AI Peer Review'}</span>
              </button>
            </form>
          </div>

          {/* Past Review History */}
          {history.length > 0 && (
            <div className="bg-surface rounded-2xl border border-slate-200/90 p-4 shadow-sm space-y-2">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Evaluation History</h3>
              <div className="space-y-1.5">
                {history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setReviewResult(h)}
                    className={`w-full text-left p-2.5 rounded-xl text-xs transition cursor-pointer flex items-center justify-between ${
                      reviewResult?.id === h.id ? 'bg-blue-50 border border-blue-200 text-blue-800 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="truncate max-w-[210px]">{h.title}</span>
                    <span className="text-[10px] font-bold font-mono text-blue-600 shrink-0 ml-2">{h.readiness_score}/100</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ---------------- RIGHT: Review Results Dashboard (7 cols) ---------------- */}
        <div className="lg:col-span-7 space-y-5">
          {!reviewResult ? (
            <div className="bg-surface rounded-2xl border border-slate-200/90 p-12 text-center space-y-3 shadow-sm">
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
                <FileCheck2 className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-base text-slate-800">No Review Report Yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                Submit your paper title and abstract on the left to receive a comprehensive review report with methodology critique and conference fit.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Score & Verdict Banner */}
              <div className="bg-surface rounded-2xl border border-slate-200/90 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Review Report</span>
                  <h3 className="text-base font-bold text-slate-900 mt-0.5">{reviewResult.title}</h3>
                  <div className="mt-2 inline-flex items-center gap-2">
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      Recommendation: {reviewResult.overall_rating}
                    </span>
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border text-center shrink-0 ${getScoreBadge(reviewResult.readiness_score)}`}>
                  <span className="text-[10px] font-bold uppercase tracking-wide">Readiness Score</span>
                  <div className="text-3xl font-black font-mono my-0.5">{reviewResult.readiness_score}/100</div>
                  <span className="text-[10px] font-semibold">Publication Ready</span>
                </div>
              </div>

              {/* Executive Summary */}
              <div className="bg-surface rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  <span>Executive Meta-Review Summary</span>
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  {reviewResult.executive_summary}
                </p>
              </div>

              {/* Strengths & Weaknesses Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Strengths */}
                <div className="bg-surface rounded-2xl border border-emerald-200/80 p-5 shadow-sm space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Identified Strengths</span>
                  </h4>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {reviewResult.strengths?.map((s, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold shrink-0">✓</span>
                        <span className="leading-snug">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Weaknesses */}
                <div className="bg-surface rounded-2xl border border-amber-200/80 p-5 shadow-sm space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Methodological Limitations</span>
                  </h4>
                  <ul className="space-y-2 text-xs text-slate-700">
                    {reviewResult.weaknesses?.map((w, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-amber-500 font-bold shrink-0">⚠</span>
                        <span className="leading-snug">{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Methodology Critique & Literature Gaps */}
              <div className="bg-surface rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-4 text-xs">
                <div>
                  <h4 className="font-bold text-slate-900 mb-1.5">Algorithmic & Experimental Critique</h4>
                  <p className="text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                    {reviewResult.methodology_critique}
                  </p>
                </div>

                {reviewResult.literature_gaps && (
                  <div>
                    <h4 className="font-bold text-slate-900 mb-1.5">Related Work & Literature Gaps</h4>
                    <p className="text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {reviewResult.literature_gaps}
                    </p>
                  </div>
                )}
              </div>

              {/* Actionable Revision Suggestions */}
              {reviewResult.revision_suggestions && reviewResult.revision_suggestions.length > 0 && (
                <div className="bg-surface rounded-2xl border border-blue-200/80 p-5 shadow-sm space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span>Actionable Revision Suggestions for Acceptance</span>
                  </h4>
                  <div className="space-y-2 text-xs">
                    {reviewResult.revision_suggestions.map((rec, i) => (
                      <div key={i} className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-slate-800 font-medium leading-relaxed">{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommended Conferences */}
              {reviewResult.recommended_conferences && reviewResult.recommended_conferences.length > 0 && (
                <div className="bg-surface rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-indigo-600" />
                    <span>Top Target Venues for This Manuscript</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {reviewResult.recommended_conferences.map((rc, i) => (
                      <div key={i} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{rc.conference}</span>
                          <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                            {rc.fit_score}% Fit
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11px] leading-relaxed">{rc.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
