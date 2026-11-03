import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export function AuthModal() {
  const {
    showAuthModal,
    authModalMode,
    closeAuthModal,
    openAuthModal,
    login,
    register,
    isSupabaseConfigured,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!showAuthModal) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email || !password) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setSubmitting(true);
    try {
      if (authModalMode === 'signin') {
        const res = await login(email, password);
        if (!res.success) {
          setErrorMessage(res.error ?? 'Invalid email or password.');
        } else {
          setEmail('');
          setPassword('');
        }
      } else {
        const res = await register(email, password, fullName);
        if (!res.success) {
          setErrorMessage(res.error ?? 'Registration failed.');
        } else if (res.requiresConfirmation) {
          setSuccessMessage(
            'Account created successfully in Supabase! A verification email has been sent. Please confirm your email before signing in.'
          );
          setEmail('');
          setPassword('');
          setFullName('');
        } else {
          setSuccessMessage('Account created successfully!');
          setEmail('');
          setPassword('');
          setFullName('');
        }
      }
    } catch {
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="card max-w-md w-full p-6 shadow-2xl relative bg-white border border-slate-200">
        {/* Close Button */}
        <button
          onClick={closeAuthModal}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors text-lg font-bold p-1"
          aria-label="Close dialog"
        >
          ✕
        </button>

        {/* Header */}
        <div className="text-center space-y-1 mb-5">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-600 font-extrabold text-lg mb-1">
            🔬
          </div>
          <h2 className="text-xl font-extrabold text-slate-900">
            {authModalMode === 'signin' ? 'Sign In to Researchly' : 'Create Researcher Account'}
          </h2>
          <p className="text-xs text-slate-500">
            {authModalMode === 'signin'
              ? 'Access your persisted submissions, shortlist, and match history'
              : 'Join the community to track deadlines and monitor credibility'}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-lg mb-5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setSuccessMessage(null);
              openAuthModal('signin');
            }}
            className={`py-1.5 rounded-md transition-colors ${
              authModalMode === 'signin'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setSuccessMessage(null);
              openAuthModal('signup');
            }}
            className={`py-1.5 rounded-md transition-colors ${
              authModalMode === 'signup'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Register
          </button>
        </div>

        {/* Status Alerts */}
        {errorMessage && (
          <div className="p-3 mb-4 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-start gap-2">
            <span>✓</span>
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {authModalMode === 'signup' && (
            <div>
              <label className="label">Full Name or Academic Title</label>
              <input
                type="text"
                placeholder="Dr. Jane Smith / Postdoctoral Fellow"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="input text-xs"
              />
            </div>
          )}

          <div>
            <label className="label">Institutional or Work Email</label>
            <input
              type="email"
              required
              placeholder="researcher@university.edu"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input text-xs"
            />
          </div>

          <div>
            <label className="label">Password</label>
            <input
              type="password"
              required
              placeholder="Minimum 6 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full text-xs py-2.5 font-bold shadow-xs mt-2"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {authModalMode === 'signin' ? 'Authenticating...' : 'Creating Account...'}
              </span>
            ) : authModalMode === 'signin' ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        {/* Connection Notice */}
        <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>Storage engine:</span>
          {isSupabaseConfigured ? (
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Supabase Auth & RLS Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Isolated Local Session
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

