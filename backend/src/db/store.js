import crypto from 'crypto';
import { getSupabase, isSupabaseReady } from './supabase.js';

/** Never swallow Supabase failures: log table + operation + message (local store remains the fallback). */
function logSupabaseError(table, op, error) {
  if (error?.code === 'PGRST116') return; // .single() found no row: a normal miss, not a failure
  console.error(`[Store] Supabase ${op} on table "${table}" failed: ${error?.message || error}`);
}
import { REAL_ACADEMIC_EVENTS } from './realEvents.js';
import { evaluateConferenceCredibility } from '../services/credibilityEngine.js';
import { config } from '../config/env.js';
import { filterFeed, normalizeVisibility } from '../services/feed.js';

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import {
  initialConferences,
  initialDeadlineHistory,
  initialPosts,
  initialComments,
  initialApplications,
  initialCommunities,
  initialResearchers
} from './seedData.js';

// Pre-load all verified real academic conferences, workshops, and webinars
// Curated seed (hand-entered, unverified). Hard-coded scores are discarded; the engine decides.
const normalizedRealEvents = (config.enableCuratedSeed ? REAL_ACADEMIC_EVENTS : []).map(e => {
  const slug = `${e.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${e.edition}`;
  // eslint-disable-next-line no-unused-vars
  const { credibility_score, risk_level, ...rest } = e;
  return {
    ...rest,
    id: e.id || slug,
    slug,
    data_origin: 'curated_seed',
    needs_verification: true,
    credibility_score: null,
    risk_level: 'Not assessed'
  };
});

/**
 * Same conference + year, independent of publisher prefixes: "ACM CHI" 2026 == "CHI" 2026, "NeurIPS" 2026 == "neurips" 2026.
 * Seed records use name = acronym, edition = year; pipeline records are mapped the same way (mapPipelineRecord).
 */
export function conferenceYearKey(c) {
  const n = String(c?.name || '').toLowerCase().replace(/^(acm|ieee|usenix|aaai)\s+/, '').replace(/[^a-z0-9]/g, '');
  const y = String(c?.edition || '').match(/\b(19|20)\d{2}\b/);
  return n && y ? `${n}|${y[0]}` : null;
}

// Autonomous in-memory database state
let conferences = [...normalizedRealEvents];
// Audits are computed from evidence at startup (the old hand-written audits were removed).
let credibilityAudits = {};
for (const c of conferences) {
  const audit = evaluateConferenceCredibility(c);
  credibilityAudits[c.id] = audit;
  c.credibility_score = audit.overall_score;
  c.risk_level = audit.risk_level;
}
let deadlineHistory = JSON.parse(JSON.stringify(initialDeadlineHistory));
let posts = JSON.parse(JSON.stringify(initialPosts));
let comments = JSON.parse(JSON.stringify(initialComments));
let applications = JSON.parse(JSON.stringify(initialApplications));
let paperReviews = [];
let researchers = JSON.parse(JSON.stringify(initialResearchers));
let communities = JSON.parse(JSON.stringify(initialCommunities));
let connections = [];
let localProfiles = new Map();
let likedPostIds = new Set();

