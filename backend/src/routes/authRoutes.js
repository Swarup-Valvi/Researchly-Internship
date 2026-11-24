import express from 'express';
import { getSupabase, isSupabaseReady, checkSupabaseHealth, hasServiceRole, createAuthClient } from '../db/supabase.js';
import { store } from '../db/store.js';

const router = express.Router();

export function getLocalUser(token) {
  return store.getLocalProfile(token);
}

// Helper to extract bearer token
function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  return null;
}

// No email confirmation step: accounts are created (or marked) confirmed via the service-role admin API.
const isUnconfirmed = (err) => /not confirmed/i.test(err?.message || '');

async function findAuthUserIdByEmail(email) {
  const supabase = getSupabase();
  const { data: p } = await supabase.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (p?.id) return p.id;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const u = data.users.find((x) => (x.email || '').toLowerCase() === email.toLowerCase());
    if (u) return u.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function confirmEmail(email) {
  if (!hasServiceRole()) return false;
  const id = await findAuthUserIdByEmail(email);
  if (!id) return false;
  const { error } = await getSupabase().auth.admin.updateUserById(id, { email_confirm: true });
  return !error;
}

/** Password sign-in on a throwaway client; auto-confirms an unconfirmed account once and retries. */
async function passwordSignIn(email, password) {
  const auth = createAuthClient();
  let r = await auth.auth.signInWithPassword({ email, password });
  if (r.error && isUnconfirmed(r.error) && await confirmEmail(email)) {
    r = await auth.auth.signInWithPassword({ email, password });
  }
  return r;
}

// GET connection & Supabase status
router.get('/status', async (req, res) => {
  const health = await checkSupabaseHealth();
  // service_role: true only when the backend's key can really use the admin API (needed for no-confirmation sign-up
  // and for the owner-only RLS policies of migrations/008). Reports a boolean, never the key.
  let serviceRole = false;
  if (hasServiceRole()) {
    try {
      const { error } = await getSupabase().auth.admin.listUsers({ page: 1, perPage: 1 });
      serviceRole = !error;
    } catch { serviceRole = false; }
  }
  res.json({
    success: true,
    supabase: { ...health, service_role: serviceRole }
  });
});

// GET current session / profile
router.get('/me', async (req, res) => {
  const token = getBearerToken(req);

  // If no auth token is provided, the user is a guest (null)
  if (!token) {
    return res.json({
      success: true,
      mode: 'unauthenticated',
      user: null
    });
  }

  // 1. Try Supabase cloud auth if available
  if (isSupabaseReady()) {
    try {
      const supabase = getSupabase();
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (!error && user) {
        // Query profiles table
        let { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        // If no profile exists yet for this OAuth or new user, auto-provision initial profile
        if (!profile) {
          const newProfile = {
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
            role: user.user_metadata?.role || 'Researcher',
            institution: user.user_metadata?.institution || '',
            department: user.user_metadata?.department || '',
            field_of_study: user.user_metadata?.field_of_study || 'Computer Science',
            location: '',
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.email || 'User')}&background=4f46e5&color=fff`,
            h_index: 0,
            citations_count: 0,
            publications_count: 0,
            bio: '',
            interests: [],
            orcid_id: '',
            scholar_url: '',
            website_url: '',
            github_url: '',
            linkedin_url: '',
            target_venues: [],
            open_to_collaborations: true,
            open_to_peer_review: true,
            is_onboarded: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          try {
            const { data: inserted } = await supabase.from('profiles').insert(newProfile).select().single();
            if (inserted) profile = inserted;
          } catch (e) {
            profile = newProfile;
          }
        }

        return res.json({
          success: true,
          mode: 'supabase',
          user: profile
        });
      }
    } catch (err) {
      console.warn('[Auth] Supabase getUser error:', err.message);
    }
  }

  // 2. Check local user registry (for local mode sessions)
  const localUser = store.getLocalProfile(token);
  if (localUser) {
    return res.json({
      success: true,
      mode: 'local-session',
      user: localUser
    });
  }

  // Invalid or expired token
  res.json({
    success: true,
    mode: 'unauthenticated',
    user: null
  });
});

// GET profile
router.get('/profile', async (req, res) => {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Sign in to view profile.' });
  }

  if (isSupabaseReady()) {
    try {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (profile) return res.json({ success: true, user: profile });
      }
    } catch (err) {
      console.warn('[Auth] Fetch profile error:', err.message);
    }
  }

  const localProfile = store.getLocalProfile(token);
  if (localProfile) {
    return res.json({ success: true, user: localProfile });
  }

  res.status(401).json({ success: false, error: 'User session not found.' });
});

// PUT update profile / onboard
router.put('/profile', async (req, res) => {
  try {
    const updates = req.body;
    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required to update profile.' });
    }

    // 1. Supabase Cloud update
    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          const profilePayload = {
            id: user.id,
            email: user.email,
            full_name: updates.full_name !== undefined ? updates.full_name : user.user_metadata?.full_name,
            role: updates.role,
            institution: updates.institution,
            department: updates.department,
            field_of_study: updates.field_of_study,
            location: updates.location,
            avatar_url: updates.avatar_url,
            bio: updates.bio,
            interests: Array.isArray(updates.interests) ? updates.interests : [],
            orcid_id: updates.orcid_id,
            scholar_url: updates.scholar_url,
            website_url: updates.website_url,
            github_url: updates.github_url,
            linkedin_url: updates.linkedin_url,
            target_venues: Array.isArray(updates.target_venues) ? updates.target_venues : [],
            open_to_collaborations: updates.open_to_collaborations !== undefined ? updates.open_to_collaborations : true,
            open_to_peer_review: updates.open_to_peer_review !== undefined ? updates.open_to_peer_review : true,
            h_index: updates.h_index ? parseInt(updates.h_index) : 0,
            citations_count: updates.citations_count ? parseInt(updates.citations_count) : 0,
            publications_count: updates.publications_count ? parseInt(updates.publications_count) : 0,
            is_onboarded: updates.is_onboarded !== undefined ? updates.is_onboarded : true,
            updated_at: new Date().toISOString()
          };

          const { data, error } = await supabase
            .from('profiles')
            .upsert(profilePayload)
            .select()
            .single();

          if (!error && data) {
            return res.json({ success: true, message: 'Profile updated successfully.', user: data });
          }
        }
      } catch (err) {
        console.warn('[Auth] Supabase profile upsert error:', err.message);
      }
    }

    // 2. Local fallback user update
    const existing = store.getLocalProfile(token);
    if (existing) {
      const updatedUser = {
        ...existing,
        ...updates,
        is_onboarded: updates.is_onboarded !== undefined ? updates.is_onboarded : true,
        updated_at: new Date().toISOString()
      };
      store.saveLocalProfile(token, updatedUser);
      return res.json({ success: true, message: 'Profile updated successfully.', user: updatedUser });
    }

    res.status(400).json({ success: false, error: 'Could not update profile.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST register
router.post('/register', async (req, res) => {
  const {
    email,
    password,
    full_name,
    institution,
    role,
    department,
    field_of_study,
    interests
  } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  // 1. Supabase Cloud Sign Up
  if (isSupabaseReady()) {
    try {
      const supabase = getSupabase();
      const metadata = {
        full_name: full_name || 'Academic Researcher',
        institution: institution || '',
        role: role || 'Researcher',
        department: department || '',
        field_of_study: field_of_study || 'Computer Science'
      };
      let data;
      if (hasServiceRole()) {
        // Create the user already confirmed: no verification email, they can sign in immediately.
        const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
        if (created.error) {
          if (/already|registered|exists/i.test(created.error.message)) {
            return res.status(400).json({ success: false, error: 'An account with this email already exists. Please sign in.' });
          }
          return res.status(400).json({ success: false, error: created.error.message });
        }
        const signed = await passwordSignIn(email, password);
        if (signed.error) return res.status(400).json({ success: false, error: signed.error.message });
        data = { user: created.data.user, session: signed.data.session };
      } else {
        const r = await createAuthClient().auth.signUp({ email, password, options: { data: metadata } });
        if (r.error) return res.status(400).json({ success: false, error: r.error.message });
        data = r.data;
      }

      const userProfile = {
        id: data.user?.id || `usr-${Date.now()}`,
        email,
        full_name: full_name || 'Academic Researcher',
        institution: institution || '',
        role: role || 'Researcher',
        department: department || '',
        field_of_study: field_of_study || 'Computer Science',
        location: '',
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(full_name || email)}&background=4f46e5&color=fff`,
        h_index: 0,
        citations_count: 0,
        publications_count: 0,
        bio: '',
        interests: Array.isArray(interests) ? interests : [],
        orcid_id: '',
        scholar_url: '',
        website_url: '',
        github_url: '',
        linkedin_url: '',
        target_venues: [],
        open_to_collaborations: true,
        open_to_peer_review: true,
        is_onboarded: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error: profileError } = await supabase.from('profiles').upsert(userProfile);
      if (profileError) console.error('[Auth] profile upsert failed:', profileError.message);

      return res.json({
        success: true,
        message: 'Account created successfully.',
        user: userProfile,
        session: data.session
      });
    } catch (err) {
      console.warn('[Auth] Supabase signup error, using local registration:', err.message);
    }
  }

  // 2. Local fallback registration
  const localUserId = `usr-${Date.now()}`;
  const token = `localtok-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const newUser = {
    id: localUserId,
    email,
    full_name: full_name || 'Academic Researcher',
    institution: institution || '',
    role: role || 'Researcher',
    department: department || '',
    field_of_study: field_of_study || 'Computer Science',
    location: '',
    avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(full_name || email)}&background=4f46e5&color=fff`,
    h_index: 0,
    citations_count: 0,
    publications_count: 0,
    bio: '',
    interests: Array.isArray(interests) ? interests : [],
    orcid_id: '',
    scholar_url: '',
    website_url: '',
    github_url: '',
    linkedin_url: '',
    target_venues: [],
    open_to_collaborations: true,
    open_to_peer_review: true,
    is_onboarded: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  store.saveLocalProfile(token, newUser);

  res.json({
    success: true,
    message: 'Registered successfully.',
    user: newUser,
    session: { access_token: token }
  });
});

// POST login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  // 1. Supabase Cloud Sign In
  if (isSupabaseReady()) {
    try {
      const supabase = getSupabase();
      const { data, error } = await passwordSignIn(email, password);

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      // Fetch profile
      let { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (!profile) {
        profile = {
          id: data.user.id,
          email: data.user.email,
          full_name: data.user.user_metadata?.full_name || '',
          role: data.user.user_metadata?.role || 'Researcher',
          institution: data.user.user_metadata?.institution || '',
          department: data.user.user_metadata?.department || '',
          field_of_study: 'Computer Science',
          avatar_url: data.user.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.user.email)}&background=4f46e5&color=fff`,
          h_index: 0,
          citations_count: 0,
          publications_count: 0,
          interests: [],
          is_onboarded: false
        };
        const { error: insErr } = await supabase.from('profiles').upsert(profile);
        if (insErr) console.error('[Auth] profile create on login failed:', insErr.message);
      }

      return res.json({
        success: true,
        message: 'Signed in successfully.',
        user: profile,
        session: data.session
      });
    } catch (err) {
      console.warn('[Auth] Supabase login error:', err.message);
    }
  }

  // 2. Local fallback login
  for (const user of store.getAllLocalProfiles()) {
    if (user.email.toLowerCase() === email.toLowerCase()) {
      const token = `localtok-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      store.saveLocalProfile(token, user);
      return res.json({
        success: true,
        message: 'Signed in successfully.',
        user,
        session: { access_token: token }
      });
    }
  }

  // If local user doesn't exist, create an account
  const localUserId = `usr-${Date.now()}`;
  const token = `localtok-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const newUser = {
    id: localUserId,
    email,
    full_name: email.split('@')[0].replace('.', ' '),
    role: 'Researcher',
    institution: '',
    department: '',
    field_of_study: 'Computer Science',
    location: '',
    avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(email)}&background=4f46e5&color=fff`,
    h_index: 0,
    citations_count: 0,
    publications_count: 0,
    bio: '',
    interests: [],
    orcid_id: '',
    scholar_url: '',
    website_url: '',
    github_url: '',
    linkedin_url: '',
    target_venues: [],
    open_to_collaborations: true,
    open_to_peer_review: true,
    is_onboarded: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  store.saveLocalProfile(token, newUser);

  res.json({
    success: true,
    message: 'Signed in successfully.',
    user: newUser,
    session: { access_token: token }
  });
});

// POST logout
router.post('/logout', async (req, res) => {
  const token = getBearerToken(req);
  if (token && localUsers.has(token)) {
    localUsers.delete(token);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

export default router;
