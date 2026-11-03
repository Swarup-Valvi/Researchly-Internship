import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  authSignIn,
  authSignUp,
  authSignOut,
  authGetSession,
  isSupabaseConfigured,
  supabase,
  type AuthUser,
} from '../lib/supabase';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isSupabaseConfigured: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, pass: string, name: string) => Promise<{ success: boolean; error?: string; requiresConfirmation?: boolean }>;
  logout: () => Promise<void>;
  // Auth modal management
  showAuthModal: boolean;
  authModalMode: 'signin' | 'signup';
  openAuthModal: (mode?: 'signin' | 'signup') => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');

  // Load session on startup
  useEffect(() => {
    let mounted = true;

    async function initSession() {
      try {
        const { user: initialUser } = await authGetSession();
        if (mounted && initialUser) {
          setUser(initialUser);
          localStorage.setItem('researchly_user_id', initialUser.id);
        }
      } catch (err) {
        console.error('Failed to initialize auth session:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initSession();

    // Listen to live Supabase auth state change if Supabase is connected
    if (supabase) {
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        if (session?.user) {
          const authUser: AuthUser = {
            id: session.user.id,
            email: session.user.email ?? '',
            fullName: session.user.user_metadata?.full_name,
            createdAt: session.user.created_at,
          };
          setUser(authUser);
          localStorage.setItem('researchly_user_id', authUser.id);
        } else {
          setUser(null);
        }
      });

      return () => {
        mounted = false;
        listener.subscription.unsubscribe();
      };
    }

    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, pass: string) => {
    const res = await authSignIn(email, pass);
    if (res.error) {
      return { success: false, error: res.error };
    }
    if (res.user) {
      setUser(res.user);
      localStorage.setItem('researchly_user_id', res.user.id);
      setShowAuthModal(false);
      return { success: true };
    }
    return { success: false, error: 'Login failed.' };
  }, []);

  const register = useCallback(async (email: string, pass: string, name: string) => {
    const res = await authSignUp(email, pass, name);
    if (res.error) {
      return { success: false, error: res.error };
    }
    if (res.user) {
      if (res.session) {
        setUser(res.user);
        localStorage.setItem('researchly_user_id', res.user.id);
        setShowAuthModal(false);
        return { success: true, requiresConfirmation: false };
      } else {
        // Registration created user in Supabase, but email confirmation is pending
        return { success: true, requiresConfirmation: true };
      }
    }
    return { success: false, error: 'Registration failed.' };
  }, []);

  const logout = useCallback(async () => {
    await authSignOut();
    setUser(null);
  }, []);

  const openAuthModal = useCallback((mode: 'signin' | 'signup' = 'signin') => {
    setAuthModalMode(mode);
    setShowAuthModal(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setShowAuthModal(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isSupabaseConfigured,
        login,
        register,
        logout,
        showAuthModal,
        authModalMode,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