export const store = {
  // --- Conferences ---
  async getConferences(filters = {}) {
    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        let query = supabase.from('conferences').select('*').order('submission_deadline', { ascending: true });
        
        if (filters.field && filters.field !== 'All') {
          query = query.ilike('field', `%${filters.field}%`);
        }
        if (filters.format && filters.format !== 'All') {
          query = query.eq('format', filters.format);
        }
        if (filters.risk && filters.risk !== 'All') {
          query = query.eq('risk_level', filters.risk);
        }

        const { data, error } = await query;

        if (error) logSupabaseError('conferences', 'select', error);
        if (!error && data && data.length > 0) {
          return data;
        }
      } catch (err) {
        logSupabaseError('conferences', 'getConferences', err);
      }
    }

    // Local fallback with filtering. A curated_seed record is hidden once a pipeline record exists for the same
    // conference and year (the pipeline wins); the seed stays reachable by id, marked superseded.
    const pipelineKeys = new Set(conferences.filter((c) => c.data_origin === 'pipeline').map(conferenceYearKey).filter(Boolean));
    let results = conferences.filter((c) => !c.superseded &&
      !(c.data_origin === 'curated_seed' && pipelineKeys.has(conferenceYearKey(c))));

    if (filters.search) {
      const q = filters.search.toLowerCase();
      results = results.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.title && c.title.toLowerCase().includes(q)) ||
        (c.location && c.location.toLowerCase().includes(q)) ||
        (c.topics && c.topics.some(t => t.toLowerCase().includes(q)))
      );
    }

    if (filters.field && filters.field !== 'All') {
      const f = filters.field.toLowerCase();
      results = results.filter(c => c.field.toLowerCase().includes(f));
    }

    if (filters.format && filters.format !== 'All') {
      results = results.filter(c => c.format.toLowerCase() === filters.format.toLowerCase());
    }

    if (filters.event_type && filters.event_type !== 'All') {
      results = results.filter(c => (c.event_type || 'Conference').toLowerCase() === filters.event_type.toLowerCase());
    }

    if (filters.risk && filters.risk !== 'All') {
      results = results.filter(c => c.risk_level.toLowerCase() === filters.risk.toLowerCase());
    }

    if (filters.status && filters.status !== 'All') {
      const now = new Date().toISOString().split('T')[0];
      if (filters.status === 'Open') {
        results = results.filter(c => !c.submission_deadline || c.submission_deadline >= now);
      } else if (filters.status === 'Closing Soon') {
        const in14Days = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
        results = results.filter(c => c.submission_deadline && c.submission_deadline >= now && c.submission_deadline <= in14Days);
      } else if (filters.status === 'Past') {
        results = results.filter(c => c.submission_deadline && c.submission_deadline < now);
      }
    }

    return results;
  },

  /**
   * Mark in-memory curated_seed records for the same conference + year as superseded by `pipelineConf`.
   * Seeds are local-only (never written to Supabase), so this never upserts them. Returns the ids marked.
   */
  supersedeSeeds(pipelineConf) {
    const key = conferenceYearKey(pipelineConf);
    if (!key || pipelineConf.data_origin !== 'pipeline') return [];
    const marked = [];
    for (const c of conferences) {
      if (c.data_origin === 'curated_seed' && conferenceYearKey(c) === key) {
        c.superseded = true;
        c.superseded_by = pipelineConf.id;
        marked.push(c.id);
      }
    }
    return marked;
  },

  async getConferenceById(idOrSlug) {
    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('conferences')
          .select('*')
          .or(`id.eq.${idOrSlug},slug.eq.${idOrSlug}`)
          .single();
        if (error) logSupabaseError('conferences', 'select', error);
        if (!error && data) return data;
      } catch (err) {
        logSupabaseError('conferences', 'getConferenceById', err);
      }
    }

    return conferences.find(c => c.id === idOrSlug || c.slug === idOrSlug) || null;
  },

  async saveConference(confData) {
    const slug = confData.slug || `${confData.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${confData.edition}`;
    const newConf = {
      ...confData,
      id: confData.id || slug,
      slug,
      topics: Array.isArray(confData.topics) ? confData.topics : [],
      credibility_score: confData.credibility_score ?? null,
      risk_level: confData.risk_level || 'Not assessed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    // Privacy guard: committee member names/affiliations are audit-time only and must never be persisted.
    delete newConf.committee;

    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { error } = await supabase.from('conferences').upsert(newConf);
        if (error) logSupabaseError('conferences', 'upsert', error);
      } catch (err) {
        logSupabaseError('conferences', 'saveConference', err);
      }
    }

    const idx = conferences.findIndex(c => c.id === newConf.id);
    if (idx >= 0) {
      conferences[idx] = { ...conferences[idx], ...newConf };
    } else {
      conferences.unshift(newConf);
    }
    return newConf;
  },

  // --- Credibility Audits ---
  async getCredibilityAudit(conferenceId) {
    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('credibility_audits')
          .select('*')
          .eq('conference_id', conferenceId)
          .single();
        if (error) logSupabaseError('credibility_audits', 'select', error);
        if (!error && data) return data;
      } catch (err) {
        logSupabaseError('credibility_audits', 'getCredibilityAudit', err);
      }
    }

    return credibilityAudits[conferenceId] || null;
  },

  async saveCredibilityAudit(audit) {
    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { error } = await supabase.from('credibility_audits').upsert(audit, { onConflict: 'conference_id' }); // one audit per conference
        if (error) logSupabaseError('credibility_audits', 'upsert', error);
      } catch (err) {
        logSupabaseError('credibility_audits', 'saveCredibilityAudit', err);
      }
    }

    credibilityAudits[audit.conference_id] = audit;
    return audit;
  },

  // --- Deadline History ---
  async getDeadlineHistory(conferenceId) {
    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('deadline_history')
          .select('*')
          .eq('conference_id', conferenceId)
          .order('detected_at', { ascending: false });
        if (error) logSupabaseError('deadline_history', 'select', error);
        if (!error && data) return data;
      } catch (err) {
        logSupabaseError('deadline_history', 'getDeadlineHistory', err);
      }
    }

    return deadlineHistory.filter(dh => dh.conference_id === conferenceId);
  },

  async recordDeadlineChange(change) {
    const record = {
      id: change.id || `dh-${crypto.randomUUID()}`,
      conference_id: change.conference_id,
      previous_deadline: change.previous_deadline,
      new_deadline: change.new_deadline,
      raw_previous_deadline: change.raw_previous_deadline || change.previous_deadline,
      raw_new_deadline: change.raw_new_deadline || change.new_deadline,
      change_reason: change.change_reason || 'Deadline extension detected by automated CFP crawler',
      detected_at: new Date().toISOString()
    };

    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { error } = await supabase.from('deadline_history').insert(record);
        if (error) logSupabaseError('deadline_history', 'insert', error);
      } catch (err) {
        logSupabaseError('deadline_history', 'recordDeadlineChange', err);
      }
    }

    deadlineHistory.unshift(record);
    return record;
  },

  // --- Posts & Feed ---
  async getPosts({ viewerId = null, scope = 'all' } = {}) {
    let all = null;
    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('posts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);
        if (error) logSupabaseError('posts', 'select', error);
        if (!error && data && data.length > 0) {
          // keep locally created posts that never reached Supabase
          const ids = new Set(data.map(p => p.id));
          all = [...data, ...posts.filter(p => !ids.has(p.id))]
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        }
      } catch (err) {
        logSupabaseError('posts', 'getPosts', err);
      }
    }
    if (!all) all = [...posts];
    const connectedIds = viewerId ? await this.getConnectedIds(viewerId) : new Set();
    return filterFeed(all, { viewerId, connectedIds, scope });
  },

  /** Ids of everyone with an accepted connection to userId (either direction). */
  async getConnectedIds(userId) {
    const ids = new Set();
    if (!userId) return ids;
    const add = (c) => {
      if (c.status !== 'connected') return;
      if (c.user_id === userId) ids.add(c.target_user_id);
      else if (c.target_user_id === userId) ids.add(c.user_id);
    };
    connections.forEach(add);
    if (isSupabaseReady() && UUID_RX.test(userId)) {
      try {
        const { data, error } = await getSupabase()
          .from('colleague_connections')
          .select('user_id, target_user_id, status')
          .eq('status', 'connected')
          .or(`user_id.eq.${userId},target_user_id.eq.${userId}`);
        if (error) logSupabaseError('colleague_connections', 'select', error);
        (data || []).forEach(add);
      } catch (err) {
        logSupabaseError('colleague_connections', 'getConnectedIds', err);
      }
    }
    return ids;
  },

  async createPost(postData) {
    const newPost = {
      id: crypto.randomUUID(),                       // posts.id is a UUID column
      user_id: postData.user_id || null,             // FK to auth.users; never a placeholder string
      visibility: normalizeVisibility(postData.visibility),
      author_name: postData.author_name || 'Academic Researcher',
      author_role: postData.author_role || 'Researcher',
      author_institution: postData.author_institution || 'University',
      author_avatar: postData.author_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(postData.author_name || 'Researcher')}&background=4f46e5&color=fff`,
      content: postData.content,
      tags: Array.isArray(postData.tags) ? postData.tags : [],
      likes_count: 0,
      comments_count: 0,
      shares_count: 0,
      media_url: postData.media_url || null,
      created_at: new Date().toISOString()
    };

    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        // a local-profile user id is not an auth.users id: store it locally only
        const row = UUID_RX.test(newPost.user_id || '') ? newPost : { ...newPost, user_id: null };
        const { error } = await supabase.from('posts').insert(row);
        if (error) logSupabaseError('posts', 'insert', error);
      } catch (err) {
        logSupabaseError('posts', 'createPost', err);
      }
    }

    posts.unshift(newPost);
    return newPost;
  },

  async toggleLike(postId, userId = 'usr-current') {
    let post = posts.find(p => p.id === postId);
    if (!post && isSupabaseReady() && UUID_RX.test(postId)) {
      const { data } = await getSupabase().from('posts').select('*').eq('id', postId).maybeSingle();
      if (data) { post = { ...data, likes_count: data.likes_count || 0 }; posts.push(post); }
    }
    if (!post) return { error: 'Post not found' };

    const key = `${postId}_${userId}`;
    const isLiked = likedPostIds.has(key);

    if (isLiked) {
      likedPostIds.delete(key);
      post.likes_count = Math.max(0, post.likes_count - 1);
    } else {
      likedPostIds.add(key);
      post.likes_count += 1;
    }

    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { error } = await supabase.from('posts').update({ likes_count: post.likes_count }).eq('id', postId);
        if (error) logSupabaseError('posts', 'update', error);
      } catch (err) {
        logSupabaseError('posts', 'toggleLike', err);
      }
    }

    return { likes_count: post.likes_count, isLiked: !isLiked };
  },

  async getComments(postId) {
    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('post_comments')
          .select('*')
          .eq('post_id', postId)
          .order('created_at', { ascending: true });
        if (error) logSupabaseError('post_comments', 'select', error);
        if (!error && data) return data;
      } catch (err) {
        logSupabaseError('post_comments', 'getComments', err);
      }
    }

    return comments.filter(c => c.post_id === postId);
  },

  async addComment(commentData) {
    const newComment = {
      id: commentData.id || `c-${crypto.randomUUID()}`,
      post_id: commentData.post_id,
      user_id: commentData.user_id || 'usr-current',
      author_name: commentData.author_name || 'Dr. Alex Morgan',
      author_institution: commentData.author_institution || 'Research Institute',
      author_avatar: commentData.author_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      content: commentData.content,
      created_at: new Date().toISOString()
    };

    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { error } = await supabase.from('post_comments').insert(newComment);
        if (error) logSupabaseError('post_comments', 'insert', error);
      } catch (err) {
        logSupabaseError('post_comments', 'addComment', err);
      }
    }

    comments.push(newComment);

    const post = posts.find(p => p.id === commentData.post_id);
    if (post) {
      post.comments_count = (post.comments_count || 0) + 1;
    }

    return newComment;
  },

  // --- Applications Tracker (Kanban) ---
  async getApplications(userId = 'current-user') {
    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('applications')
          .select('*')
          .order('updated_at', { ascending: false });
        if (error) logSupabaseError('applications', 'select', error);
        if (!error && data && data.length > 0) return data;
      } catch (err) {
        logSupabaseError('applications', 'getApplications', err);
      }
    }

    return [...applications];
  },

  async createApplication(appData) {
    const newApp = {
      id: appData.id || `app-${crypto.randomUUID()}`,
      user_id: appData.user_id || 'current-user',
      conference_id: appData.conference_id || null,
      conference_name: appData.conference_name || 'Target Conference',
      paper_title: appData.paper_title || 'Untitled Research Draft',
      abstract: appData.abstract || '',
      status: appData.status || 'Bookmarked',
      target_deadline: appData.target_deadline || null,
      co_authors: Array.isArray(appData.co_authors) ? appData.co_authors : (appData.co_authors ? [appData.co_authors] : []),
      notes: appData.notes || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { error } = await supabase.from('applications').insert(newApp);
        if (error) logSupabaseError('applications', 'insert', error);
      } catch (err) {
        logSupabaseError('applications', 'createApplication', err);
      }
    }

    applications.unshift(newApp);
    return newApp;
  },

  async updateApplication(id, updates) {
    const idx = applications.findIndex(a => a.id === id);
    if (idx === -1) return null;

    applications[idx] = {
      ...applications[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };

    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { error } = await supabase.from('applications').update(applications[idx]).eq('id', id);
        if (error) logSupabaseError('applications', 'update', error);
      } catch (err) {
        logSupabaseError('applications', 'updateApplication', err);
      }
    }

    return applications[idx];
  },

  async deleteApplication(id) {
    const idx = applications.findIndex(a => a.id === id);
    if (idx === -1) return false;

    applications.splice(idx, 1);

    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { error } = await supabase.from('applications').delete().eq('id', id);
        if (error) logSupabaseError('applications', 'delete', error);
      } catch (err) {
        logSupabaseError('applications', 'deleteApplication', err);
      }
    }

    return true;
  },

  // --- Paper Reviews ---
  async getPaperReviews(userId = 'current-user') {
    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('paper_reviews')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) logSupabaseError('paper_reviews', 'select', error);
        if (!error && data && data.length > 0) return data;
      } catch (err) {
        logSupabaseError('paper_reviews', 'getPaperReviews', err);
      }
    }

    return [...paperReviews];
  },

  async savePaperReview(review) {
    const newReview = {
      id: review.id || `rev-${crypto.randomUUID()}`,
      user_id: review.user_id || 'current-user',
      title: review.title,
      abstract: review.abstract,
      full_text: review.full_text || '',
      overall_rating: review.overall_rating || 'Borderline Accept',
      readiness_score: review.readiness_score || 82,
      executive_summary: review.executive_summary || '',
      strengths: review.strengths || [],
      weaknesses: review.weaknesses || [],
      methodology_critique: review.methodology_critique || '',
      literature_gaps: review.literature_gaps || '',
      revision_suggestions: review.revision_suggestions || [],
      recommended_conferences: review.recommended_conferences || [],
      created_at: new Date().toISOString()
    };

    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { error } = await supabase.from('paper_reviews').insert(newReview);
        if (error) logSupabaseError('paper_reviews', 'insert', error);
      } catch (err) {
        logSupabaseError('paper_reviews', 'savePaperReview', err);
      }
    }

    paperReviews.unshift(newReview);
    return newReview;
  },

  // --- Local Profile State (for local / offline auth sessions) ---
  saveLocalProfile(token, profile) {
    localProfiles.set(token, profile);
  },
  getLocalProfile(token) {
    return localProfiles.get(token) || null;
  },
  getAllLocalProfiles() {
    return Array.from(localProfiles.values());
  },

  // --- Researchers, Realtime Connections & Interest Recommendations ---
  async getResearchers(currentUserId = null, currentUserInterests = []) {
    let allResearchers = [...researchers];

    // Include registered local users if any
    for (const lp of localProfiles.values()) {
      if (!allResearchers.some(r => r.id === lp.id)) {
        allResearchers.push({
          id: lp.id,
          name: lp.full_name || lp.email?.split('@')[0] || 'Academic Researcher',
          role: lp.role || 'Researcher',
          institution: lp.institution || 'University',
          department: lp.department || '',
          h_index: lp.h_index ?? 0,
          citations: lp.citations_count ?? 0,
          publications: lp.publications_count ?? 0,
          bio: lp.bio || `Researcher in ${lp.field_of_study || 'Computer Science'}.`,
          research_interests: Array.isArray(lp.interests) && lp.interests.length > 0 ? lp.interests : ['Computer Science'],
          avatar: lp.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(lp.full_name || lp.email)}&background=4f46e5&color=fff`,
          connection_status: 'none'
        });
      }
    }

    // If Supabase is online, pull real profiles
    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { data: dbProfiles, error: dbProfilesError } = await supabase.from('profiles').select('*');
        if (dbProfilesError) logSupabaseError('profiles', 'select', dbProfilesError);
        if (dbProfiles && dbProfiles.length > 0) {
          // Merge real profiles with researchers
          const mappedDbProfiles = dbProfiles.map(p => ({
            id: p.id,
            name: p.full_name || p.email.split('@')[0],
            role: p.role || 'Academic Researcher',
            institution: p.institution || 'University',
            department: p.department || '',
            h_index: p.h_index ?? 0,
            citations: p.citations_count ?? 0,
            publications: p.publications_count ?? 0,
            bio: p.bio || `Researcher in ${p.field_of_study || 'Computer Science'}.`,
            research_interests: Array.isArray(p.interests) && p.interests.length > 0 ? p.interests : ['Computer Science'],
            avatar: p.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.full_name || p.email)}&background=4f46e5&color=fff`,
            connection_status: 'none'
          }));

          // Avoid duplicates by id
          for (const dbp of mappedDbProfiles) {
            const idx = allResearchers.findIndex(r => r.id === dbp.id);
            if (idx >= 0) allResearchers[idx] = dbp;
            else allResearchers.push(dbp);
          }
        }

        // Fetch real connections for this user if logged in
        if (currentUserId) {
          const { data: dbConnections, error: dbConnectionsError } = await supabase
            .from('colleague_connections')
            .select('*')
            .or(`user_id.eq.${currentUserId},target_user_id.eq.${currentUserId}`);
          if (dbConnectionsError) logSupabaseError('colleague_connections', 'select', dbConnectionsError);
          
          if (dbConnections && dbConnections.length > 0) {
            // Merge into local connections
            for (const dbConn of dbConnections) {
              const existingIdx = connections.findIndex(c => c.id === dbConn.id);
              if (existingIdx >= 0) connections[existingIdx] = dbConn;
              else connections.push(dbConn);
            }
          }
        }
      } catch (err) {
        logSupabaseError('profiles/colleague_connections', 'getResearchers', err);
      }
    }

    // Filter out current user from directory
    if (currentUserId) {
      allResearchers = allResearchers.filter(r => r.id !== currentUserId);
    }

    // Calculate connection_status and research similarity for each researcher
    const cleanInterests = Array.isArray(currentUserInterests) ? currentUserInterests.map(i => i.toLowerCase().trim()) : [];

    const enriched = allResearchers.map(r => {
      const rInterests = Array.isArray(r.research_interests) ? r.research_interests : [];
      
      // 1. Connection status
      let status = 'none';
      let requestMessage = null;
      let requestedAt = null;

      if (currentUserId) {
        const outConn = connections.find(c => c.user_id === currentUserId && c.target_user_id === r.id);
        const inConn = connections.find(c => c.user_id === r.id && c.target_user_id === currentUserId);

        if (outConn && outConn.status === 'connected') status = 'connected';
        else if (inConn && inConn.status === 'connected') status = 'connected';
        else if (outConn && outConn.status === 'pending') {
          status = 'pending_outgoing';
          requestMessage = outConn.request_message;
          requestedAt = outConn.created_at;
        } else if (inConn && inConn.status === 'pending') {
          status = 'pending_incoming';
          requestMessage = inConn.request_message;
          requestedAt = inConn.created_at;
        }
      } else {
        status = r.connection_status || 'none';
        requestMessage = r.request_message;
        requestedAt = r.requested_at;
      }

      // 2. Smart Research Interest Similarity Calculation
      const sharedInterests = rInterests.filter(ri => {
        const riLower = ri.toLowerCase().trim();
        return cleanInterests.some(ci =>
          ci === riLower ||
          ci.includes(riLower) ||
          riLower.includes(ci) ||
          ci.split(/[\s,&/-]+/).some(word => word.length > 3 && riLower.includes(word))
        );
      });
      let similarityScore = 40;
      if (cleanInterests.length > 0) {
        if (sharedInterests.length > 0) {
          similarityScore = Math.min(99, Math.round(65 + (sharedInterests.length / Math.max(1, cleanInterests.length)) * 30));
        } else {
          similarityScore = Math.floor(25 + ((r.name.charCodeAt(0) * 7) % 25));
        }
      } else {
        similarityScore = Math.floor(60 + ((r.name.charCodeAt(0) * 11) % 25));
      }

      return {
        ...r,
        connection_status: status,
        request_message: requestMessage,
        requested_at: requestedAt,
        shared_interests: sharedInterests,
        similarity_score: similarityScore
      };
    });

    // Sort: high topic similarity & not connected first
    enriched.sort((a, b) => {
      if (a.connection_status === 'pending_incoming' && b.connection_status !== 'pending_incoming') return -1;
      if (b.connection_status === 'pending_incoming' && a.connection_status !== 'pending_incoming') return 1;
      return (b.similarity_score || 0) - (a.similarity_score || 0);
    });

    return enriched;
  },

  async getPendingRequests(currentUserId = null) {
    if (!currentUserId) {
      return researchers.filter(r => r.connection_status === 'pending_incoming');
    }

    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { data: dbRequests, error: dbRequestsError } = await supabase
          .from('colleague_connections')
          .select('*, sender:profiles!colleague_connections_user_id_fkey(*)')
          .eq('target_user_id', currentUserId)
          .eq('status', 'pending');
        if (dbRequestsError) logSupabaseError('colleague_connections', 'select', dbRequestsError);

        if (dbRequests && dbRequests.length > 0) {
          return dbRequests.map(req => ({
            id: req.user_id,
            connection_id: req.id,
            name: req.sender?.full_name || 'Academic Colleague',
            role: req.sender?.role || 'Researcher',
            institution: req.sender?.institution || 'Research Institute',
            avatar: req.sender?.avatar_url || `https://ui-avatars.com/api/?name=Colleague&background=4f46e5&color=fff`,
            h_index: req.sender?.h_index ?? 0,
            request_message: req.request_message || 'Connection request sent.',
            requested_at: req.created_at,
            connection_status: 'pending_incoming'
          }));
        }
      } catch (e) {
        logSupabaseError('colleague_connections', 'getPendingRequests', e);
      }
    }

    // Local connections filter
    const incomingConns = connections.filter(c => c.target_user_id === currentUserId && c.status === 'pending');
    return incomingConns.map(c => {
      const localSender = Array.from(localProfiles.values()).find(p => p.id === c.user_id);
      const sender = researchers.find(r => r.id === c.user_id) || (localSender ? {
        id: localSender.id,
        name: localSender.full_name || localSender.email?.split('@')[0],
        role: localSender.role || 'Academic Researcher',
        institution: localSender.institution || 'University',
        avatar: localSender.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(localSender.full_name || 'U')}&background=4f46e5&color=fff`,
        h_index: localSender.h_index ?? 0
      } : {
        id: c.user_id,
        name: 'Academic Colleague',
        role: 'Researcher',
        institution: 'University Partner',
        avatar: `https://ui-avatars.com/api/?name=Colleague&background=4f46e5&color=fff`,
        h_index: 0
      });
      return {
        ...sender,
        connection_id: c.id,
        connection_status: 'pending_incoming',
        request_message: c.request_message,
        requested_at: c.created_at
      };
    });
  },

  async sendConnectionRequest(currentUserId, targetResearcherId, message = '') {
    const senderId = currentUserId || 'usr-current-faculty';
    const targetId = targetResearcherId;

    const existingIdx = connections.findIndex(c =>
      (c.user_id === senderId && c.target_user_id === targetId) ||
      (c.user_id === targetId && c.target_user_id === senderId)
    );

    const now = new Date().toISOString();
    const connRecord = {
      id: `conn-${Date.now()}`,
      user_id: senderId,
      target_user_id: targetId,
      status: 'pending',
      request_message: message || 'Would love to connect and follow your research publications.',
      created_at: now,
      updated_at: now
    };

    if (existingIdx >= 0) {
      connections[existingIdx] = { ...connections[existingIdx], ...connRecord };
    } else {
      connections.push(connRecord);
    }

    // Sync to Supabase
    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { error } = await supabase.from('colleague_connections').upsert({
          user_id: senderId,
          target_user_id: targetId,
          status: 'pending',
          request_message: message,
          created_at: now,
          updated_at: now
        }, { onConflict: 'user_id,target_user_id' });
        if (error) logSupabaseError('colleague_connections', 'upsert', error);
      } catch (err) {
        logSupabaseError('colleague_connections', 'sendConnectionRequest', err);
      }
    }

    // Also update memory researcher if present
    const r = researchers.find(item => item.id === targetId);
    if (r) {
      r.connection_status = 'pending_outgoing';
      r.requested_at = now;
      r.request_message = message;
    }

    return { ...r, connection_status: 'pending_outgoing', requested_at: now, request_message: message };
  },

  async acceptConnectionRequest(currentUserId, requesterId) {
    const userId = currentUserId || 'usr-current-faculty';
    const otherId = requesterId;

    const conn = connections.find(c =>
      (c.user_id === otherId && c.target_user_id === userId) ||
      (c.user_id === userId && c.target_user_id === otherId)
    );

    const now = new Date().toISOString();
    if (conn) {
      conn.status = 'connected';
      conn.updated_at = now;
    } else {
      connections.push({
        id: `conn-${Date.now()}`,
        user_id: otherId,
        target_user_id: userId,
        status: 'connected',
        created_at: now,
        updated_at: now
      });
    }

    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { error } = await supabase
          .from('colleague_connections')
          .update({ status: 'connected', updated_at: now })
          .or(`and(user_id.eq.${otherId},target_user_id.eq.${userId}),and(user_id.eq.${userId},target_user_id.eq.${otherId})`);
        if (error) logSupabaseError('colleague_connections', 'update', error);
      } catch (err) {
        logSupabaseError('colleague_connections', 'acceptConnectionRequest', err);
      }
    }

    const r = researchers.find(item => item.id === otherId);
    if (r) {
      r.connection_status = 'connected';
      r.requested_at = null;
      r.request_message = null;
    }
    return { ...r, connection_status: 'connected' };
  },

  async rejectConnectionRequest(currentUserId, requesterId) {
    const userId = currentUserId || 'usr-current-faculty';
    const otherId = requesterId;

    const idx = connections.findIndex(c =>
      (c.user_id === otherId && c.target_user_id === userId) ||
      (c.user_id === userId && c.target_user_id === otherId)
    );

    if (idx >= 0) {
      connections.splice(idx, 1);
    }

    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { error } = await supabase
          .from('colleague_connections')
          .delete()
          .or(`and(user_id.eq.${otherId},target_user_id.eq.${userId}),and(user_id.eq.${userId},target_user_id.eq.${otherId})`);
        if (error) logSupabaseError('colleague_connections', 'delete', error);
      } catch (err) {
        logSupabaseError('colleague_connections', 'rejectConnectionRequest', err);
      }
    }

    const r = researchers.find(item => item.id === otherId);
    if (r) {
      r.connection_status = 'none';
      r.requested_at = null;
      r.request_message = null;
    }
    return { ...r, connection_status: 'none' };
  },

  async disconnectResearcher(currentUserId, targetResearcherId) {
    const userId = currentUserId || 'usr-current-faculty';
    const otherId = targetResearcherId;

    const idx = connections.findIndex(c =>
      (c.user_id === userId && c.target_user_id === otherId) ||
      (c.user_id === otherId && c.target_user_id === userId)
    );

    if (idx >= 0) {
      connections.splice(idx, 1);
    }

    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { error } = await supabase
          .from('colleague_connections')
          .delete()
          .or(`and(user_id.eq.${userId},target_user_id.eq.${otherId}),and(user_id.eq.${otherId},target_user_id.eq.${userId})`);
        if (error) logSupabaseError('colleague_connections', 'delete', error);
      } catch (err) {
        logSupabaseError('colleague_connections', 'disconnectResearcher', err);
      }
    }

    const r = researchers.find(item => item.id === otherId);
    if (r) {
      r.connection_status = 'none';
      r.requested_at = null;
      r.request_message = null;
    }
    return { ...r, connection_status: 'none' };
  },

  async getCommunities() {
    return [...communities];
  }
};

