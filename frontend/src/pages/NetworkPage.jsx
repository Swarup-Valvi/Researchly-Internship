import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  Users, UserCheck, UserPlus, UserX, Search, MessageSquare,
  Clock, CheckCircle2, XCircle, Inbox, Building, Hash,
  ChevronDown, Sparkles, Award, GraduationCap, Flame, ArrowRight,
  Filter, SlidersHorizontal, LogIn
} from 'lucide-react';

const TABS = [
  { id: 'discover', label: 'Discover & Suggestions', icon: Users },
  { id: 'connections', label: 'My Connections', icon: UserCheck },
  { id: 'requests', label: 'Requests Inbox', icon: Inbox }
];

function ResearcherCard({ researcher, onAction, isRecommended = false }) {
  const { user, setIsAuthModalOpen } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [message, setMessage] = useState('');

  const status = researcher.connection_status || 'none';

  const handleConnectClick = () => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    setShowMsgModal(true);
  };

  const handleSendRequest = async () => {
    setLoading(true);
    try {
      await onAction('request', researcher.id, message);
      setShowMsgModal(false);
      setMessage('');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    setLoading(true);
    try { await onAction('accept', researcher.id); } finally { setLoading(false); }
  };

  const handleReject = async () => {
    setLoading(true);
    try { await onAction('reject', researcher.id); } finally { setLoading(false); }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(`Disconnect from ${researcher.name}?`)) return;
    setLoading(true);
    try { await onAction('disconnect', researcher.id); } finally { setLoading(false); }
  };

  return (
    <>
      <div className={`bg-white rounded-2xl border p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
        isRecommended ? 'border-indigo-200 bg-gradient-to-b from-indigo-50/30 to-white' : 'border-slate-200/90 hover:border-slate-300'
      }`}>
        <div>
          {/* Top Recommendation Badge (if matched by topics) */}
          {researcher.similarity_score >= 60 && (
            <div className="flex items-center justify-between gap-1 mb-3">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                <Flame className="w-3 h-3 text-indigo-600" />
                <span>{researcher.similarity_score}% Topic Match</span>
              </span>
              {researcher.shared_interests?.length > 0 && (
                <span className="text-xs text-slate-400 font-medium truncate max-w-[140px]">
                  {researcher.shared_interests.length} shared topic{researcher.shared_interests.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}

          {/* Avatar + Identity */}
          <div className="flex items-start gap-3.5 mb-3">
            <img
              src={researcher.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(researcher.name || 'U')}&background=4f46e5&color=fff&size=56`}
              alt={researcher.name}
              className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shadow-2xs shrink-0"
            />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 leading-snug truncate">{researcher.name}</h3>
              <p className="text-sm text-slate-500 leading-snug mt-0.5 line-clamp-1">{researcher.role}</p>
              <p className="text-sm font-semibold text-blue-600 mt-0.5 flex items-center gap-1 truncate">
                <Building className="w-3 h-3 shrink-0" />
                <span className="truncate">{researcher.institution}</span>
              </p>
            </div>
          </div>

          {/* Academic Metrics Pill */}
          <div className="flex items-center gap-2 mb-3">
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-mono font-bold">
              h-index: {researcher.h_index ?? 0}
            </div>
            {researcher.citations && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-xs font-mono">
                {researcher.citations} citations
              </div>
            )}
          </div>

          {/* Bio */}
          {researcher.bio && (
            <p className="text-sm text-slate-600 leading-relaxed line-clamp-2 mb-3.5">{researcher.bio}</p>
          )}

          {/* Research Interest Tags */}
          {researcher.research_interests?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-4">
              {researcher.research_interests.slice(0, 3).map((topic, i) => {
                const isShared = researcher.shared_interests?.some(si => si.toLowerCase() === topic.toLowerCase());
                return (
                  <span
                    key={i}
                    className={`text-xs font-semibold px-2 py-0.5 rounded-md border flex items-center gap-0.5 ${
                      isShared
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200/60'
                    }`}
                  >
                    <Hash className="w-2.5 h-2.5 opacity-60" />
                    <span>{topic}</span>
                  </span>
                );
              })}
              {researcher.research_interests.length > 3 && (
                <span className="text-xs text-slate-400 px-1 py-0.5">
                  +{researcher.research_interests.length - 3} more
                </span>
              )}
            </div>
          )}

          {/* Incoming Request Message */}
          {status === 'pending_incoming' && researcher.request_message && (
            <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 italic">
              "{researcher.request_message}"
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-3 border-t border-slate-100 mt-2">
          {status === 'none' && (
            <button
              onClick={handleConnectClick}
              disabled={loading}
              className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Connect</span>
            </button>
          )}

          {status === 'pending_outgoing' && (
            <div className="w-full py-2 px-3 bg-slate-100 text-slate-500 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-not-allowed">
              <Clock className="w-3.5 h-3.5" />
              <span>Request Pending</span>
            </div>
          )}

          {status === 'pending_incoming' && (
            <div className="flex gap-2">
              <button
                onClick={handleAccept}
                disabled={loading}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Accept</span>
              </button>
              <button
                onClick={handleReject}
                disabled={loading}
                className="flex-1 py-2 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Decline</span>
              </button>
            </div>
          )}

          {status === 'connected' && (
            <div className="flex items-center gap-2">
              <div className="flex-1 py-2 px-3 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 border border-emerald-200">
                <UserCheck className="w-3.5 h-3.5" />
                <span>Connected</span>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                title="Disconnect from colleague"
              >
                <UserX className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Connect Message Modal */}
      {showMsgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="font-bold text-base text-slate-900">Connect with {researcher.name}</h3>
              <p className="text-xs text-slate-500 mt-1">
                Include a personal message explaining your shared research topics or publication goals.
              </p>
            </div>

            <textarea
              rows={3}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Hi! I came across your work on... and would love to connect on Researchly."
              className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none resize-none leading-relaxed"
            />

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => { setShowMsgModal(false); setMessage(''); }}
                className="flex-1 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendRequest}
                disabled={loading}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function NetworkPage() {
  const { user, pendingRequestsCount, refreshPendingCount, setIsAuthModalOpen } = useAuth();
  const [activeTab, setActiveTab] = useState('discover');
  const [researchers, setResearchers] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [colleaguesRes, requestsRes] = await Promise.all([
        api.getColleagues().catch(() => ({ success: false, data: [] })),
        api.getConnectionRequests().catch(() => ({ success: false, data: [] }))
      ]);

      if (colleaguesRes?.success && Array.isArray(colleaguesRes.data)) {
        setResearchers(colleaguesRes.data);
        if (Array.isArray(colleaguesRes.recommendations)) {
          setRecommendations(colleaguesRes.recommendations);
        }
      }

      if (requestsRes?.success && Array.isArray(requestsRes.data)) {
        setPendingRequests(requestsRes.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Realtime polling: refresh network requests every 10 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData, user]);

  const handleAction = async (action, id, message = '') => {
    try {
      let res;
      if (action === 'request') res = await api.sendConnectionRequest(id, message);
      else if (action === 'accept') res = await api.acceptConnection(id);
      else if (action === 'reject') res = await api.rejectConnection(id);
      else if (action === 'disconnect') res = await api.disconnectResearcher(id);

      if (res?.success) {
        await loadData();
        await refreshPendingCount();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Filtered lists
  const filtered = researchers.filter(r => {
    const q = search.toLowerCase();
    return !q ||
      r.name?.toLowerCase().includes(q) ||
      r.institution?.toLowerCase().includes(q) ||
      r.research_interests?.some(i => i.toLowerCase().includes(q));
  });

  const discoverList = filtered.filter(r => r.connection_status !== 'connected');
  const connectionsList = filtered.filter(r => r.connection_status === 'connected');
  const incomingRequests = pendingRequests.length > 0 ? pendingRequests : researchers.filter(r => r.connection_status === 'pending_incoming');

  return (
    <div className="max-w-[1700px] w-full mx-auto px-6 lg:px-12 py-8 space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Colleague Network & Research Collaborators
            </h1>
          </div>
          <p className="text-sm text-slate-500 max-w-2xl">
            Discover verified faculty, potential co-authors, and peer reviewers matched by research topic similarity and citation impact.
          </p>
        </div>

        {!user && (
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition flex items-center gap-1.5 shrink-0"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In to Connect</span>
          </button>
        )}
      </div>

      {/* Tabs & Search Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex gap-1.5 p-1.5 bg-slate-100 rounded-2xl w-fit">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badge = tab.id === 'requests' ? incomingRequests.length : null;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition relative cursor-pointer ${
                  isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {badge > 0 && (
                  <span className="w-4 h-4 bg-rose-500 text-white text-[9px] font-extrabold rounded-full flex items-center justify-center animate-pulse">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, university, keyword..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full sm:w-80 pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none bg-white transition"
          />
        </div>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="bg-white rounded-2xl border border-slate-200 p-5 h-64 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* TAB 1: DISCOVER & RECOMMENDATIONS */}
          {activeTab === 'discover' && (
            <div className="space-y-6">
              {/* Highlighted Similar Interests Recommendations */}
              {recommendations.length > 0 && !search && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span>Recommended for You (High Research Topic Overlap)</span>
                    </h2>
                    <span className="text-[11px] text-indigo-600 font-semibold">
                      Based on your focus areas
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {recommendations.map(r => (
                      <ResearcherCard
                        key={r.id}
                        researcher={r}
                        onAction={handleAction}
                        isRecommended={true}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Full Colleague Directory */}
              <section className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>Academic Directory ({discoverList.length})</span>
                </h2>

                {discoverList.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {discoverList.map(r => (
                      <ResearcherCard
                        key={r.id}
                        researcher={r}
                        onAction={handleAction}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-10 space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                      <Users className="w-8 h-8" />
                    </div>
                    <p className="font-bold text-base text-slate-900">No other researchers in network yet</p>
                    <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                      As fellow researchers, professors, and authors register on Researchly, they will appear here automatically with topic similarity scoring and collaboration recommendations.
                    </p>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 2: MY CONNECTIONS */}
          {activeTab === 'connections' && (
            <div>
              {connectionsList.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {connectionsList.map(r => (
                    <ResearcherCard
                      key={r.id}
                      researcher={r}
                      onAction={handleAction}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8 space-y-3">
                  <UserCheck className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="font-bold text-sm text-slate-800">No mutual connections yet</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Connect with fellow professors, co-authors, and researchers from the Discover tab to build your academic collaboration circle.
                  </p>
                  <button
                    onClick={() => setActiveTab('discover')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold shadow-sm hover:bg-blue-700 transition cursor-pointer"
                  >
                    Browse Directory & Suggestions
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: REQUESTS INBOX */}
          {activeTab === 'requests' && (
            <div className="max-w-2xl mx-auto space-y-4">
              {incomingRequests.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-xs font-bold text-slate-700">
                      Pending Connection Requests ({incomingRequests.length})
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Real-time updates active
                    </span>
                  </div>

                  {incomingRequests.map(r => (
                    <div
                      key={r.id || r.connection_id}
                      className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-300 transition"
                    >
                      <div className="flex items-start gap-3.5">
                        <img
                          src={r.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.name || 'U')}&background=4f46e5&color=fff&size=48`}
                          alt={r.name}
                          className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                        />
                        <div>
                          <h4 className="font-bold text-sm text-slate-900">{r.name}</h4>
                          <p className="text-xs text-slate-500">{r.role} • {r.institution}</p>
                          {r.request_message && (
                            <p className="text-xs text-slate-700 italic bg-slate-50 p-2 rounded-lg border border-slate-100 mt-2">
                              "{r.request_message}"
                            </p>
                          )}
                          {r.requested_at && (
                            <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
                              <Clock className="w-3 h-3" />
                              Requested on {new Date(r.requested_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          onClick={() => handleAction('accept', r.id)}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-2xs flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Accept</span>
                        </button>
                        <button
                          onClick={() => handleAction('reject', r.id)}
                          className="px-3.5 py-2 border border-slate-200 hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-xs font-semibold rounded-xl transition cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Decline</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8 space-y-3">
                  <Inbox className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="font-bold text-sm text-slate-800">Your requests inbox is empty</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    When other professors or researchers send you a connection invitation, it will appear here in real time for your review.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
