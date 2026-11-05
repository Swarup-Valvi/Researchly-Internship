import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState(null);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  useEffect(() => {
    async function init() {
      try {
        // 1. Sync Supabase session to localStorage if available (handles OAuth redirects seamlessly)
        if (isSupabaseConfigured() && supabase) {
          try {
            const { data } = await supabase.auth.getSession();
            if (data?.session?.access_token) {
              localStorage.setItem('researchly_token', data.session.access_token);
            }
          } catch (e) {
            console.warn('[AuthContext] Session retrieval error:', e);
          }
        }

        // 2. Fetch current user & system health
        const [meRes, healthRes] = await Promise.all([
          api.getCurrentUser().catch(() => null),
          api.getStatus().catch(() => null)
        ]);

        if (meRes?.success && meRes?.user) {
          setUser(meRes.user);
          // If first-time user hasn't completed academic setup
          if (meRes.user.is_onboarded === false) {
            setIsOnboardingOpen(true);
          }
        } else {
          setUser(null);
        }

        if (healthRes) {
          setSystemStatus(healthRes);
        }

        // Listen to Supabase auth events
        if (isSupabaseConfigured() && supabase) {
          const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.access_token) {
              localStorage.setItem('researchly_token', session.access_token);
              const refreshed = await api.getCurrentUser().catch(() => null);
              if (refreshed?.user) {
                setUser(refreshed.user);
                if (refreshed.user.is_onboarded === false) {
                  setIsOnboardingOpen(true);
                }
              }
            } else if (event === 'SIGNED_OUT') {
              localStorage.removeItem('researchly_token');
              setUser(null);
              setIsOnboardingOpen(false);
            }
          });
          return () => subscription?.unsubscribe();
        }
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Fetch pending requests count when user is set
  useEffect(() => {
    if (user) {
      api.getConnectionRequests()
        .then(res => {
          if (res?.success && Array.isArray(res.data)) {
            setPendingRequestsCount(res.data.length);
          }
        })
        .catch(() => {});
    } else {
      setPendingRequestsCount(0);
    }
  }, [user]);

  const login = async (email, password) => {
    const res = await api.login(email, password);
    if (res?.success && res.user) {
      setUser(res.user);
      if (res.session?.access_token) {
        localStorage.setItem('researchly_token', res.session.access_token);
      }
      setIsAuthModalOpen(false);
      if (res.user.is_onboarded === false) {
        setIsOnboardingOpen(true);
      }
    }
    return res;
  };

  const register = async (formData) => {
    const res = await api.register(formData);
    if (res?.success && res.user) {
      setUser(res.user);
      if (res.session?.access_token) {
        localStorage.setItem('researchly_token', res.session.access_token);
      }
      setIsAuthModalOpen(false);
      // New registered user gets prompted to complete academic profile
      setIsOnboardingOpen(true);
    }
    return res;
  };

  const logout = async () => {
    if (isSupabaseConfigured() && supabase) {
      await supabase.auth.signOut();
    }
    await api.logout();
    localStorage.removeItem('researchly_token');
    setUser(null);
    setPendingRequestsCount(0);
    setIsOnboardingOpen(false);
  };

  const signInWithGitHub = async () => {
    if (!isSupabaseConfigured() || !supabase) {
      return { error: 'Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.' };
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin }
    });
    return { error };
  };

  const signInWithGoogle = async () => {
    if (!isSupabaseConfigured() || !supabase) {
      return { error: 'Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.' };
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    return { error };
  };

  const updateProfile = async (profileData) => {
    const res = await api.updateProfile(profileData);
    if (res?.success && res.user) {
      setUser(res.user);
    }
    return res;
  };

  const refreshPendingCount = async () => {
    if (user) {
      const res = await api.getConnectionRequests().catch(() => null);
      if (res?.success) setPendingRequestsCount(res.data?.length || 0);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthModalOpen,
        setIsAuthModalOpen,
        isOnboardingOpen,
        setIsOnboardingOpen,
        login,
        register,
        logout,
        signInWithGitHub,
        signInWithGoogle,
        updateProfile,
        systemStatus,
        pendingRequestsCount,
        refreshPendingCount
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
