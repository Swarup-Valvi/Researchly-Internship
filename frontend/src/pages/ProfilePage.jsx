import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import NewsletterCard from '../components/NewsletterCard';
import {
  User, Building, Briefcase, Edit3, Save, X, Plus,
  BookOpen, Award, Link as LinkIcon, ExternalLink,
  Camera, FlaskConical, Hash, Globe, GraduationCap,
  MapPin, Github, Linkedin, CheckCircle2, ShieldCheck,
  Sparkles, Check
} from 'lucide-react';

export default function ProfilePage() {
  const { user, updateProfile, setIsAuthModalOpen, setIsOnboardingOpen } = useAuth();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    role: '',
    institution: '',
    department: '',
    field_of_study: '',
    location: '',
    bio: '',
    h_index: '',
    citations_count: '',
    publications_count: '',
    interests: [],
    target_venues: [],
    orcid_id: '',
    scholar_url: '',
    website_url: '',
    github_url: '',
    linkedin_url: '',
    avatar_url: '',
    open_to_collaborations: true,
    open_to_peer_review: true
  });
  const [interestInput, setInterestInput] = useState('');

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name || '',
        role: user.role || 'Assistant Professor',
        institution: user.institution || '',
        department: user.department || '',
        field_of_study: user.field_of_study || 'Computer Science & AI',
        location: user.location || '',
        bio: user.bio || '',
        h_index: user.h_index ?? '',
        citations_count: user.citations_count ?? '',
        publications_count: user.publications_count ?? '',
        interests: Array.isArray(user.interests) ? user.interests : [],
        target_venues: Array.isArray(user.target_venues) ? user.target_venues : [],
        orcid_id: user.orcid_id || '',
        scholar_url: user.scholar_url || '',
        website_url: user.website_url || '',
        github_url: user.github_url || '',
        linkedin_url: user.linkedin_url || '',
        avatar_url: user.avatar_url || '',
        open_to_collaborations: user.open_to_collaborations !== undefined ? user.open_to_collaborations : true,
        open_to_peer_review: user.open_to_peer_review !== undefined ? user.open_to_peer_review : true
      });
    }
  }, [user]);

  if (!user) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <User className="w-8 h-8 text-slate-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Sign in to view your profile</h2>
        <p className="text-sm text-slate-500 mb-6">Create and manage your verified academic profile on Researchly.</p>
        <button
          onClick={() => setIsAuthModalOpen(true)}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition"
        >
          Sign In / Join Researchly
        </button>
      </div>
    );
  }

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const addInterest = () => {
    const val = interestInput.trim();
    if (val && !form.interests.includes(val)) {
      setForm(prev => ({ ...prev, interests: [...prev.interests, val] }));
      setInterestInput('');
    }
  };

  const removeInterest = (interest) => {
    setForm(prev => ({ ...prev, interests: prev.interests.filter(i => i !== interest) }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const payload = {
        ...form,
        h_index: form.h_index ? parseInt(form.h_index) : 0,
        citations_count: form.citations_count ? parseInt(form.citations_count) : 0,
        publications_count: form.publications_count ? parseInt(form.publications_count) : 0,
      };
      const res = await updateProfile(payload);
      if (res.success) {
        setIsEditing(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError(res.error || 'Failed to save profile.');
      }
    } catch (err) {
      setSaveError(err.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const displayUser = isEditing ? form : user;
  const interests = Array.isArray(displayUser.interests) ? displayUser.interests : [];

  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-10 py-10">
      {/* Success Banner */}
      {saveSuccess && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span className="font-semibold">Profile updated successfully!</span>
        </div>
      )}

      {/* Profile Header Card */}
      <div className="bg-surface rounded-2xl border border-slate-200 overflow-hidden mb-5 shadow-sm">
        {/* Cover */}
        <div className="bg-slate-200 h-36 sm:h-44 relative">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)',
              backgroundSize: '40px 40px'
            }}
          />
        </div>

        <div className="px-5 sm:px-7 pb-6">
          {/* Avatar + Edit Button row */}
          <div className="flex items-end justify-between -mt-10 mb-4">
            {/* Avatar */}
            <div className="relative">
              <img
                src={displayUser.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayUser.full_name || 'User')}&background=3b82f6&color=fff&size=96`}
                alt={displayUser.full_name || 'Profile'}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-4 border-white shadow-lg object-cover"
              />
              {isEditing && (
                <div className="absolute bottom-0 right-0 w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center cursor-pointer border-2 border-white shadow-sm">
                  <Camera className="w-3.5 h-3.5 text-white" />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={() => { setIsEditing(false); setSaveError(''); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                  >
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsOnboardingOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Academic Wizard
                  </button>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit Profile
                  </button>
                </div>
              )}
            </div>
          </div>

          {saveError && (
            <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">{saveError}</div>
          )}

          {/* Name & Academic Identity */}
          {isEditing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={e => handleChange('full_name', e.target.value)}
                    placeholder="Prof. Jane Doe"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Role / Academic Title</label>
                  <select
                    value={form.role}
                    onChange={e => handleChange('role', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none bg-surface"
                  >
                    <option>PhD Student</option>
                    <option>Postdoctoral Researcher</option>
                    <option>Assistant Professor</option>
                    <option>Associate Professor</option>
                    <option>Professor & Lab Director</option>
                    <option>Distinguished Scientist</option>
                    <option>Staff Research Scientist</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Institution / University</label>
                  <input
                    type="text"
                    value={form.institution}
                    onChange={e => handleChange('institution', e.target.value)}
                    placeholder="Stanford University"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Department</label>
                  <input
                    type="text"
                    value={form.department}
                    onChange={e => handleChange('department', e.target.value)}
                    placeholder="Dept. of Computer Science"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Field of Study</label>
                  <input
                    type="text"
                    value={form.field_of_study}
                    onChange={e => handleChange('field_of_study', e.target.value)}
                    placeholder="Artificial Intelligence & Machine Learning"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Location / Country</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={e => handleChange('location', e.target.value)}
                    placeholder="Stanford, CA, USA"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Avatar Image URL</label>
                <input
                  type="url"
                  value={form.avatar_url}
                  onChange={e => handleChange('avatar_url', e.target.value)}
                  placeholder="https://images.unsplash.com/... or profile photo URL"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {displayUser.full_name || 'Academic Faculty'}
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                {displayUser.role || 'Researcher'}
                {displayUser.department ? ` · ${displayUser.department}` : ''}
              </p>
              <p className="text-sm font-semibold text-blue-600 mt-0.5">
                {displayUser.institution || 'University / Institution'}
              </p>

              <div className="flex flex-wrap items-center gap-2 mt-2">
                {displayUser.field_of_study && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100">
                    {displayUser.field_of_study}
                  </span>
                )}
                {displayUser.location && (
                  <span className="text-xs text-slate-500 flex items-center gap-1 font-medium">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    {displayUser.location}
                  </span>
                )}
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                {displayUser.open_to_collaborations && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Open to Collaborations
                  </span>
                )}
                {displayUser.open_to_peer_review && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600" /> Available for Peer Review
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Bio */}
          <div className="bg-surface rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600" /> Academic Bio
            </h2>
            {isEditing ? (
              <textarea
                rows={4}
                value={form.bio}
                onChange={e => handleChange('bio', e.target.value)}
                placeholder="Write a concise overview of your research laboratory, active grant programs, target venues, or paper methodologies..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none resize-none leading-relaxed"
              />
            ) : (
              <p className="text-base leading-relaxed text-slate-600 leading-relaxed">
                {displayUser.bio || (
                  <span className="text-slate-400 italic">No bio provided yet. Click Edit Profile or open Academic Wizard to add details.</span>
                )}
              </p>
            )}
          </div>

          {/* Research Interests */}
          <div className="bg-surface rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-indigo-600" /> Research Topics & Focus
            </h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {interests.length > 0 ? interests.map((interest, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-100"
                >
                  <Hash className="w-2.5 h-2.5" /> {interest}
                  {isEditing && (
                    <button onClick={() => removeInterest(interest)} aria-label={`Remove ${interest}`} className="text-blue-400 hover:text-rose-500 ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              )) : (
                <p className="text-sm text-slate-400 italic">No topics added yet.</p>
              )}
            </div>
            {isEditing && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={interestInput}
                  onChange={e => setInterestInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addInterest(); } }}
                  placeholder="Add a topic (e.g. Distributed Consensus, Vision-Language Models)"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addInterest}
                  className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            )}
          </div>

          {/* Academic Links & Profiles */}
          <div className="bg-surface rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-emerald-600" /> Verified Links & Profiles
            </h2>
            {isEditing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">ORCID ID</label>
                    <input
                      type="text"
                      value={form.orcid_id}
                      onChange={e => handleChange('orcid_id', e.target.value)}
                      placeholder="0000-0002-1825-0097"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Google Scholar URL</label>
                    <input
                      type="url"
                      value={form.scholar_url}
                      onChange={e => handleChange('scholar_url', e.target.value)}
                      placeholder="https://scholar.google.com/citations?user=..."
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Lab / Personal Website</label>
                    <input
                      type="url"
                      value={form.website_url}
                      onChange={e => handleChange('website_url', e.target.value)}
                      placeholder="https://lab.stanford.edu"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">GitHub Profile</label>
                    <input
                      type="url"
                      value={form.github_url}
                      onChange={e => handleChange('github_url', e.target.value)}
                      placeholder="https://github.com/username"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">LinkedIn Profile</label>
                  <input
                    type="url"
                    value={form.linkedin_url}
                    onChange={e => handleChange('linkedin_url', e.target.value)}
                    placeholder="https://linkedin.com/in/username"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {displayUser.orcid_id && (
                  <a
                    href={`https://orcid.org/${displayUser.orcid_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 text-sm text-slate-700 hover:text-emerald-700 group p-2 rounded-xl hover:bg-slate-50 transition"
                  >
                    <span className="w-5 h-5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center justify-center shrink-0">iD</span>
                    <span className="font-mono text-xs">ORCID: {displayUser.orcid_id}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 ml-auto" />
                  </a>
                )}
                {displayUser.scholar_url && (
                  <a
                    href={displayUser.scholar_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 text-sm text-slate-700 hover:text-blue-600 group p-2 rounded-xl hover:bg-slate-50 transition"
                  >
                    <BookOpen className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="text-xs font-medium">Google Scholar Citations</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 ml-auto" />
                  </a>
                )}
                {displayUser.website_url && (
                  <a
                    href={displayUser.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 text-sm text-slate-700 hover:text-blue-600 group p-2 rounded-xl hover:bg-slate-50 transition"
                  >
                    <Globe className="w-4 h-4 text-slate-500 shrink-0" />
                    <span className="text-xs font-medium truncate">{displayUser.website_url.replace(/^https?:\/\//, '')}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 ml-auto" />
                  </a>
                )}
                {displayUser.github_url && (
                  <a
                    href={displayUser.github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 text-sm text-slate-700 hover:text-slate-900 group p-2 rounded-xl hover:bg-slate-50 transition"
                  >
                    <Github className="w-4 h-4 text-slate-700 shrink-0" />
                    <span className="text-xs font-medium">GitHub Repository / Code</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900 ml-auto" />
                  </a>
                )}
                {displayUser.linkedin_url && (
                  <a
                    href={displayUser.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 text-sm text-slate-700 hover:text-blue-700 group p-2 rounded-xl hover:bg-slate-50 transition"
                  >
                    <Linkedin className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="text-xs font-medium">LinkedIn Network</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 ml-auto" />
                  </a>
                )}
                {!displayUser.orcid_id && !displayUser.scholar_url && !displayUser.website_url && !displayUser.github_url && !displayUser.linkedin_url && (
                  <p className="text-sm text-slate-400 italic">No academic links connected yet.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-5">
          {/* Academic Metrics */}
          <div className="bg-surface rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" /> Academic Metrics
            </h2>
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">h-index</label>
                  <input
                    type="number"
                    min="0"
                    value={form.h_index}
                    onChange={e => handleChange('h_index', e.target.value)}
                    placeholder="e.g. 24"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Total Citations</label>
                  <input
                    type="number"
                    min="0"
                    value={form.citations_count}
                    onChange={e => handleChange('citations_count', e.target.value)}
                    placeholder="e.g. 3400"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Total Publications</label>
                  <input
                    type="number"
                    min="0"
                    value={form.publications_count}
                    onChange={e => handleChange('publications_count', e.target.value)}
                    placeholder="e.g. 48"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3.5 bg-blue-50/70 rounded-xl border border-blue-100">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">h-index</p>
                    <p className="text-2xl font-black text-blue-700 font-mono mt-0.5">{displayUser.h_index ?? 0}</p>
                  </div>
                  <GraduationCap className="w-7 h-7 text-blue-300" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <p className="text-[11px] font-medium text-slate-500">Citations</p>
                    <p className="text-lg font-bold text-slate-800 font-mono mt-0.5">
                      {displayUser.citations_count ? Number(displayUser.citations_count).toLocaleString() : '0'}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <p className="text-[11px] font-medium text-slate-500">Publications</p>
                    <p className="text-lg font-bold text-slate-800 font-mono mt-0.5">
                      {displayUser.publications_count ?? '0'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Preferences (Collaborations & Reviewing) */}
          <div className="bg-surface rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 mb-3">Academic Availability</h2>
            {isEditing ? (
              <div className="space-y-2.5">
                <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.open_to_collaborations}
                    onChange={e => handleChange('open_to_collaborations', e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <span>Open to research co-authorship</span>
                </label>
                <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.open_to_peer_review}
                    onChange={e => handleChange('open_to_peer_review', e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <span>Available for PC / Peer review requests</span>
                </label>
              </div>
            ) : (
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${displayUser.open_to_collaborations ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <span>{displayUser.open_to_collaborations ? 'Accepting collaboration invites' : 'Not accepting collaborations'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${displayUser.open_to_peer_review ? 'bg-blue-500' : 'bg-slate-300'}`} />
                  <span>{displayUser.open_to_peer_review ? 'Available for program committee review' : 'Not available for review'}</span>
                </div>
              </div>
            )}
          </div>

          <NewsletterCard />
        </div>
      </div>
    </div>
  );
}
