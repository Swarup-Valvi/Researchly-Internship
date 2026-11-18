import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import AiPostModal from '../components/AiPostModal';
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
  Compass
} from 'lucide-react';

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

  useEffect(() => {
    async function loadFeed() {
      try {
        const [postsRes, confsRes, appsRes, commsRes] = await Promise.all([
          api.getPosts().catch(() => ({ success: false, data: [] })),
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
  }, [user]);

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
        author_avatar: user?.avatar_url
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

  // Top upcoming deadlines
  const upcomingCountdowns = conferences
    .filter(c => c.submission_deadline)
    .sort((a, b) => new Date(a.submission_deadline) - new Date(b.submission_deadline))
    .slice(0, 5);

  // =========================================================================
  // 1. GUEST / LANDING PAGE VIEW (When not logged in)
  // =========================================================================
  if (!user) {
    return (
      <div className="space-y-12 pb-16">
        {/* HERO SECTION */}
        <section className="bg-gradient-to-b from-blue-900 via-indigo-950 to-slate-950 text-white pt-16 pb-20 px-6 lg:px-12 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'radial-gradient(circle at 20% 50%, white 1.5px, transparent 1.5px), radial-gradient(circle at 80% 20%, white 1.5px, transparent 1.5px)',
              backgroundSize: '40px 40px'
            }}
          />
          <div className="max-w-[1500px] mx-auto relative z-10 text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs sm:text-sm font-semibold backdrop-blur-xs">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span>Academic Intelligence & Verified Conference Platform</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white max-w-4xl mx-auto leading-tight">
              Publish with Confidence. <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-sky-300 bg-clip-text text-transparent">
                Avoid Predatory Venues.
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
              Researchly audits academic conferences across 9 credibility dimensions, aggregates verified 2026/2027 CFPs & webinars, tracks paper submissions in Kanban, and connects researchers worldwide.
            </p>

            {/* Hero Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="w-full sm:w-auto px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-base font-bold shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserPlus className="w-5 h-5" />
                <span>Create Free Academic Account</span>
              </button>
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="w-full sm:w-auto px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl text-base font-bold backdrop-blur-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-5 h-5" />
                <span>Sign In to Account</span>
              </button>
              <Link
                to="/discover"
                className="w-full sm:w-auto px-6 py-4 text-slate-300 hover:text-white rounded-2xl text-base font-semibold transition flex items-center justify-center gap-2"
              >
                <span>Browse Verified Catalog</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Hero Key Trust Badges */}
            <div className="pt-8 border-t border-white/10 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs sm:text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>9-Dimension DBLP & CORE Audits</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Real 2026/2027 Verified Deadlines</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>AI Paper-to-Venue Semantic Matcher</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Kanban Submission Pipeline</span>
              </div>
            </div>
          </div>
        </section>

        {/* 4 CORE PLATFORM PILLARS */}
        <section className="max-w-[1700px] w-full mx-auto px-6 lg:px-12">
          <div className="text-center space-y-3 mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Built for Faculty, Postdocs, and PhD Researchers
            </h2>
            <p className="text-sm sm:text-base text-slate-500 max-w-2xl mx-auto">
              Everything you need to discover authentic research venues, protect your publication record, and collaborate.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Pillar 1 */}
            <div className="bg-white rounded-3xl border border-slate-200/90 p-8 shadow-xs hover:shadow-md transition space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">9-Dimension Credibility Audits</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Evidence-based audits surface risk indicators (sponsorship claims, domain age, DBLP presence, pay-to-publish wording) with their sources, and clearly mark what could not be checked.
              </p>
              <Link to="/discover?risk=High" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800">
                <span>View Predatory Warnings</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Pillar 2 */}
            <div className="bg-white rounded-3xl border border-slate-200/90 p-8 shadow-xs hover:shadow-md transition space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <Compass className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Verified Conferences & Webinars</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Real submission deadlines with AoE countdowns, official OpenReview/IEEE portals, and open academic seminars from Stanford, MIT, and Berkeley.
              </p>
              <Link to="/discover" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                <span>Browse Event Catalog</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Pillar 3 */}
            <div className="bg-white rounded-3xl border border-slate-200/90 p-8 shadow-xs hover:shadow-md transition space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <KanbanSquare className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Kanban Paper Tracker</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Track your active manuscripts across Bookmarked, Drafting, Under Review, and Accepted stages with 1-click tracking from any conference card.
              </p>
              <Link to="/applications" className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-800">
                <span>See Submission Pipeline</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Pillar 4 */}
            <div className="bg-white rounded-3xl border border-slate-200/90 p-8 shadow-xs hover:shadow-md transition space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Verified Faculty Network</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Connect with prospective co-authors matched by research focus areas, share preprints, and join specialized discussion hubs.
              </p>
              <Link to="/network" className="inline-flex items-center gap-1 text-sm font-semibold text-purple-600 hover:text-purple-800">
                <span>Explore Network</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* UPCOMING REAL CFPS PREVIEW */}
        <section className="max-w-[1700px] w-full mx-auto px-6 lg:px-12">
          <div className="bg-white rounded-3xl border border-slate-200/90 p-8 sm:p-10 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Upcoming Call for Papers & Academic Seminars
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  Real deadlines verified against official conference websites and submission portals.
                </p>
              </div>
              <Link
                to="/discover"
                className="px-5 py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-sm font-semibold transition shrink-0 flex items-center gap-1"
              >
                <span>View All Audited Venues</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {upcomingCountdowns.slice(0, 6).map(conf => {
                const now = new Date();
                const d = new Date(conf.submission_deadline);
                const diffDays = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
                return (
                  <div key={conf.id || conf.slug} className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:shadow-md transition space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-slate-900">{conf.name} {conf.edition}</span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        diffDays <= 14 ? 'bg-rose-100 text-rose-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {diffDays > 0 ? `${diffDays}d left` : 'Passed'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-1">{conf.title || conf.field}</p>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <span className="text-slate-600 font-medium">Due: {conf.raw_deadline || conf.submission_deadline}</span>
                      <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {typeof conf.credibility_score === 'number' ? `${conf.credibility_score}/100` : 'Not assessed'} {conf.ranking}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CALL TO ACTION BANNER */}
        <section className="max-w-[1700px] w-full mx-auto px-6 lg:px-12">
          <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 rounded-3xl p-10 sm:p-14 text-white text-center space-y-5 shadow-xl">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Ready to Accelerate Your Academic Career?
            </h2>
            <p className="text-base sm:text-lg text-blue-100 max-w-2xl mx-auto leading-relaxed">
              Create your verified profile today. Never miss an AoE submission deadline or fall victim to predatory clone conferences.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="px-8 py-3.5 bg-white text-blue-700 hover:bg-blue-50 rounded-2xl text-base font-bold shadow-lg transition cursor-pointer"
              >
                Sign Up / Sign In Now
              </button>
              <Link
                to="/discover"
                className="px-8 py-3.5 bg-blue-600/50 hover:bg-blue-600 text-white rounded-2xl text-base font-semibold border border-white/20 transition"
              >
                Explore Catalog First
              </Link>
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
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-blue-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs">
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
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden hover:shadow-md transition">
            {/* Header Cover */}
            <div className="h-24 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 relative">
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
              <div className="p-2.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
                <span className="block text-xs uppercase font-bold text-slate-400">h-index</span>
                <span className="text-base font-extrabold text-blue-600 font-mono">
                  {user.h_index ?? 0}
                </span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
                <span className="block text-xs uppercase font-bold text-slate-400">Citations</span>
                <span className="text-base font-extrabold text-slate-800 font-mono">
                  {user.citations_count ? (user.citations_count >= 1000 ? `${(user.citations_count / 1000).toFixed(1)}k` : user.citations_count) : 0}
                </span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
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
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-3">
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
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm">
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

          {/* Social Network Feed Posts (Visible to everyone when connections post) */}
          {loading ? (
            <div className="space-y-4">
              {[1, 2].map((n) => (
                <div key={n} className="bg-white rounded-2xl border border-slate-200 p-6 animate-pulse space-y-3">
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
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <MessageSquare className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Academic Feed is Ready</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                When you and your connected colleagues publish preprint announcements, CFP discussions, or queries, they will appear here in real time for everyone to see.
              </p>
            </div>
          ) : (
            posts.map((post) => (
              <article
                key={post.id}
                id={`post-${post.id}`}
                className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs transition hover:border-slate-300"
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
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm space-y-4">
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
                const now = new Date();
                const d = new Date(conf.submission_deadline);
                const diffDays = Math.ceil((d - now) / (1000 * 60 * 60 * 24));

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
                      <span className="text-slate-400">{conf.raw_deadline || conf.submission_deadline}</span>
                      <span className="font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                        {typeof conf.credibility_score === 'number' ? `${conf.credibility_score}/100` : 'Not assessed'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Credibility Verification Alert Box */}
          <div className="bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-white border border-blue-200/80 rounded-2xl p-6 shadow-sm space-y-2.5">
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
