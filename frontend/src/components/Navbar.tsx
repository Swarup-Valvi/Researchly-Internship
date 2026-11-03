import { useState, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { getHealth } from '../api/client';
import { useAuth } from '../context/AuthContext';

export function Navbar() {
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const { user, openAuthModal, logout, isSupabaseConfigured } = useAuth();

  useEffect(() => {
    getHealth()
      .then(() => setApiOnline(true))
      .catch(() => setApiOnline(false));
  }, []);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-50 text-blue-700 font-semibold shadow-xs'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
    }`;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Navigation */}
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5 font-bold text-slate-900 group">
              <span className="w-9 h-9 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-sm text-lg group-hover:scale-105 transition-transform">
                🔬
              </span>
              <span className="text-lg tracking-tight">
                Researchly<span className="text-blue-600 font-bold">.io</span>
              </span>
            </Link>

            {/* Nav links */}
            <nav className="hidden md:flex items-center gap-1.5">
              <NavLink to="/" end className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/conferences" className={navLinkClass}>
                Conferences
              </NavLink>
              <NavLink to="/match" className={navLinkClass}>
                AI Paper Match
              </NavLink>
              <NavLink to="/tracking" className={navLinkClass}>
                Tracking
              </NavLink>
              <NavLink to="/applications" className={navLinkClass}>
                Applications
              </NavLink>
            </nav>
          </div>

          {/* Right side status & User Profile */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">
              <span
                className={`w-2 h-2 rounded-full ${
                  apiOnline === true
                    ? 'bg-emerald-500 ring-2 ring-emerald-200'
                    : apiOnline === false
                    ? 'bg-rose-500 ring-2 ring-rose-200'
                    : 'bg-amber-400'
                }`}
                aria-hidden="true"
              />
              <span className="text-slate-600">
                {apiOnline === true ? 'Backend Online' : apiOnline === false ? 'API Offline' : 'Connecting...'}
              </span>
            </div>

            {/* Authentication Control */}
            {user ? (
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-blue-50/80 border border-blue-200 text-xs"
                  title={isSupabaseConfigured ? 'Authenticated via Supabase' : 'Authenticated via Local Session'}
                >
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
                    {(user.fullName ?? user.email).charAt(0).toUpperCase()}
                  </span>
                  <div className="max-w-[130px] truncate text-slate-800 font-semibold">
                    {user.fullName || user.email.split('@')[0]}
                  </div>
                  {isSupabaseConfigured && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Supabase Active" />
                  )}
                </div>
                <button
                  onClick={logout}
                  className="btn-secondary text-xs py-1 px-2.5"
                  title="Sign out of current account"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => openAuthModal('signin')}
                  className="btn-secondary text-xs py-1.5 px-3"
                >
                  Sign In
                </button>
                <button
                  onClick={() => openAuthModal('signup')}
                  className="btn-primary text-xs py-1.5 px-3"
                >
                  Register
                </button>
              </div>
            )}

            <Link
              to="/match"
              className="btn-primary text-xs hidden sm:inline-flex"
            >
              ✨ Match Paper
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
