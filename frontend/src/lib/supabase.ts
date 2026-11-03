import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';

// Normalize Supabase URL: support both standard https://<project>.supabase.co
// and dashboard settings URL auto-extraction https://supabase.com/dashboard/project/<project>/settings/api-keys
function resolveSupabaseUrl(): string {
  let url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
  if (url.includes('supabase.com/dashboard/project/')) {
    const match = url.match(/project\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://${match[1]}.supabase.co`;
    }
  }
  return url;
}

const supabaseUrl = resolveSupabaseUrl();
const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  ''
).trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('http') &&
  supabaseAnonKey.length > 10
);

// Never initialize with empty strings to prevent Supabase JS runtime throwing errors
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
  createdAt?: string;
}

export interface AuthResponse {
  user: AuthUser | null;
  session: Session | { access_token: string; user: AuthUser } | null;
  error: string | null;
}

// Local storage keys for standalone / offline fallback auth
const LOCAL_USERS_KEY = 'researchly_auth_users';
const LOCAL_SESSION_KEY = 'researchly_auth_session';

interface StoredLocalUser {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  createdAt: string;
}

function getLocalUsers(): StoredLocalUser[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalUsers(users: StoredLocalUser[]) {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {
    // ignore
  }
}

export async function authSignUp(
  email: string,
  password: string,
  fullName: string
): Promise<AuthResponse> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) {
    return { user: null, session: null, error: 'Email and password are required.' };
  }
  if (password.length < 6) {
    return { user: null, session: null, error: 'Password must be at least 6 characters.' };
  }

  // 1. Live Supabase if configured
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim() || undefined,
          },
        },
      });

      if (!error && data.user) {
        const u = data.user;
        const authUser: AuthUser = {
          id: u.id,
          email: u.email ?? cleanEmail,
          fullName: u.user_metadata?.full_name ?? fullName,
          createdAt: u.created_at,
        };
        return { user: authUser, session: data.session, error: null };
      }

      // Return explicit Supabase auth error (e.g. already registered) unless it is a network unreachable failure
      if (error && !error.message.toLowerCase().includes('fetch failed')) {
        return { user: null, session: null, error: error.message };
      }
    } catch {
      // Fallback to local session on network unreachable
    }
  }

  // 2. Local Fallback Auth Provider (Multi-User Isolated)
  const users = getLocalUsers();
  const existing = users.find(u => u.email === cleanEmail);
  if (existing) {
    return { user: null, session: null, error: 'An account with this email already exists.' };
  }

  const userId = `usr_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
  const newUser: StoredLocalUser = {
    id: userId,
    email: cleanEmail,
    passwordHash: btoa(password), // Simple encoding for local test storage
    fullName: fullName.trim(),
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveLocalUsers(users);

  const authUser: AuthUser = {
    id: newUser.id,
    email: newUser.email,
    fullName: newUser.fullName,
    createdAt: newUser.createdAt,
  };

  const session = {
    access_token: `mock_jwt_${userId}`,
    user: authUser,
  };

  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
  localStorage.setItem('researchly_user_id', authUser.id);

  return { user: authUser, session, error: null };
}

export async function authSignIn(
  email: string,
  password: string
): Promise<AuthResponse> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) {
    return { user: null, session: null, error: 'Email and password are required.' };
  }

  // 1. Live Supabase
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (!error && data.user) {
        const u = data.user;
        const authUser: AuthUser = {
          id: u.id,
          email: u.email ?? cleanEmail,
          fullName: u.user_metadata?.full_name,
          createdAt: u.created_at,
        };
        return { user: authUser, session: data.session, error: null };
      }

      if (error && !error.message.toLowerCase().includes('fetch failed')) {
        return { user: null, session: null, error: error.message };
      }
    } catch {
      // Fallback to local session on network unreachable
    }
  }

  // 2. Local Fallback
  const users = getLocalUsers();
  const user = users.find(u => u.email === cleanEmail);
  if (!user || user.passwordHash !== btoa(password)) {
    return { user: null, session: null, error: 'Invalid email or password.' };
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    createdAt: user.createdAt,
  };

  const session = {
    access_token: `mock_jwt_${user.id}`,
    user: authUser,
  };

  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
  localStorage.setItem('researchly_user_id', authUser.id);

  return { user: authUser, session, error: null };
}

export async function authSignOut(): Promise<void> {
  if (supabase) {
    await supabase.auth.signOut();
  }
  localStorage.removeItem(LOCAL_SESSION_KEY);
  // Generate a fresh anonymous id for logged out guest session
  const guestId = `guest_${Math.random().toString(36).substring(2, 9)}`;
  localStorage.setItem('researchly_user_id', guestId);
}

export async function authGetSession(): Promise<{ user: AuthUser | null; token: string | null }> {
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (session?.user) {
        const u = session.user;
        return {
          user: {
            id: u.id,
            email: u.email ?? '',
            fullName: u.user_metadata?.full_name,
            createdAt: u.created_at,
          },
          token: session.access_token,
        };
      }
    } catch {
      // Fall through to local session check
    }
  }

  // Local fallback session
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.user) {
        return {
          user: parsed.user,
          token: parsed.access_token ?? null,
        };
      }
    }
  } catch {
    // ignore
  }

  return { user: null, token: null };
}
