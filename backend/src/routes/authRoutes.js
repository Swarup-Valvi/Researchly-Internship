import express from 'express';
import { getSupabase, isSupabaseReady, checkSupabaseHealth } from '../db/supabase.js';
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

// GET connection & Supabase status
router.get('/status', async (req, res) => {
  const health = await checkSupabaseHealth();
  res.json({
    success: true,
    supabase: health
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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: full_name || 'Academic Researcher',
            institution: institution || '',
            role: role || 'Researcher',
            department: department || '',
            field_of_study: field_of_study || 'Computer Science'
          }
        }
      });

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
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

      try {
        await supabase.from('profiles').upsert(userProfile);
      } catch (e) {}

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
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

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
