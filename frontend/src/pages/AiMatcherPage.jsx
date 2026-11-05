import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Sparkles,
  Search,
  Filter,
  ShieldCheck,
  Calendar,
  MapPin,
  Clock,
  ArrowRight,
  CheckCircle2,
  Bookmark,
  Layers,
  Wand2,
  FileText,
  SlidersHorizontal,
  BookmarkPlus
} from 'lucide-react';

const SAMPLES = [
  {
    label: 'Sparse Transformers (ML)',
    title: 'Adaptive Sparse Attention with Dynamic Token Pruning for Long-Context Transformers',
    abstract: 'We introduce an adaptive attention routing mechanism that drastically reduces peak memory overhead in multi-billion parameter foundation models while preserving generative perplexity across extended contextual lengths. Evaluated across standard language modeling benchmarks and multimodal token sequences.',
    keywords: 'Deep Learning, Transformers, Efficient Attention, Scalability, Pretraining'
  },
  {
    label: 'Decentralized FL (Security)',
    title: 'Byzantine-Robust Federated Optimization under Non-IID Graph Partitions',
    abstract: 'Federated learning over distributed edge nodes suffers from vulnerability to poison gradients and heterogeneous client distributions. We formulate a geometric median consensus protocol that guarantees epsilon-differential privacy and bounds adversary influence under Byzantine attacks.',
    keywords: 'Federated Learning, Privacy, Byzantine Fault Tolerance, Cryptography, Distributed Systems'
  },
  {
    label: '3D Splatting (Vision)',
    title: 'Real-Time Neural Radiance Fields via Dynamic Anchor Gaussian Pruning',
    abstract: 'Novel view synthesis using radiance fields demands intensive ray-marching compute. We present an anchor-guided Gaussian splatting pipeline achieving 120 FPS rendering at 4K resolution with 70% fewer splat parameters on commodity GPUs.',
    keywords: 'Computer Vision, 3D Reconstruction, Neural Radiance Fields, Gaussian Splatting, Graphics'
  }
];

