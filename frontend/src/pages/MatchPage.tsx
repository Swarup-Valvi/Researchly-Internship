import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatch } from '../hooks/useMatch';

export function MatchPage() {
  const { match, loading, error } = useMatch();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [keywords, setKeywords] = useState('');
  const [researchDomain, setResearchDomain] = useState('');
  const [preferredLocation, setPreferredLocation] = useState('');

  const handleExampleClick = (
    exTitle: string,
    exAbstract: string,
    exKeywords: string,
    exDomain: string,
    exLoc: string
  ) => {
    setTitle(exTitle);
    setAbstract(exAbstract);
    setKeywords(exKeywords);
    setResearchDomain(exDomain);
    setPreferredLocation(exLoc);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !abstract.trim()) return;

    const result = await match({
      title: title.trim(),
      abstract: abstract.trim(),
      keywords: keywords
        .split(',')
        .map(k => k.trim())
        .filter(Boolean),
      research_domain: researchDomain.trim() || undefined,
      preferred_location: preferredLocation.trim() || undefined,
    });

    if (result) {
      navigate('/match/results', { state: { result, paperTitle: title } });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200 mb-1">
          <span>✨</span> TF-IDF Semantic Match Engine
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Match Your Paper with Conferences
        </h1>
        <p className="text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
          Submit your paper title, abstract, and keywords to rank top academic conferences by topic overlap, temporal eligibility, and credibility.
        </p>
      </div>

      {/* Preset Example Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
        <span className="text-slate-400 font-medium">Try with example:</span>
        <button
          type="button"
          onClick={() =>
            handleExampleClick(
              'Self-Supervised Visual Representation Learning with Contrastive Transformers',
              'We introduce an end-to-end framework for self-supervised visual representation learning using masked contrastive transformers. Our method scales to massive unlabeled image corpora and demonstrates state-of-the-art transfer performance across object detection, segmentation, and few-shot classification benchmarks.',
              'computer vision, self-supervised learning, transformers, contrastive learning',
              'Computer Vision',
              'USA'
            )
          }
          className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-md border border-slate-200 transition-colors"
        >
          🖼️ Computer Vision Paper
        </button>
        <button
          type="button"
          onClick={() =>
            handleExampleClick(
              'Efficient Long-Context Language Modeling via Dynamic Sparse Attention',
              'Large language models struggle with quadratic memory complexity over extended context windows. We present a dynamic sparse attention mechanism that routes queries through hierarchical memory caches, preserving perplexity while reducing computational overhead by 4x across 128k token sequences.',
              'natural language processing, transformers, attention mechanisms, language models',
              'Natural Language Processing',
              'Europe'
            )
          }
          className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-md border border-slate-200 transition-colors"
        >
          💬 NLP / LLM Paper
        </button>
      </div>

      {/* Match Form */}
      <form onSubmit={handleSubmit} className="card p-6 sm:p-8 space-y-5">
        <div>
          <label htmlFor="paper-title" className="label">
            Paper Title <span className="text-rose-500">*</span>
          </label>
          <input
            id="paper-title"
            type="text"
            required
            className="input"
            placeholder="e.g. Attention Is All You Need"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="paper-abstract" className="label">
            Paper Abstract <span className="text-rose-500">*</span>
          </label>
          <textarea
            id="paper-abstract"
            required
            rows={5}
            className="input resize-y"
            placeholder="Paste your research abstract here..."
            value={abstract}
            onChange={e => setAbstract(e.target.value)}
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Tip: A detailed abstract provides stronger TF-IDF topic overlap and higher matching accuracy.
          </p>
        </div>

        <div>
          <label htmlFor="paper-keywords" className="label">
            Keywords (comma-separated)
          </label>
          <input
            id="paper-keywords"
            type="text"
            className="input"
            placeholder="e.g. machine learning, transformers, self-supervised learning"
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="paper-domain" className="label">
              Primary Research Domain
            </label>
            <input
              id="paper-domain"
              type="text"
              className="input"
              placeholder="e.g. Artificial Intelligence, Robotics"
              value={researchDomain}
              onChange={e => setResearchDomain(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="paper-location" className="label">
              Preferred Location / Region
            </label>
            <input
              id="paper-location"
              type="text"
              className="input"
              placeholder="e.g. USA, Canada, Europe, Singapore"
              value={preferredLocation}
              onChange={e => setPreferredLocation(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            ⚠️ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !title.trim() || !abstract.trim()}
          className="btn-primary w-full py-3 text-sm font-semibold shadow-md"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Evaluating Paper Similarity & Deadlines...
            </>
          ) : (
            '✨ Discover Matching Conferences'
          )}
        </button>
      </form>
    </div>
  );
}
