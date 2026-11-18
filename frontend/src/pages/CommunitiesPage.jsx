import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, Users, Hash, ArrowRight, Sparkles, BookOpen, LogIn } from 'lucide-react';

const CHANNEL_DEFAULTS = {
  'comm-ml': ['#paper-announcements', '#cfp-discussion', '#architecture-ideas', '#open-datasets'],
  'comm-nlp': ['#llm-fine-tuning', '#benchmark-results', '#alignment-theory', '#cfp-acl-emnlp'],
  'comm-security': ['#ctf-analysis', '#privacy-laws', '#zk-proofs', '#predatory-venue-alerts'],
  'comm-cv': ['#3d-reconstruction', '#diffusion-models', '#dataset-release', '#cvpr-track']
};

export default function CommunitiesPage() {
  const { user, setIsAuthModalOpen } = useAuth();
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.getCommunities();
        if (res.success) setCommunities(res.data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const TOPIC_COLORS = {
    'AI & ML': 'bg-indigo-100 text-indigo-700 border-indigo-200',
    'NLP': 'bg-purple-100 text-purple-700 border-purple-200',
    'Security': 'bg-rose-100 text-rose-700 border-rose-200',
    'Vision': 'bg-sky-100 text-sky-700 border-sky-200',
  };

  return (
    <div className="max-w-[1700px] w-full mx-auto px-6 lg:px-12 py-8 space-y-6">
      {/* Header */}
      <div className="bg-surface rounded-2xl border border-slate-200/90 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Hash className="w-7 h-7 text-blue-600" />
              <span>Academic Communities &amp; Discussion Hubs</span>
            </h1>
            <p className="text-sm sm:text-base text-slate-500 mt-1 max-w-3xl leading-relaxed">
              Specialized topic rooms for Call for Papers discussions, paper rebuttals, dataset sharing, and inter-university research collaboration.
            </p>
          </div>
          {!user && (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              Sign In to Join
            </button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Active Hubs', value: communities.length || '4', icon: Hash, color: 'text-blue-600 bg-blue-50' },
          { label: 'Topics Covered', value: '20+', icon: BookOpen, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Researchers', value: communities.reduce((acc, c) => acc + (c.members_count || 0), 0).toLocaleString() || '14,000+', icon: Users, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Discussions', value: 'Live', icon: MessageSquare, color: 'text-purple-600 bg-purple-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-surface rounded-2xl border border-slate-200/90 p-4 shadow-sm flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">{label}</p>
              <p className="text-lg font-bold text-slate-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Community Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="bg-surface rounded-2xl border border-slate-200 p-6 h-64 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {communities.map((c) => {
            const channels = CHANNEL_DEFAULTS[c.id] || c.channels || [];
            const colorClass = TOPIC_COLORS[c.field] || 'bg-blue-100 text-blue-700 border-blue-200';
            return (
              <div key={c.id} className="bg-surface rounded-2xl border border-slate-200/90 p-6 shadow-xs flex flex-col justify-between hover:border-blue-300 hover:shadow-md transition group">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${colorClass}`}>
                      {c.field}
                    </span>
                    <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{(c.members_count || 0).toLocaleString()} researchers</span>
                    </span>
                  </div>

                  <h3 className="font-bold text-lg text-slate-900 mb-2 group-hover:text-blue-700 transition">{c.name}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed mb-4">{c.description}</p>

                  {/* Topic Tags */}
                  {c.topics && c.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {c.topics.slice(0, 4).map((t, i) => (
                        <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg font-medium border border-slate-200/80">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Channel List */}
                  {channels.length > 0 && (
                    <div className="space-y-1 mt-2">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Channels</p>
                      {channels.slice(0, 3).map((ch, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-xs text-slate-600 font-mono py-0.5">
                          <Hash className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{ch.replace('#', '')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 mt-5 flex items-center justify-between">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    Open Public Hub
                  </span>
                  <button
                    onClick={() => !user && setIsAuthModalOpen(true)}
                    className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition cursor-pointer"
                  >
                    <span>{user ? 'Enter Hub' : 'Join Hub'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Call to Action for guests */}
      {!user && (
        <div className="bg-slate-900 rounded-2xl p-8 text-white text-center space-y-4">
          <h3 className="text-xl font-bold">Join the Academic Conversation</h3>
          <p className="text-sm text-blue-100 max-w-xl mx-auto">
            Sign in to participate in CFP discussions, share preprints, ask peer reviewers, and get real-time deadline alerts in your research community.
          </p>
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-surface text-blue-700 rounded-xl text-sm font-bold shadow-md hover:bg-blue-50 transition cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            Sign In / Create Account
          </button>
        </div>
      )}
    </div>
  );
}
