import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  KanbanSquare, Plus, Trash2, Calendar, Clock,
  CheckCircle2, XCircle, FileText, List, X, ArrowRight,
  Sparkles, Layers, BookOpen, Compass, ChevronRight, ChevronLeft
} from 'lucide-react';
import { deadlineLabel } from '../lib/deadline';

const STAGES = [
  { id: 'Bookmarked', label: 'Bookmarked', dot: 'bg-slate-400', headerBg: 'bg-slate-100', headerText: 'text-slate-800', border: 'border-slate-200' },
  { id: 'Drafting', label: 'Drafting', dot: 'bg-blue-500', headerBg: 'bg-blue-50', headerText: 'text-blue-800', border: 'border-blue-200' },
  { id: 'Under Review', label: 'Under Review', dot: 'bg-amber-500', headerBg: 'bg-amber-50', headerText: 'text-amber-800', border: 'border-amber-200' },
  { id: 'Accepted', label: 'Accepted', dot: 'bg-emerald-500', headerBg: 'bg-emerald-50', headerText: 'text-emerald-800', border: 'border-emerald-200' },
  { id: 'Rejected', label: 'Rejected', dot: 'bg-rose-500', headerBg: 'bg-rose-50', headerText: 'text-rose-800', border: 'border-rose-200' }
];

const statusBadge = {
  Bookmarked: 'bg-slate-100 text-slate-700 border-slate-200',
  Drafting: 'bg-blue-100 text-blue-700 border-blue-200',
  'Under Review': 'bg-amber-100 text-amber-800 border-amber-200',
  Accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Rejected: 'bg-rose-100 text-rose-700 border-rose-200'
};

