import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  GraduationCap,
  Building,
  BookOpen,
  Award,
  Link as LinkIcon,
  Globe,
  Sparkles,
  CheckCircle2,
  X,
  ChevronRight,
  ChevronLeft,
  Plus,
  Hash,
  MapPin,
  Briefcase,
  Users
} from 'lucide-react';

const SUGGESTED_INTERESTS = [
  'Machine Learning',
  'Deep Learning Theory',
  'Computer Vision',
  'Natural Language Processing',
  'Cybersecurity & Privacy',
  'Reinforcement Learning',
  'Generative AI',
  'Robotics & Control',
  'Distributed Systems',
  'Quantum Computing',
  'Bioinformatics',
  'Software Engineering'
];

const TARGET_VENUE_PRESETS = [
  'Core A* Venues',
  'IEEE Transactions / Conferences',
  'ACM SIG Conferences',
  'NeurIPS / ICML / ICLR',
  'CVPR / ICCV / ECCV',
  'ACL / EMNLP / NAACL',
  'USENIX Security / S&P',
  'Nature / Science Family'
];

export default function OnboardingModal({ isOpen, onClose }) {
  const { user, updateProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [role, setRole] = useState(user?.role || 'Assistant Professor');
  const [institution, setInstitution] = useState(user?.institution || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [fieldOfStudy, setFieldOfStudy] = useState(user?.field_of_study || 'Computer Science & AI');
  const [location, setLocation] = useState(user?.location || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [interests, setInterests] = useState(Array.isArray(user?.interests) && user?.interests.length > 0 ? user.interests : ['Machine Learning', 'Computer Vision']);
  const [customInterest, setCustomInterest] = useState('');
  const [targetVenues, setTargetVenues] = useState(Array.isArray(user?.target_venues) ? user.target_venues : ['Core A* Venues', 'IEEE Transactions / Conferences']);
  const [orcidId, setOrcidId] = useState(user?.orcid_id || '');
  const [scholarUrl, setScholarUrl] = useState(user?.scholar_url || '');
  const [websiteUrl, setWebsiteUrl] = useState(user?.website_url || '');
  const [githubUrl, setGithubUrl] = useState(user?.github_url || '');
  const [linkedinUrl, setLinkedinUrl] = useState(user?.linkedin_url || '');
  const [hIndex, setHIndex] = useState(user?.h_index || '');
  const [citationsCount, setCitationsCount] = useState(user?.citations_count || '');
  const [publicationsCount, setPublicationsCount] = useState(user?.publications_count || '');
  const [openToCollaborations, setOpenToCollaborations] = useState(true);
  const [openToPeerReview, setOpenToPeerReview] = useState(true);

  useEffect(() => {
    if (user) {
      if (!fullName && user.full_name) setFullName(user.full_name);
      if (!institution && user.institution) setInstitution(user.institution);
      if (!department && user.department) setDepartment(user.department);
      if (user.role && role === 'Assistant Professor') setRole(user.role);
      if (user.field_of_study && fieldOfStudy === 'Computer Science & AI') setFieldOfStudy(user.field_of_study);
      if (Array.isArray(user.interests) && user.interests.length > 0) setInterests(user.interests);
    }
  }, [user]);

  if (!isOpen) return null;

  const toggleInterest = (topic) => {
    if (interests.includes(topic)) {
      setInterests(interests.filter(t => t !== topic));
    } else {
      setInterests([...interests, topic]);
    }
  };

  const addCustomInterest = (e) => {
    e.preventDefault();
    if (customInterest.trim() && !interests.includes(customInterest.trim())) {
      setInterests([...interests, customInterest.trim()]);
      setCustomInterest('');
    }
  };

  const toggleTargetVenue = (venue) => {
    if (targetVenues.includes(venue)) {
      setTargetVenues(targetVenues.filter(v => v !== venue));
    } else {
      setTargetVenues([...targetVenues, venue]);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    setError('');

    try {
      const payload = {
        full_name: fullName.trim() || user?.email?.split('@')[0] || 'Academic Faculty',
        role,
        institution: institution.trim(),
        department: department.trim(),
        field_of_study: fieldOfStudy,
        location: location.trim(),
        bio: bio.trim(),
        interests,
        target_venues: targetVenues,
        orcid_id: orcidId.trim(),
        scholar_url: scholarUrl.trim(),
        website_url: websiteUrl.trim(),
        github_url: githubUrl.trim(),
        linkedin_url: linkedinUrl.trim(),
        h_index: hIndex ? parseInt(hIndex) : 0,
        citations_count: citationsCount ? parseInt(citationsCount) : 0,
        publications_count: publicationsCount ? parseInt(publicationsCount) : 0,
        open_to_collaborations: openToCollaborations,
        open_to_peer_review: openToPeerReview,
        is_onboarded: true
      };

      const res = await updateProfile(payload);
      if (res?.success) {
        onClose();
      } else {
        setError(res?.error || 'Failed to save profile details.');
      }
    } catch (err) {
      setError(err.message || 'Error completing onboarding.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-surface rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 px-6 py-5 text-white relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-surface/10 flex items-center justify-center backdrop-blur-xs">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold tracking-tight">
                  Complete Your Academic Profile
                </h2>
                <p className="text-xs text-blue-100">
                  Step {step} of 3 — Tailors conference discovery & colleague matching
                </p>
              </div>
            </div>

            {/* Step Progress Indicators */}
            <div className="flex items-center gap-1.5 bg-surface/10 px-3 py-1.5 rounded-full text-xs font-semibold">
              <span className={`w-2 h-2 rounded-full ${step >= 1 ? 'bg-blue-300' : 'bg-surface/30'}`} />
              <span className={`w-2 h-2 rounded-full ${step >= 2 ? 'bg-blue-300' : 'bg-surface/30'}`} />
              <span className={`w-2 h-2 rounded-full ${step >= 3 ? 'bg-blue-300' : 'bg-surface/30'}`} />
            </div>
          </div>
        </div>

        {/* Modal Content Scroll Area */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
              {error}
            </div>
          )}

          {/* STEP 1: Academic Identity */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-blue-600" />
                  <span>Institutional Affiliation & Academic Identity</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Your university and department ensure verified publication tracking and local colleague recommendations.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name & Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="Dr. Alex Morgan"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Academic Role / Position *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-surface focus:border-blue-500 focus:outline-none"
                  >
                    <option>PhD Candidate</option>
                    <option>Postdoctoral Fellow</option>
                    <option>Assistant Professor</option>
                    <option>Associate Professor</option>
                    <option>Full Professor</option>
                    <option>Principal Research Scientist (Industry)</option>
                    <option>Lab Director / PI</option>
                    <option>Independent Scholar</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">University / Institute *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Stanford University, MIT, Oxford"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Department / Faculty</label>
                  <input
                    type="text"
                    placeholder="e.g. Department of Computer Science"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Academic Discipline</label>
                  <select
                    value={fieldOfStudy}
                    onChange={(e) => setFieldOfStudy(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-surface"
                  >
                    <option>Computer Science & AI</option>
                    <option>Cybersecurity & Cryptography</option>
                    <option>Electrical & Computer Engineering</option>
                    <option>Data Science & Statistics</option>
                    <option>Computational Biology & Bioinformatics</option>
                    <option>Quantum Computing & Information</option>
                    <option>Human-Computer Interaction (HCI)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Country / Geographic Region</label>
                  <input
                    type="text"
                    placeholder="e.g. United States, United Kingdom, India"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Research Topics & Publishing Ambitions */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>Research Topics & Target Venues</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Used by our TF-IDF matching engine to recommend upcoming conferences and highlight colleagues with similar interests.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Selected Research Interests ({interests.length})
                </label>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {SUGGESTED_INTERESTS.map((topic, i) => {
                    const isSelected = interests.includes(topic);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleInterest(topic)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <Hash className="w-3 h-3" />
                        <span>{topic}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Add Custom Tag */}
                <form onSubmit={addCustomInterest} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add custom keyword (e.g. Federated Learning, NeRFs)..."
                    value={customInterest}
                    onChange={(e) => setCustomInterest(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition"
                  >
                    Add Topic
                  </button>
                </form>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Target Publishing Venues</label>
                <div className="grid grid-cols-2 gap-2">
                  {TARGET_VENUE_PRESETS.map((v, i) => {
                    const isSelected = targetVenues.includes(v);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleTargetVenue(v)}
                        className={`text-left p-2 rounded-xl border text-xs font-medium transition cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold'
                            : 'bg-surface border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span>{v}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Brief Research Bio / Laboratory Overview</label>
                <textarea
                  rows={3}
                  placeholder="Summarize your current research questions, recent preprints, and lab goals..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none resize-none leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* STEP 3: Verified Academic Links & Preferences */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-emerald-600" />
                  <span>Academic Profiles & Metrics</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Link your authoritative scientific profiles so co-authors and editors can review your published work.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">h-index</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 18"
                    value={hIndex}
                    onChange={(e) => setHIndex(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-200 bg-surface"
                  />
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Total Citations</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 1400"
                    value={citationsCount}
                    onChange={(e) => setCitationsCount(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-200 bg-surface"
                  />
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Publications</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 15"
                    value={publicationsCount}
                    onChange={(e) => setPublicationsCount(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-200 bg-surface"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ORCID Identifier</label>
                  <input
                    type="text"
                    placeholder="0000-0002-1825-0097"
                    value={orcidId}
                    onChange={(e) => setOrcidId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Google Scholar Profile URL</label>
                  <input
                    type="url"
                    placeholder="https://scholar.google.com/citations?user=..."
                    value={scholarUrl}
                    onChange={(e) => setScholarUrl(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Laboratory or Personal Website</label>
                    <input
                      type="url"
                      placeholder="https://lab.stanford.edu"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">GitHub / Code Profile</label>
                    <input
                      type="url"
                      placeholder="https://github.com/..."
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Collaboration Preferences */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={openToCollaborations}
                    onChange={(e) => setOpenToCollaborations(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>Open to co-authorship & inter-institutional research collaborations</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={openToPeerReview}
                    onChange={(e) => setOpenToPeerReview(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>Open to serving on conference Technical Program Committees (TPC) & peer review</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Modal Action Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1 px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-100 transition cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-1 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition cursor-pointer"
            >
              <span>Continue</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleComplete}
              disabled={loading}
              className="bg-accent hover:bg-accent-hover flex items-center gap-1.5 px-6 py-2.5 text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? 'Saving Profile...' : 'Complete Academic Setup'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
