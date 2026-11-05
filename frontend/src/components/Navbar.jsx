import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Home, Compass, Sparkles, KanbanSquare, FileCheck2,
  Users, LogIn, LogOut, User, GraduationCap, Bell,
  Menu, X, ChevronDown
} from 'lucide-react';

const NAV_LINKS = [
  { to: '/', label: 'Feed', icon: Home },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/ai-match', label: 'AI Matcher', icon: Sparkles },
  { to: '/applications', label: 'Tracker', icon: KanbanSquare },
  { to: '/paper-review', label: 'Peer Review', icon: FileCheck2 },
  { to: '/network', label: 'Network', icon: Users },
];

export default function Navbar() {
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
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition ${
          isActive
            ? 'bg-blue-50 text-blue-700 font-semibold'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
        }`}
      >
        <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
      <div className="max-w-screen-2xl mx-auto px-6 lg:px-10">
        <div className="flex items-center justify-between h-[68px]">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-sm shadow-blue-500/20 group-hover:scale-105 transition">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-1">
                Researchly<span className="text-blue-600 font-extrabold">.io</span>
              </div>
              <div className="text-[10px] text-slate-400 font-semibold tracking-wide uppercase -mt-0.5">
                Academic Intelligence
              </div>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(link => {
              const isActive = location.pathname === link.to;
              const Icon = link.icon;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Side Actions */}
          <div className="flex items-center gap-2.5">
            {user ? (
              <>
                {/* Requests Bell with Badge */}
                <Link
                  to="/network"
                  className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
                  title="Connection requests inbox"
                >
                  <Bell className="w-5 h-5 text-slate-600" />
                  {pendingRequestsCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
                      {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
                    </span>
                  )}
                </Link>

                {/* User Avatar Menu */}
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 p-1 pr-2.5 rounded-xl hover:bg-slate-100 transition cursor-pointer border border-transparent hover:border-slate-200"
                  >
                    <img
                      src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || 'U')}&background=3b82f6&color=fff&size=36`}
                      alt={user.full_name || 'Profile'}
                      className="w-8 h-8 rounded-xl object-cover border border-slate-200 shadow-2xs"
                    />
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200/90 py-2 z-50 animate-in fade-in duration-100">
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
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition shadow-sm cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </button>
            )}

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition"
            >
              {showMobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {showMobileMenu && (
        <div className="md:hidden border-t border-slate-100 bg-white px-4 py-3 space-y-1">
          {NAV_LINKS.map(link => (
            <NavLink key={link.to} to={link.to} label={link.label} icon={link.icon} />
          ))}
          {user && (
            <div className="border-t border-slate-100 my-2 pt-2">
              <NavLink to="/profile" label="My Profile" icon={User} />
            </div>
          )}
        </div>
      )}
    </header>
  );
}