function ApplicationCard({ app, onDelete, onUpdateStatus }) {
  const [expanded, setExpanded] = useState(false);

  const daysUntilDeadline = app.target_deadline
    ? Math.ceil((new Date(app.target_deadline) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  const currentIdx = STAGES.findIndex(s => s.id === app.status);
  const nextStage = STAGES[currentIdx + 1];
  const prevStage = STAGES[currentIdx - 1];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md transition-all duration-200 p-5 flex flex-col justify-between">
      <div>
        {/* Header: Target Conference & Delete */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-3 py-1 rounded-lg leading-tight break-words">
            {app.conference_name}
          </span>
          <button
            onClick={() => onDelete(app.id)}
            className="text-slate-300 hover:text-rose-500 transition shrink-0 p-1 rounded-md hover:bg-rose-50 cursor-pointer"
            title="Remove submission from tracker"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Paper Title */}
        <h4 className="text-base font-bold text-slate-900 leading-snug break-words mb-3">
          {app.paper_title}
        </h4>

        {/* Target Deadline */}
        {app.target_deadline && (
          <div className="flex items-center gap-2 mb-3 p-2 bg-slate-50/80 rounded-xl border border-slate-100 text-xs text-slate-600">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="font-medium">{app.target_deadline}</span>
            {daysUntilDeadline !== null && (
              <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-md ${
                daysUntilDeadline < 0 ? 'bg-slate-200 text-slate-600' :
                daysUntilDeadline <= 7 ? 'bg-rose-100 text-rose-700 font-extrabold animate-pulse' :
                daysUntilDeadline <= 30 ? 'bg-amber-100 text-amber-800' :
                'bg-emerald-100 text-emerald-800'
              }`}>
                {daysUntilDeadline < 0 ? 'Passed' : `${daysUntilDeadline}d left`}
              </span>
            )}
          </div>
        )}

        {/* Co-Authors */}
        {app.co_authors && app.co_authors.length > 0 && (
          <div className="text-xs text-slate-500 mb-3 flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-slate-600">Authors:</span>
            <span>{app.co_authors.join(', ')}</span>
          </div>
        )}

        {/* Notes */}
        {app.notes && (
          <div className="mb-3">
            <p className={`text-xs text-slate-600 italic bg-slate-50 rounded-xl p-3 border border-slate-100 leading-relaxed ${!expanded ? 'line-clamp-2' : ''}`}>
              "{app.notes}"
            </p>
            {app.notes.length > 100 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-blue-600 font-semibold mt-1 hover:text-blue-700 cursor-pointer"
              >
                {expanded ? 'Show less' : 'Read full notes'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Move Stage Controls */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 mt-2">
        {prevStage ? (
          <button
            onClick={() => onUpdateStatus(app.id, prevStage.id)}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
            title={`Move back to ${prevStage.label}`}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>{prevStage.label}</span>
          </button>
        ) : <div />}

        {nextStage && (
          <button
            onClick={() => onUpdateStatus(app.id, nextStage.id)}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer border border-blue-100"
            title={`Advance to ${nextStage.label}`}
          >
            <span>{nextStage.label}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [conferences, setConferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('kanban');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form State
  const [paperTitle, setPaperTitle] = useState('');
  const [conferenceName, setConferenceName] = useState('');
  const [conferenceId, setConferenceId] = useState('');
  const [targetDeadline, setTargetDeadline] = useState('');
  const [coAuthors, setCoAuthors] = useState('');
  const [notes, setNotes] = useState('');
  const [initialStatus, setInitialStatus] = useState('Drafting');

  const loadData = async () => {
    try {
      const [appsRes, confsRes] = await Promise.all([
        api.getApplications().catch(() => ({ success: false, data: [] })),
        api.getConferences().catch(() => ({ success: false, data: [] }))
      ]);
      if (appsRes.success) setApplications(appsRes.data);
      if (confsRes.success) setConferences(confsRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSelectConference = (e) => {
    const selectedId = e.target.value;
    setConferenceId(selectedId);
    if (!selectedId) return;

    const conf = conferences.find(c => c.id === selectedId || c.slug === selectedId);
    if (conf) {
      setConferenceName(`${conf.name} ${conf.edition}`);
      setTargetDeadline(conf.submission_deadline || '');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!paperTitle.trim()) return;
    try {
      const res = await api.createApplication({
        paper_title: paperTitle,
        conference_id: conferenceId || null,
        conference_name: conferenceName || 'Target Venue',
        target_deadline: targetDeadline || null,
        co_authors: coAuthors.split(',').map(s => s.trim()).filter(Boolean),
        notes,
        status: initialStatus
      });
      if (res.success && res.data) {
        setApplications([res.data, ...applications]);
        setIsAddModalOpen(false);
        setPaperTitle(''); setConferenceName(''); setConferenceId(''); setNotes(''); setCoAuthors(''); setTargetDeadline('');
      }
    } catch (err) { console.error(err); }
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const res = await api.updateApplication(id, { status: newStatus });
      if (res.success) {
        setApplications(apps => apps.map(a => a.id === id ? { ...a, status: newStatus } : a));
      }
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this submission from tracker?')) return;
    try {
      await api.deleteApplication(id);
      setApplications(apps => apps.filter(a => a.id !== id));
    } catch (err) { console.error(err); }
  };

  const activeCount = applications.filter(a => !['Accepted', 'Rejected'].includes(a.status)).length;
  const acceptedCount = applications.filter(a => a.status === 'Accepted').length;

  return (
    <div className="max-w-[1700px] w-full mx-auto px-6 lg:px-12 py-8 space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-8 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <KanbanSquare className="w-5 h-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Submission Tracker & Pipeline Kanban
            </h1>
          </div>
          <p className="text-sm sm:text-base text-slate-500 max-w-2xl mt-1 leading-relaxed">
            Manage your research papers across drafting, review, and acceptance stages. Deadlines sync automatically with official conference calendars.
          </p>

          {/* Metric Badges */}
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <div className="px-3.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200/80 text-xs font-semibold text-slate-700">
              Total Tracked: <span className="font-extrabold text-slate-900">{applications.length}</span>
            </div>
            <div className="px-3.5 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700">
              Active In Progress: <span className="font-extrabold text-blue-900">{activeCount}</span>
            </div>
            {acceptedCount > 0 && (
              <div className="px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                Accepted: <span className="font-extrabold text-emerald-900">{acceptedCount}</span>
              </div>
            )}
          </div>
        </div>

        {/* View Mode & Add Button */}
        <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
                viewMode === 'kanban' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <KanbanSquare className="w-4 h-4" />
              <span>Kanban</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <List className="w-4 h-4" />
              <span>List Table</span>
            </button>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Track New Paper</span>
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {STAGES.map(s => (
            <div key={s.id} className="bg-slate-100 rounded-2xl h-80 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty State when zero applications exist */}
      {!loading && applications.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-2xs">
            <KanbanSquare className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Your Submission Pipeline is Ready</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
            You don't have any paper submissions tracked yet. Add your current paper manuscript or track real conferences directly from our catalog.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition cursor-pointer flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Your First Paper</span>
            </button>
            <Link
              to="/discover"
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition flex items-center gap-2"
            >
              <Compass className="w-4 h-4 text-slate-500" />
              <span>Browse Real Conferences</span>
            </Link>
          </div>
        </div>
      )}

      {/* KANBAN BOARD VIEW */}
      {!loading && applications.length > 0 && viewMode === 'kanban' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 overflow-x-auto pb-4">
          {STAGES.map(stage => {
            const items = applications.filter(a => a.status === stage.id);
            return (
              <div key={stage.id} className="flex flex-col min-w-[280px]">
                {/* Column Header */}
                <div className={`flex items-center justify-between px-4 py-3 rounded-2xl mb-4 ${stage.headerBg} border ${stage.border} shadow-2xs`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${stage.dot}`} />
                    <span className={`text-sm font-bold ${stage.headerText}`}>{stage.label}</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200/80 ${stage.headerText}`}>
                    {items.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="space-y-4 flex-1">
                  {items.map(app => (
                    <ApplicationCard
                      key={app.id}
                      app={app}
                      onDelete={handleDelete}
                      onUpdateStatus={handleUpdateStatus}
                    />
                  ))}
                  {items.length === 0 && (
                    <div className="border-2 border-dashed border-slate-200 rounded-2xl px-4 py-12 text-center bg-slate-50/40">
                      <p className="text-xs font-medium text-slate-400">No papers in {stage.label}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TABLE LIST VIEW */}
      {!loading && applications.length > 0 && viewMode === 'table' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Paper Title</th>
                  <th className="px-6 py-4">Target Venue</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Deadline</th>
                  <th className="px-6 py-4">Co-Authors</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map(app => (
                  <tr key={app.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-6 py-4 font-bold text-slate-900">{app.paper_title}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
                        {app.conference_name}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${statusBadge[app.status] || 'bg-slate-100 text-slate-700'}`}>
                        {app.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{app.target_deadline || '—'}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {app.co_authors?.length > 0 ? app.co_authors.join(', ') : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(app.id)}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                        title="Delete entry"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADD SUBMISSION MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl p-8 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <KanbanSquare className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-lg text-slate-900">Track New Paper Submission</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Paper Title / Working Manuscript *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Robust Continual Learning with Orthogonal Subspace Projection"
                  value={paperTitle}
                  onChange={e => setPaperTitle(e.target.value)}
                  className="w-full text-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none transition"
                />
              </div>

              {/* Select Real Conference or Custom Venue */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Select Verified Target Conference or Webinar
                </label>
                <select
                  value={conferenceId}
                  onChange={handleSelectConference}
                  className="w-full text-sm px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-blue-500 focus:outline-none transition mb-2"
                >
                  <option value="">-- Choose from Verified Conference Catalog --</option>
                  {conferences.map(c => (
                    <option key={c.id || c.slug} value={c.id || c.slug}>
                      {c.name} {c.edition} ({c.field}) — Due: {deadlineLabel(c, 'TBA')}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Or enter custom conference name (e.g. Workshop on Self-Supervised Vision)"
                  value={conferenceName}
                  onChange={e => setConferenceName(e.target.value)}
                  className="w-full text-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Target Submission Deadline
                  </label>
                  <input
                    type="date"
                    value={targetDeadline}
                    onChange={e => setTargetDeadline(e.target.value)}
                    className="w-full text-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Initial Stage
                  </label>
                  <select
                    value={initialStatus}
                    onChange={e => setInitialStatus(e.target.value)}
                    className="w-full text-sm px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-blue-500 focus:outline-none transition"
                  >
                    <option value="Bookmarked">Bookmarked</option>
                    <option value="Drafting">Drafting</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Accepted">Accepted</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Co-Authors (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Jane Doe (MIT), Prof. John Smith (Oxford)"
                  value={coAuthors}
                  onChange={e => setCoAuthors(e.target.value)}
                  className="w-full text-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Notes, Milestone Todos & Reviewer Feedback
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Ablation experiments in Section 4.2 pending GPU run. Need proof of convergence lemma."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full text-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none transition resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition cursor-pointer"
                >
                  Create Submission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
