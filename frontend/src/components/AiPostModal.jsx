import React, { useState } from 'react';
import { api } from '../lib/api';
import { Sparkles, X, Wand2, BookOpen, Send, Check } from 'lucide-react';

export default function AiPostModal({ isOpen, onClose, onSelectDraft }) {
  const [topic, setTopic] = useState('');
  const [paperTitle, setPaperTitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [postType, setPostType] = useState('preprint');
  const [tone, setTone] = useState('academic & engaging');
  const [loading, setLoading] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState(null);

  if (!isOpen) return null;

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.aiDraftPost({
        topic,
        paperTitle,
        abstract,
        postType,
        tone
      });
      if (res.success && res.data) {
        setGeneratedDraft(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUseDraft = () => {
    if (generatedDraft) {
      onSelectDraft(generatedDraft.content, generatedDraft.tags || []);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-surface rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900">AI Post Composer Assistant</h3>
              <p className="text-xs text-slate-500">Draft high-impact academic posts powered by LLM</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {!generatedDraft ? (
            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Post Purpose</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'preprint', label: '📢 Preprint Milestone' },
                    { id: 'accepted', label: '🎉 Paper Accepted' },
                    { id: 'cfp', label: '⏳ CFP Deadline Reminder' },
                    { id: 'discussion', label: '💬 Research Question / Collab' }
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPostType(item.id)}
                      className={`p-2 rounded-lg border text-left font-medium transition cursor-pointer ${
                        postType === item.id
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Paper Title (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Scalable Sparse Attention for Billion-Token LLMs"
                  value={paperTitle}
                  onChange={(e) => setPaperTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Key Findings or Core Ideas</label>
                <textarea
                  rows={3}
                  placeholder="Summarize main takeaway, key benchmark improvement, or specific open question..."
                  value={abstract}
                  onChange={(e) => setAbstract(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                <Wand2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'Drafting Post with LLM...' : 'Generate Academic Post Draft'}</span>
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wide">Generated Draft</span>
                <p className="text-xs text-slate-800 whitespace-pre-line mt-2 leading-relaxed">
                  {generatedDraft.content}
                </p>

                {generatedDraft.tags && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {generatedDraft.tags.map((tag, i) => (
                      <span key={i} className="text-[10px] font-medium bg-blue-100/70 text-blue-700 px-2 py-0.5 rounded-md">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setGeneratedDraft(null)}
                  className="flex-1 py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium cursor-pointer"
                >
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={handleUseDraft}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Insert Into Composer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

