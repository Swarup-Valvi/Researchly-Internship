import { type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from './States';

interface ProtectedRouteProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

export function ProtectedRoute({
  children,
  title = 'Authentication Required',
  description = 'Please sign in or create an account to view and manage your private conference shortlist and submission pipeline.',
}: ProtectedRouteProps) {
  const { user, loading, openAuthModal } = useAuth();

  if (loading) {
    return <LoadingSpinner message="Checking authentication session..." />;
  }

  if (!user) {
    return (
      <div className="card max-w-lg mx-auto p-8 text-center space-y-4 my-12 animate-fadeIn border border-slate-200">
        <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-2xl mx-auto">
          🔒
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            {description}
          </p>
        </div>
        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            onClick={() => openAuthModal('signin')}
            className="btn-primary text-xs py-2 px-5 font-bold shadow-xs"
          >
            Sign In
          </button>
          <button
            onClick={() => openAuthModal('signup')}
            className="btn-secondary text-xs py-2 px-5 font-bold"
          >
            Register
          </button>
        </div>
        <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
          User records are strictly isolated using PostgreSQL Row Level Security (RLS).
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

