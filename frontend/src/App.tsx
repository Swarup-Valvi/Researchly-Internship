import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { ConferencesPage } from './pages/ConferencesPage';
import { ConferenceDetailPage } from './pages/ConferenceDetailPage';
import { MatchPage } from './pages/MatchPage';
import { MatchResultsPage } from './pages/MatchResultsPage';
import { TrackingPage } from './pages/TrackingPage';
import { ApplicationsPage } from './pages/ApplicationsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
          <Navbar />
          <AuthModal />
          <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/conferences" element={<ConferencesPage />} />
              <Route path="/conferences/:id" element={<ConferenceDetailPage />} />
              <Route path="/match" element={<MatchPage />} />
              <Route path="/match/results" element={<MatchResultsPage />} />
              <Route
                path="/tracking"
                element={
                  <ProtectedRoute title="Conference Shortlist & Tracking">
                    <TrackingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/applications"
                element={
                  <ProtectedRoute title="Applications & Submission Pipeline">
                    <ApplicationsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
            <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
              <span>Researchly.io — AI-Powered Academic Conference Discovery & Verification</span>
              <span className="text-slate-400">Phase 3: Supabase Authentication & RLS</span>
            </div>
          </footer>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
