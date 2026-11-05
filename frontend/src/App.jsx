import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import AuthModal from './pages/AuthModal';
import OnboardingModal from './components/OnboardingModal';

// Pages
import HomePage from './pages/HomePage';
import DiscoverPage from './pages/DiscoverPage';
import ConferenceDetailPage from './pages/ConferenceDetailPage';
import AiMatcherPage from './pages/AiMatcherPage';
import ApplicationsPage from './pages/ApplicationsPage';
import PaperReviewPage from './pages/PaperReviewPage';
import NetworkPage from './pages/NetworkPage';
import CommunitiesPage from './pages/CommunitiesPage';
import ProfilePage from './pages/ProfilePage';

function ModalsWrapper() {
  const { isOnboardingOpen, setIsOnboardingOpen } = useAuth();
  return (
    <>
      <AuthModal />
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
      />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen flex flex-col bg-gray-50 text-slate-800">
          <Navbar />
          <div className="flex-1">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/conferences/:id" element={<ConferenceDetailPage />} />
              <Route path="/ai-match" element={<AiMatcherPage />} />
              <Route path="/applications" element={<ApplicationsPage />} />
              <Route path="/paper-review" element={<PaperReviewPage />} />
              <Route path="/network" element={<NetworkPage />} />
              <Route path="/communities" element={<CommunitiesPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Routes>
          </div>
          <Footer />
          <ModalsWrapper />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
