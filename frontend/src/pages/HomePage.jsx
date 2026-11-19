import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import AiPostModal from '../components/AiPostModal';
import RiskBadge from '../components/RiskBadge';
import { sortForDiscover } from '../lib/discover';
import {
  Sparkles,
  ThumbsUp,
  MessageSquare,
  Share2,
  Calendar,
  Clock,
  Send,
  ShieldCheck,
  Bookmark,
  TrendingUp,
  FileText,
  Users,
  ArrowRight,
  GraduationCap,
  Layers,
  ChevronRight,
  ExternalLink,
  Award,
  BookOpen,
  CheckCircle2,
  Hash,
  KanbanSquare,
  FileCheck2,
  LogIn,
  UserPlus,
  Video,
  Search,
  Check,
  Compass,
  Globe2,
  UserCheck
} from 'lucide-react';
import { daysLeft, deadlineLabel, deadlineMoment } from '../lib/deadline';

export default function HomePage() {
  const { user, setIsAuthModalOpen, setIsOnboardingOpen } = useAuth();
  const [posts, setPosts] = useState([]);
  const [conferences, setConferences] = useState([]);
  const [applicationsCount, setApplicationsCount] = useState(0);
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [postContent, setPostContent] = useState('');
  const [postTags, setPostTags] = useState(['MachineLearning', 'AcademicResearch']);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [activeCommentPostId, setActiveCommentPostId] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [postCommentsMap, setPostCommentsMap] = useState({});
  const [shareSuccessId, setShareSuccessId] = useState(null);
  // Feed scope like LinkedIn: everything you may see, or only people you're connected with. Persisted per browser.
  const [feedScope, setFeedScope] = useState(() => {
    try { return localStorage.getItem('researchly_feed_scope') === 'connections' ? 'connections' : 'all'; } catch { return 'all'; }
  });
  const [postVisibility, setPostVisibility] = useState('public');
  const [feedLoading, setFeedLoading] = useState(false);

  useEffect(() => {
    async function loadFeed() {
      try {
        const [postsRes, confsRes, appsRes, commsRes] = await Promise.all([
          api.getPosts(feedScope).catch(() => ({ success: false, data: [] })),
          api.getConferences().catch(() => ({ success: false, data: [] })),
          api.getApplications().catch(() => ({ success: false, data: [] })),
          api.getCommunities().catch(() => ({ success: false, data: [] }))
        ]);

        if (postsRes?.success && Array.isArray(postsRes.data)) setPosts(postsRes.data);
        if (confsRes?.success && Array.isArray(confsRes.data)) setConferences(confsRes.data);
        if (appsRes?.success && Array.isArray(appsRes.data)) setApplicationsCount(appsRes.data.length);
        if (commsRes?.success && Array.isArray(commsRes.data)) setCommunities(commsRes.data.slice(0, 4));
      } finally {
        setLoading(false);
      }
    }
    loadFeed();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchFeedScope = async (scope) => {
    if (scope === feedScope) return;
    setFeedScope(scope);
    try { localStorage.setItem('researchly_feed_scope', scope); } catch { /* storage unavailable */ }
    setFeedLoading(true);
    try {
      const res = await api.getPosts(scope);
      if (res?.success && Array.isArray(res.data)) setPosts(res.data);
    } catch { /* keep current list */ } finally {
      setFeedLoading(false);
    }
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    if (!postContent.trim()) return;

    try {
      const res = await api.createPost({
        content: postContent,
        tags: postTags,
        author_name: user?.full_name || 'Academic Researcher',
        author_institution: user?.institution || 'Research Institute',
        author_role: user?.role || 'Researcher',
        author_avatar: user?.avatar_url,
        visibility: postVisibility
      });
      if (res?.success && res.data) {
        setPosts([res.data, ...posts]);
        setPostContent('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLike = async (postId) => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    try {
      const res = await api.toggleLike(postId);
      if (res?.success) {
        setPosts(posts.map(p => {
          if (p.id === postId) {
            return {
              ...p,
              likes_count: res.data.likes_count,
              is_liked: res.data.isLiked
            };
          }
          return p;
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleComments = async (postId) => {
    if (activeCommentPostId === postId) {
      setActiveCommentPostId(null);
      return;
    }
    setActiveCommentPostId(postId);
    if (!postCommentsMap[postId]) {
      const res = await api.getComments(postId);
      if (res?.success) {
        setPostCommentsMap(prev => ({ ...prev, [postId]: res.data }));
      }
    }
  };

  const handleAddComment = async (postId) => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    if (!commentText.trim()) return;
    try {
      const res = await api.addComment(postId, commentText, {
        name: user?.full_name || 'Researcher',
        institution: user?.institution || 'Academic Institute'
      });
      if (res?.success && res.data) {
        setPostCommentsMap(prev => ({
          ...prev,
          [postId]: [...(prev[postId] || []), res.data]
        }));
        setCommentText('');
        setPosts(posts.map(p => p.id === postId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleShare = async (postId) => {
    await api.sharePost(postId);
    setShareSuccessId(postId);
    navigator.clipboard?.writeText?.(`${window.location.origin}/#post-${postId}`);
    setTimeout(() => setShareSuccessId(null), 3000);
  };

  // Upcoming deadlines: only deadlines that are still open (AoE), soonest first.
  const upcomingCountdowns = sortForDiscover(conferences)
    .filter((c) => c.submission_deadline && daysLeft(c) >= 0)
    .slice(0, 6);

  // =========================================================================
  // 1. GUEST / LANDING PAGE VIEW (When not logged in)
  // =========================================================================
  if (!user) {
    const PILLARS = [
      { Icon: ShieldCheck, title: 'Evidence-based risk audits', to: '/discover?risk=High', cta: 'See high-risk indicators',
        text: 'Nine dimensions, each scored only from evidence with a source: DBLP indexing, CORE/CCF listings, domain age, fees, review process. What could not be checked is shown as such.' },
      { Icon: Compass, title: 'Deadlines you can trust', to: '/discover', cta: 'Browse the catalogue',
        text: 'Calls for papers with countdowns to the end of the day anywhere on earth. Time zones are shown only when the source states them.' },
      { Icon: KanbanSquare, title: 'Submission tracker', to: '/applications', cta: 'Open the tracker',
        text: 'Follow each manuscript from bookmarked to accepted, with one-click tracking from any conference.' },
      { Icon: Users, title: 'Researcher network', to: '/network', cta: 'Explore the network',
        text: 'Find co-authors by research area, share preprints and join discussion hubs.' }
    ];
    return (
      <div className="pb-20">
        {/* Hero */}
        <section className="border-b border-line bg-surface">
          <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 grid lg:grid-cols-[1.2fr_1fr] gap-12 items-center">
            <div className="space-y-6">
              <p className="eyebrow flex items-center gap-1.5"><ShieldCheck aria-hidden="true" className="w-3.5 h-3.5" /> Conference discovery and credibility</p>
              <h1 className="text-4xl sm:text-5xl text-ink max-w-2xl">
                Choose where to publish with evidence, not guesswork.
              </h1>
              <p className="text-lg text-ink-soft max-w-xl">
                Researchly lists calls for papers with reliable deadlines and audits each venue for risk indicators,
                showing the source behind every finding.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Link to="/discover" className="btn-primary px-5 py-3 text-base">
                  Browse conferences <ArrowRight aria-hidden="true" className="w-4 h-4" />
                </Link>
                <button type="button" onClick={() => setIsAuthModalOpen(true)} className="btn-secondary px-5 py-3 text-base cursor-pointer">
                  <UserPlus aria-hidden="true" className="w-4 h-4" /> Create a free account
                </button>
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-4 text-sm text-ink-muted">
                {['Sources linked for every check', 'Unknown is never scored as good', 'Deadlines in AoE'].map((t) => (
                  <li key={t} className="flex items-center gap-1.5"><CheckCircle2 aria-hidden="true" className="w-4 h-4 text-ink-faint" />{t}</li>
                ))}
              </ul>
            </div>

            {/* Upcoming deadlines panel */}
            <div className="card p-5 bg-surface-muted">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-sans text-sm font-semibold text-ink">Next deadlines</h2>
                <Link to="/discover" className="text-xs font-medium text-accent-700 hover:underline">View all</Link>
              </div>
              {upcomingCountdowns.length === 0 ? (
                <p className="text-sm text-ink-muted py-6 text-center">No open deadlines loaded yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {upcomingCountdowns.slice(0, 5).map((conf) => {
                    const d = daysLeft(conf);
                    return (
                      <li key={conf.id || conf.slug} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <Link to={`/conferences/${conf.id || conf.slug}`} className="font-semibold text-ink hover:text-accent-700">
                            {conf.name} <span className="font-normal text-ink-muted">{conf.edition}</span>
                          </Link>
                          <p className="text-xs text-ink-muted truncate">{deadlineLabel(conf)}</p>
                        </div>
                        <span className={`chip shrink-0 tabular-nums ${d <= 14 ? 'border-accent bg-accent text-accent-fg' : 'border-accent-200 bg-surface text-accent-700'}`}>
                          {d === 0 ? 'Today' : `${d} d`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Pillars */}
        <section className="max-w-page mx-auto px-4 sm:px-6 lg:px-8 pt-16" aria-labelledby="pillars-heading">
          <div className="max-w-2xl mb-8">
            <h2 id="pillars-heading" className="text-3xl">Built for faculty, postdocs and PhD researchers</h2>
            <p className="text-ink-muted mt-2">Find legitimate venues, protect your publication record, and keep your submissions on schedule.</p>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PILLARS.map(({ Icon, title, text, to, cta }) => (
              <li key={title} className="card p-6 flex flex-col gap-3 transition hover:border-line-strong">
                <div className="w-10 h-10 rounded-lg bg-accent-50 text-accent-700 flex items-center justify-center">
                  <Icon aria-hidden="true" className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-ink">{title}</h3>
                <p className="text-sm text-ink-soft flex-1">{text}</p>
                <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-accent-700 hover:underline">
                  {cta} <ChevronRight aria-hidden="true" className="w-4 h-4" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Upcoming calls */}
        <section className="max-w-page mx-auto px-4 sm:px-6 lg:px-8 pt-16" aria-labelledby="upcoming-heading">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
            <div>
              <h2 id="upcoming-heading" className="text-3xl">Open calls for papers</h2>
              <p className="text-ink-muted mt-1">Soonest deadline first. Risk shown only where evidence exists.</p>
            </div>
            <Link to="/discover" className="btn-secondary shrink-0">View all conferences <ArrowRight aria-hidden="true" className="w-4 h-4" /></Link>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingCountdowns.map((conf) => {
              const d = daysLeft(conf);
              return (
                <li key={conf.id || conf.slug} className="relative card p-5 space-y-3 transition hover:border-line-strong hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-ink">
                      <Link to={`/conferences/${conf.id || conf.slug}`} className="after:absolute after:inset-0 hover:text-accent-700">
                        {conf.name} <span className="font-normal text-ink-muted">{conf.edition}</span>
                      </Link>
                    </h3>
                    <span className={`chip shrink-0 tabular-nums ${d <= 14 ? 'border-accent bg-accent text-accent-fg' : 'border-accent-200 bg-accent-50 text-accent-700'}`}>
                      {d === 0 ? 'Due today' : `${d} days left`}
                    </span>
                  </div>
                  <p className="text-sm text-ink-muted line-clamp-1">{conf.title || conf.field}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-line text-xs">
                    <span className="text-ink-soft">Due {deadlineLabel(conf)}</span>
                    <RiskBadge risk={conf.risk_level} score={conf.credibility_score} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Call to action */}
        <section className="max-w-page mx-auto px-4 sm:px-6 lg:px-8 pt-16">
          <div className="card p-8 sm:p-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-xl">
              <h2 className="text-3xl">Never miss a deadline</h2>
              <p className="text-ink-muted mt-2">
                Create a free profile to track submissions, get matched venues for your paper, and connect with co-authors.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <button type="button" onClick={() => setIsAuthModalOpen(true)} className="btn-primary px-5 py-3 cursor-pointer">
                <LogIn aria-hidden="true" className="w-4 h-4" /> Sign up or sign in
              </button>
              <Link to="/discover" className="btn-secondary px-5 py-3">Explore the catalogue</Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // =========================================================================
  // 2. AUTHENTICATED DASHBOARD & SOCIAL FEED (When user is logged in)
  // =========================================================================
  return (
    <div className="max-w-[1700px] w-full mx-auto px-6 lg:px-12 py-8 space-y-6">
      {/* Onboarding Alert for First-Time Users */}
      {user && user.is_onboarded === false && (
        <div className="bg-accent-50 border border-blue-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">
                Welcome to Researchly, {user.full_name || 'Colleague'}!
              </p>
              <p className="text-sm text-slate-600">
                Complete your academic profile (affiliation, research topics, ORCID) to unlock tailored conference matching and collaborator recommendations.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsOnboardingOpen(true)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-xs transition shrink-0 cursor-pointer"
          >
            Complete Profile Setup
          </button>
        </div>
      )}

      {/* 3-Column Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* ================= LEFT RAIL: User Academic Identity (3 cols) ================= */}
        <aside className="lg:col-span-3 space-y-6">
          {/* User Profile Card */}
          <div className="bg-surface rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden hover:shadow-md transition">
            {/* Header Cover */}
            <div className="bg-slate-200 h-24 relative">
              <div
                className="absolute inset-0 opacity-15"
                style={{
                  backgroundImage: 'radial-gradient(circle at 20% 50%, white 1.5px, transparent 1.5px), radial-gradient(circle at 80% 20%, white 1.5px, transparent 1.5px)',
                  backgroundSize: '24px 24px'
                }}
              />
            </div>

            {/* Avatar + Info */}
            <div className="px-6 pb-6 -mt-12 text-center border-b border-slate-100">
              <div className="relative inline-block">
                <Link to="/profile">
                  <img
                    src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || user.email)}&background=4f46e5&color=fff&size=80`}
                    alt={user.full_name || 'Academic Profile'}
                    className="w-22 h-22 rounded-2xl border-4 border-white shadow-md mx-auto object-cover hover:opacity-95 transition"
                  />
                </Link>
                <div
                  className="absolute bottom-0 right-0 w-6 h-6 bg-blue-600 rounded-full border-2 border-white flex items-center justify-center text-white"
                  title="Verified Academic Account"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>

              <h2 className="text-xl font-bold text-slate-900 mt-3 leading-snug">
                <Link to="/profile" className="hover:text-blue-600 transition">
                  {user.full_name || user.email?.split('@')[0]}
                </Link>
              </h2>
              <p className="text-sm text-slate-500 font-medium line-clamp-1 mt-0.5">
                {user.role || 'Faculty Researcher'}
              </p>
              {user.institution && (
                <p className="text-sm font-semibold text-blue-600 mt-1 flex items-center justify-center gap-1.5 truncate">
                  <GraduationCap className="w-4 h-4 shrink-0" />
                  <span>{user.institution}</span>
                </p>
              )}
            </div>

            {/* Metric Grid (Zero Fake Data) */}
            <div className="p-4 bg-slate-50/70 border-b border-slate-100 grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 bg-surface rounded-xl border border-slate-200/80 shadow-2xs">
                <span className="block text-xs uppercase font-bold text-slate-400">h-index</span>
                <span className="text-base font-extrabold text-blue-600 font-mono">
                  {user.h_index ?? 0}
                </span>
              </div>
              <div className="p-2.5 bg-surface rounded-xl border border-slate-200/80 shadow-2xs">
                <span className="block text-xs uppercase font-bold text-slate-400">Citations</span>
                <span className="text-base font-extrabold text-slate-800 font-mono">
                  {user.citations_count ? (user.citations_count >= 1000 ? `${(user.citations_count / 1000).toFixed(1)}k` : user.citations_count) : 0}
                </span>
              </div>
              <div className="p-2.5 bg-surface rounded-xl border border-slate-200/80 shadow-2xs">
                <span className="block text-xs uppercase font-bold text-slate-400">Tracked</span>
                <span className="text-base font-extrabold text-emerald-600 font-mono">
                  {applicationsCount || 0}
                </span>
              </div>
            </div>

            {/* Focus Areas */}
            {user.interests && user.interests.length > 0 && (
              <div className="p-5 border-b border-slate-100">
                <span className="block text-xs uppercase font-bold tracking-wider text-slate-400 mb-2.5">
                  Research Focus
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {user.interests.slice(0, 4).map((topic, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-100"
                    >
                      #{topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Action Navigation */}
            <div className="p-4 space-y-2">
              <Link
                to="/applications"
                className="flex items-center justify-between p-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-blue-50/80 hover:text-blue-700 transition group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <KanbanSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 group-hover:text-blue-700">Submission Pipeline</div>
                    <div className="text-xs text-slate-400 font-normal">{applicationsCount} tracked submissions</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition" />
              </Link>

              <Link
                to="/ai-match"
                className="flex items-center justify-between p-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-indigo-50/80 hover:text-indigo-700 transition group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 group-hover:text-indigo-700">AI Venue Matcher</div>
                    <div className="text-xs text-slate-400 font-normal">Match abstract to top CFPs</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition" />
              </Link>

              <Link
                to="/profile"
                className="flex items-center justify-center gap-1.5 w-full py-2.5 mt-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                <span>Edit Academic Profile</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Research Hubs Box */}
          <div className="bg-surface rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span>Discussion Hubs</span>
              </h3>
              <Link to="/communities" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                Browse
              </Link>
            </div>

            <div className="space-y-2">
              {communities.map((c) => (
                <Link
                  key={c.id}
                  to="/communities"
                  className="flex items-center justify-between p-2 rounded-xl text-xs hover:bg-slate-50 transition border border-transparent hover:border-slate-100"
                >
                  <span className="font-medium text-slate-800 truncate">#{c.name}</span>
                  <span className="text-xs text-slate-400 font-mono shrink-0 ml-2">
                    {c.members_count}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </aside>

        {/* ================= CENTER RAIL: Post Composer & Social Feed (6 cols) ================= */}
        <main className="lg:col-span-6 space-y-6">
          {/* Post Composer Card */}
          <div className="bg-surface rounded-2xl border border-slate-200/90 p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <img
                src={user?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.full_name || 'U')}&background=4f46e5&color=fff`}
                alt="Avatar"
                className="w-12 h-12 rounded-2xl object-cover border border-slate-200 shrink-0"
              />
              <div className="flex-1">
                <textarea
                  rows={3}
                  placeholder={`Share a preprint milestone, CFP update, or research inquiry, ${user.full_name || ''}...`}
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  className="w-full text-sm text-slate-800 placeholder-slate-400 border border-slate-200 rounded-xl p-3.5 focus:border-blue-500 focus:outline-none transition resize-none"
                />

                {/* Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 mt-2">
                  <button
                    type="button"
                    onClick={() => setIsAiModalOpen(true)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>AI Post Assist</span>
                  </button>

                  <div className="ml-auto flex items-center gap-2">
                  <label htmlFor="post-visibility" className="sr-only">Who can see this post</label>
                  <select
                    id="post-visibility"
                    value={postVisibility}
                    onChange={(e) => setPostVisibility(e.target.value)}
                    className="text-sm border border-slate-200 rounded-xl px-2.5 py-2 bg-surface text-slate-700 focus:border-blue-500 focus:outline-none cursor-pointer"
                  >
                    <option value="public">Anyone</option>
                    <option value="connections">Connections only</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleCreatePost}
                    disabled={!postContent.trim()}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-sm transition cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Publish Post</span>
                  </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feed scope tabs */}
          <div role="tablist" aria-label="Feed" className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
            {[
              { id: 'all', label: 'All posts', Icon: Globe2 },
              { id: 'connections', label: 'My connections', Icon: UserCheck }
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={feedScope === id}
                onClick={() => switchFeedScope(id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition cursor-pointer ${
                  feedScope === id ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon aria-hidden="true" className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Social Network Feed Posts */}
          {loading || feedLoading ? (
            <div className="space-y-4">
              {[1, 2].map((n) => (
                <div key={n} className="bg-surface rounded-2xl border border-slate-200 p-6 animate-pulse space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-slate-200 rounded-xl"></div>
                    <div className="space-y-1.5 flex-1">
                      <div className="w-36 h-4 bg-slate-200 rounded"></div>
                      <div className="w-48 h-3 bg-slate-200 rounded"></div>
                    </div>
                  </div>
                  <div className="w-full h-16 bg-slate-200 rounded"></div>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="bg-surface rounded-2xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <MessageSquare className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-base text-slate-900">
                {feedScope === 'connections' ? 'No posts from your connections yet' : 'Academic Feed is Ready'}
              </h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                {feedScope === 'connections'
                  ? 'Posts by colleagues you are connected with will appear here. Grow your network to fill this feed.'
                  : 'When you and your colleagues publish preprint announcements, CFP discussions, or queries, they will appear here.'}
              </p>
              {feedScope === 'connections' && (
                <Link to="/network" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700">
                  Find colleagues <ArrowRight aria-hidden="true" className="w-4 h-4" />
                </Link>
              )}
            </div>
          ) : (
            posts.map((post) => (
              <article
                key={post.id}
                id={`post-${post.id}`}
                className="bg-surface rounded-2xl border border-slate-200/90 p-6 shadow-xs transition hover:border-slate-300"
              >
                {/* Author Info */}
                <div className="flex items-center justify-between mb-3.5">
                  <div className="flex items-center gap-3.5">
                    <img
                      src={post.author_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author_name || 'Author')}&background=4f46e5&color=fff`}
                      alt={post.author_name}
                      className="w-12 h-12 rounded-xl object-cover border border-slate-200"
                    />
                    <div>
                      <h4 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                        {post.author_name}
                      </h4>
                      <p className="text-xs sm:text-sm text-slate-500 font-medium">
                        {post.author_role} • {post.author_institution}
                      </p>
                      <span className="text-xs text-slate-400">
                        {new Date(post.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                        {post.visibility === 'connections' ? (
                          <span className="inline-flex items-center gap-1 ml-2" title="Visible to connections only">
                            · <UserCheck aria-hidden="true" className="w-3 h-3" /> Connections
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 ml-2" title="Visible to anyone">
                            · <Globe2 aria-hidden="true" className="w-3 h-3" /> Public
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Post Content */}
                <p className="text-sm sm:text-base leading-relaxed text-slate-800 whitespace-pre-line mb-3.5">
                  {post.content}
                </p>

                {/* Tags */}
                {post.tags && post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3.5">
                    {post.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Interaction Counts */}
                <div className="flex items-center justify-between py-2 border-t border-slate-100 text-xs text-slate-500">
                  <span>{post.likes_count || 0} Likes</span>
                  <span>{post.comments_count || 0} Comments</span>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-around pt-2 border-t border-slate-100">
                  <button
                    onClick={() => handleLike(post.id)}
                    className={`flex items-center gap-1.5 text-sm font-semibold py-2 px-4 rounded-xl transition cursor-pointer ${
                      post.is_liked ? 'text-blue-600 bg-blue-50' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <ThumbsUp className={`w-4 h-4 ${post.is_liked ? 'fill-blue-600' : ''}`} />
                    <span>Like</span>
                  </button>

                  <button
                    onClick={() => toggleComments(post.id)}
                    className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 py-2 px-4 rounded-xl transition cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Comment</span>
                  </button>

                  <button
                    onClick={() => handleShare(post.id)}
                    className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 py-2 px-4 rounded-xl transition cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>{shareSuccessId === post.id ? 'Copied Link!' : 'Share'}</span>
                  </button>
                </div>

                {/* Comment Section */}
                {activeCommentPostId === post.id && (
                  <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Write a constructive comment or inquiry..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)}
                        className="flex-1 text-sm px-4 py-2 border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none"
                      />
                      <button
                        onClick={() => handleAddComment(post.id)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold cursor-pointer shadow-sm transition"
                      >
                        Reply
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(postCommentsMap[post.id] || []).map((comm) => (
                        <div key={comm.id} className="p-3 bg-slate-50 rounded-xl text-xs sm:text-sm border border-slate-100">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-slate-900">{comm.author_name}</span>
                            <span className="text-xs text-slate-400">{comm.author_institution}</span>
                          </div>
                          <p className="text-slate-700 leading-relaxed">{comm.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            ))
          )}
        </main>

        {/* ================= RIGHT RAIL: Real Deadlines & Credibility (3 cols) ================= */}
        <aside className="lg:col-span-3 space-y-6">
          {/* Dynamic Deadline Countdowns */}
          <div className="bg-surface rounded-2xl border border-slate-200/90 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Upcoming CFPs</span>
              </h3>
              <Link to="/discover" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                View All
              </Link>
            </div>

            <div className="space-y-3">
              {upcomingCountdowns.map((conf) => {
                const diffDays = daysLeft(conf);

                return (
                  <div
                    key={conf.id || conf.slug}
                    className="p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/70 transition space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <Link
                        to={`/conferences/${conf.id || conf.slug}`}
                        className="font-bold text-sm text-slate-900 hover:text-blue-600 transition"
                      >
                        {conf.name} {conf.edition}
                      </Link>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          diffDays <= 14
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-blue-50 text-blue-700 border border-blue-100'
                        }`}
                      >
                        {diffDays > 0 ? `${diffDays}d left` : 'Passed'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{conf.title || conf.field}</p>
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-100/60 text-xs">
                      <span className="text-slate-400">{deadlineLabel(conf)}</span>
                      <span className="font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                        {typeof conf.credibility_score === 'number' ? `${conf.credibility_score}/100` : 'Not enough evidence'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Credibility Verification Alert Box */}
          <div className="bg-accent-50 border border-blue-200/80 rounded-2xl p-6 shadow-sm space-y-2.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0" />
              <h4 className="text-sm font-bold text-blue-900">Credibility Verification</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Every conference on Researchly is audited across 9 risk dimensions including DBLP indexation, TPC affiliations, and domain registration longevity.
            </p>
            <Link
              to="/discover?risk=High"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-900 pt-1 group"
            >
              <span>Review Flagged Predatory Venues</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
            </Link>
          </div>
        </aside>
      </div>

      {/* AI Post Modal */}
      <AiPostModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        onSelectDraft={(draft, tags) => {
          setPostContent(draft);
          if (tags && tags.length > 0) setPostTags(tags);
        }}
      />
    </div>
  );
}
