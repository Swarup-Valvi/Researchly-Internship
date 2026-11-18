import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Home, Compass, Sparkles, KanbanSquare, FileCheck2,
  Users, LogIn, LogOut, User, GraduationCap, Bell,
  Menu, X, ChevronDown, Moon, Sun
} from 'lucide-react';

const NAV_LINKS = [
  { to: '/', label: 'Feed', icon: Home },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/ai-match', label: 'AI Matcher', icon: Sparkles },
  { to: '/applications', label: 'Tracker', icon: KanbanSquare },
  { to: '/paper-review', label: 'Peer Review', icon: FileCheck2 },
  { to: '/network', label: 'Network', icon: Users },
];

/** Light/dark theme: saved choice, else the OS preference (set before paint in index.html). */
function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('researchly_theme', next ? 'dark' : 'light'); } catch { /* private mode */ }
    setDark(next);
  };
  return [dark, toggle];
}

export default function Navbar() {
  const [dark, toggleTheme] = useTheme();
  const location = useLocation();
  const { user, logout, setIsAuthModalOpen, pendingRequestsCount } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') { setShowUserMenu(false); setShowMobileMenu(false); }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    setShowMobileMenu(false);
  }, [location.pathname]);

  const NavLink = ({ to, label, icon: Icon, onClick }) => {
    const isActive = location.pathname === to;
    return (
      <Link
        to={to}
        onClick={onClick}
        aria-current={isActive ? 'page' : undefined}
        className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors duration-150 ${
          isActive
            ? 'bg-accent-50 text-accent-700 font-semibold'
            : 'text-ink-soft hover:text-ink hover:bg-surface-sunken'
        }`}
      >
        <Icon aria-hidden="true" className={`w-4 h-4 ${isActive ? 'text-accent' : 'text-ink-faint'}`} />
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur border-b border-line">
      <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 rounded-lg" aria-label="Researchly home">
            <div className="bg-accent w-8 h-8 rounded-lg flex items-center justify-center">
              <GraduationCap aria-hidden="true" className="w-[18px] h-[18px] text-white" />
            </div>
            <div className="font-serif text-xl font-semibold text-ink tracking-tight">
              Researchly<span className="text-ink-muted font-normal">.io</span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav aria-label="Main" className="hidden lg:flex items-center gap-0.5">
            {NAV_LINKS.map(link => {
              const isActive = location.pathname === link.to;
              const Icon = link.icon;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-150 ${
                    isActive
                      ? 'text-accent-700 font-semibold after:absolute after:left-3 after:right-3 after:-bottom-[15px] after:h-0.5 after:bg-accent'
                      : 'text-ink-soft hover:text-ink hover:bg-surface-sunken'
                  }`}
                >
                  <Icon aria-hidden="true" className={`w-4 h-4 ${isActive ? 'text-accent' : 'text-ink-faint'}`} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Side Actions */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
              title={dark ? 'Light theme' : 'Dark theme'}
              className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-sunken transition"
            >
              {dark ? <Sun aria-hidden="true" className="w-[18px] h-[18px]" /> : <Moon aria-hidden="true" className="w-[18px] h-[18px]" />}
            </button>
            {user ? (
              <>
                {/* Requests Bell with Badge */}
                <Link
                  to="/network"
                  className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
                  title="Connection requests inbox"
                  aria-label={`Connection requests${pendingRequestsCount ? ` (${pendingRequestsCount} pending)` : ''}`}
                >
                  <Bell className="w-5 h-5 text-slate-600" />
                  {pendingRequestsCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-rose-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
                    </span>
                  )}
                </Link>

                {/* User Avatar Menu */}
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    aria-haspopup="menu"
                    aria-expanded={showUserMenu}
                    aria-label="Account menu"
                    className="flex items-center gap-2 p-1 pr-2.5 rounded-xl hover:bg-slate-100 transition cursor-pointer border border-transparent hover:border-slate-200"
                  >
                    <img
                      src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || 'U')}&background=4548a1&color=fff&size=36`}
                      alt={user.full_name || 'Profile'}
                      className="w-8 h-8 rounded-xl object-cover border border-slate-200 shadow-2xs"
                    />
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-64 bg-surface rounded-2xl shadow-xl border border-slate-200/90 py-2 z-50 animate-in fade-in duration-100">
                      {/* User Info Header */}
                      <div className="px-4 py-3 border-b border-slate-100">
                        <p className="text-sm font-bold text-slate-900 truncate">{user.full_name || 'Academic Faculty'}</p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{user.email}</p>
                        <p className="text-xs font-semibold text-blue-600 mt-0.5 truncate">{user.institution}</p>
                      </div>

                      <div className="p-1 space-y-0.5">
                        <Link
                          to="/profile"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition"
                        >
                          <User className="w-4 h-4 text-slate-400" />
                          <span>View &amp; Edit Profile</span>
                        </Link>
                        <Link
                          to="/applications"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition"
                        >
                          <KanbanSquare className="w-4 h-4 text-slate-400" />
                          <span>My Submission Pipeline</span>
                        </Link>
                        <Link
                          to="/network"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition"
                        >
                          <Bell className="w-4 h-4 text-slate-400" />
                          <span>Connection Inbox</span>
                          {pendingRequestsCount > 0 && (
                            <span className="ml-auto px-1.5 py-0.5 bg-rose-100 text-rose-700 text-xs font-bold rounded-full">
                              {pendingRequestsCount}
                            </span>
                          )}
                        </Link>
                      </div>

                      <div className="border-t border-slate-100 my-1 pt-1 px-1">
                        <button
                          onClick={() => { logout(); setShowUserMenu(false); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition text-left cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="btn-primary py-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </button>
            )}

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              aria-label={showMobileMenu ? 'Close menu' : 'Open menu'}
              aria-expanded={showMobileMenu}
              aria-controls="mobile-nav"
              className="lg:hidden p-2 text-ink-muted hover:text-ink hover:bg-surface-sunken rounded-lg transition-colors duration-150"
            >
              {showMobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {showMobileMenu && (
        <nav id="mobile-nav" aria-label="Main" className="lg:hidden border-t border-line bg-surface px-4 py-3 space-y-1">
          {NAV_LINKS.map(link => (
            <NavLink key={link.to} to={link.to} label={link.label} icon={link.icon} />
          ))}
          {user && (
            <div className="border-t border-slate-100 my-2 pt-2">
              <NavLink to="/profile" label="My Profile" icon={User} />
            </div>
          )}
        </nav>
      )}
    </header>
  );
}