export default function AiMatcherPage() {
  const [searchParams] = useSearchParams();
  const initialTarget = searchParams.get('target') || '';

  const [title, setTitle] = useState(
    initialTarget ? `Empirical Analysis for ${initialTarget} Track` : SAMPLES[0].title
  );
  const [abstract, setAbstract] = useState(SAMPLES[0].abstract);
  const [keywords, setKeywords] = useState(SAMPLES[0].keywords);
  const [region, setRegion] = useState('All');
  const [format, setFormat] = useState('All');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const handleMatch = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.matchPaper({
        title,
        abstract,
        keywords: keywords.split(',').map(s => s.trim()),
        region,
        format
      });
      if (res.success && res.data) {
        setResults(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const applySample = (sample) => {
    setTitle(sample.title);
    setAbstract(sample.abstract);
    setKeywords(sample.keywords);
  };

  return (
    <div className="max-w-[1700px] w-full mx-auto px-6 lg:px-12 py-8 space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Paper-to-Venue Recommendation Engine
            </h1>
          </div>
          <p className="text-sm sm:text-base text-slate-500 max-w-2xl mt-1 leading-relaxed">
            Vectorize your manuscript's title, abstract, and topics with TF-IDF and semantic similarity to rank upcoming calls for papers by temporal eligibility and topic fit.
          </p>
        </div>

        {/* Quick Sample Selector */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Load Preset:</span>
          {SAMPLES.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => applySample(s)}
              className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 rounded-lg transition cursor-pointer"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dual Pane Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ---------------- LEFT PANE: Paper Input Form (5 cols) ---------------- */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm h-fit space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>Manuscript Profile</span>
            </h2>
          </div>

          <form onSubmit={handleMatch} className="space-y-4 text-sm">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Working Paper Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Provable Convergence for Decentralized MAML"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Abstract</label>
              <textarea
                rows={5}
                required
                placeholder="Paste your working paper abstract..."
                value={abstract}
                onChange={(e) => setAbstract(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none transition resize-none leading-relaxed"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Keywords & Topics (comma-separated)</label>
              <input
                type="text"
                placeholder="Machine Learning, Vision, Security"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Target Region</label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                >
                  <option value="All">Global / Any Region</option>
                  <option value="USA">North America</option>
                  <option value="Europe">Europe</option>
                  <option value="Asia">Asia-Pacific</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Format</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                >
                  <option value="All">Any Format</option>
                  <option value="In-Person">In-Person</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="Virtual">Virtual</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white rounded-xl font-semibold shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
            >
              <Wand2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Computing Semantic Fit...' : 'Find Recommended Venues'}</span>
            </button>
          </form>
        </div>

        {/* ---------------- RIGHT PANE: Results Grouped by Deadlines (7 cols) ---------------- */}
        <div className="lg:col-span-7 space-y-5">
          {!results ? (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center space-y-3 shadow-sm">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-base text-slate-800">Ready to Match Your Paper</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                Enter your abstract on the left or select a preset and click "Find Recommended Venues" to run our semantic matcher.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Top Venue Banner */}
              <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 rounded-2xl p-5 text-white shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">
                    Top Recommended Venue
                  </span>
                  <h3 className="text-xl font-black mt-0.5">{results.summary?.top_venue}</h3>
                  <p className="text-xs text-blue-100 mt-0.5">High-impact fit for your manuscript topic vocabulary</p>
                </div>
                <div className="text-right bg-white/10 px-4 py-2 rounded-xl backdrop-blur-xs">
                  <span className="text-[10px] uppercase font-bold text-blue-200">Fit Score</span>
                  <div className="text-2xl font-black font-mono">{results.summary?.top_score}%</div>
                </div>
              </div>

              {/* Group 1: Open Upcoming Deadlines */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Eligible Upcoming CFPs ({results.open_upcoming?.length || 0})</span>
                  </h3>
                </div>

                <div className="space-y-3">
                  {results.open_upcoming?.map((item) => (
                    <div
                      key={item.conference_id}
                      className="bg-white rounded-2xl border border-slate-200/90 p-5 hover:border-blue-300 transition shadow-sm space-y-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-base font-bold text-slate-900">
                              <Link to={`/conferences/${item.conference_id}`} className="hover:text-blue-600 transition">
                                {item.conference_name} {item.edition}
                              </Link>
                            </h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {item.ranking}
                            </span>
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              Audit: {item.credibility_score}/100
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">{item.title}</p>
                        </div>

                        {/* Match Score Chip */}
                        <div className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl font-bold text-xs font-mono border border-blue-200 shrink-0">
                          {item.relevance_score}% Match
                        </div>
                      </div>

                      {/* AI Fit Explanation */}
                      <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
                        <strong className="text-slate-800">Match Rationale:</strong> {item.match_explanation}
                      </p>

                      {/* Details Row */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs text-slate-500">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-blue-500" />
                            <strong>Deadline:</strong> {item.raw_deadline || item.submission_deadline}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-rose-500" />
                            {item.location}
                          </span>
                        </div>

                        <Link
                          to={`/conferences/${item.conference_id}`}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 group"
                        >
                          <span>Review Full Audit</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Group 2: Historical / Passed Deadlines */}
              {results.passed_deadline && results.passed_deadline.length > 0 && (
                <section className="space-y-3 pt-4 border-t border-slate-200">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    <span>Passed Deadline / Historical Venues ({results.passed_deadline.length})</span>
                  </h3>

                  <div className="space-y-2 opacity-80">
                    {results.passed_deadline.map((item) => (
                      <div
                        key={item.conference_id}
                        className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-800">{item.conference_name} {item.edition}</span>
                          <span className="text-slate-500 ml-2">Deadline passed on {item.submission_deadline}</span>
                        </div>
                        <span className="text-xs font-mono font-semibold text-slate-600">
                          {item.relevance_score}% Topic Overlap
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
