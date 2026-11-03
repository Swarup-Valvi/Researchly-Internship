"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  ExternalLink,
  Plus,
  Trash2,
  CheckCircle,
  Clock,
  MapPin,
  Sparkles,
  BookmarkCheck,
  ChevronRight,
} from "lucide-react";
import { trackingStore, TrackedApplication, TrackingStatus, api, Conference } from "@/lib/api";
import Link from "next/link";

export default function ApplicationsPage() {
  const [tracked, setTracked] = useState<TrackedApplication[]>([]);
  const [availableConferences, setAvailableConferences] = useState<Conference[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedConfId, setSelectedConfId] = useState("");
  const [paperTitle, setPaperTitle] = useState("");
  const [initialStatus, setInitialStatus] = useState<TrackingStatus>("Preparing");

  const refreshTracked = () => {
    setTracked(trackingStore.getAll());
  };

  useEffect(() => {
    refreshTracked();
    window.addEventListener("researchly_tracking_changed", refreshTracked);
    return () => window.removeEventListener("researchly_tracking_changed", refreshTracked);
  }, []);

  // Fetch conferences for quick manual addition
  useEffect(() => {
    api.conferences
      .list({ include_historical: true })
      .then((data) => setAvailableConferences(data))
      .catch((e) => console.error("Failed to load conferences for selector", e));
  }, []);

  const handleAddApplication = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConfId) return;

    const conf = availableConferences.find((c) => c.id === selectedConfId);
    if (!conf) return;

    const newApp: TrackedApplication = {
      id: `app-${conf.id}-${Date.now()}`,
      conferenceId: conf.id,
      conferenceName: conf.name,
      editionOrYear: conf.edition_or_year,
      title: conf.title,
      submissionDeadline: conf.submission_deadline,
      startDate: conf.start_date,
      location: conf.location,
      status: initialStatus,
      paperTitle: paperTitle.trim() || undefined,
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    trackingStore.save(newApp);
    setShowAddModal(false);
    setSelectedConfId("");
    setPaperTitle("");
    setInitialStatus("Preparing");
  };

  const handleUpdateStatus = (app: TrackedApplication, newStatus: TrackingStatus) => {
    trackingStore.save({
      ...app,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleDelete = (id: string) => {
    trackingStore.remove(id);
  };

  const activeApps = tracked.filter((a) =>
    ["Preparing", "Shortlisted", "Under Review"].includes(a.status)
  );
  const submittedApps = tracked.filter((a) =>
    ["Submitted", "Under Review"].includes(a.status)
  );
  const completedApps = tracked.filter((a) =>
    ["Accepted", "Presented", "Rejected"].includes(a.status)
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1">My Research Applications</h1>
            <p className="text-muted-foreground">
              Track deadlines, manage your paper submissions, and monitor conference statuses
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => setShowAddModal(!showAddModal)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Submission Goal
            </Button>
          </div>
        </div>

        {/* Inline Manual Add Modal/Card */}
        {showAddModal && (
          <Card className="mb-8 border-primary/50 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <BookmarkCheck className="h-5 w-5 text-primary" />
                Track a Discovered Conference
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddApplication} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                      Select Target Conference / CFP
                    </label>
                    <select
                      value={selectedConfId}
                      onChange={(e) => setSelectedConfId(e.target.value)}
                      required
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">-- Choose from discovered events --</option>
                      {availableConferences.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.edition_or_year} — {c.location || "TBD"} (DL: {c.submission_deadline || "TBD"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                      Initial Status
                    </label>
                    <select
                      value={initialStatus}
                      onChange={(e) => setInitialStatus(e.target.value as TrackingStatus)}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="Preparing">Preparing Paper</option>
                      <option value="Shortlisted">Shortlisted Target</option>
                      <option value="Submitted">Submitted (Awaiting Decision)</option>
                      <option value="Under Review">Under Review</option>
                      <option value="Accepted">Accepted</option>
                      <option value="Presented">Presented</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    Working Paper Title (Optional)
                  </label>
                  <Input
                    placeholder="e.g. Contrastive Transformer Models for Autonomous Agents"
                    value={paperTitle}
                    onChange={(e) => setPaperTitle(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    Save to Tracker
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Main Content Tabs */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-4 max-w-lg mb-6">
            <TabsTrigger value="all">All ({tracked.length})</TabsTrigger>
            <TabsTrigger value="active">Active ({activeApps.length})</TabsTrigger>
            <TabsTrigger value="submitted">Submitted ({submittedApps.length})</TabsTrigger>
            <TabsTrigger value="completed">Concluded ({completedApps.length})</TabsTrigger>
          </TabsList>

          {/* Empty State */}
          {tracked.length === 0 && (
            <Card className="text-center py-16">
              <CardContent className="space-y-4">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto" />
                <div>
                  <h3 className="text-lg font-semibold">No Conferences Tracked Yet</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                    Keep track of conferences you plan to submit to. You can bookmark events from{" "}
                    <strong>Discover</strong> or from your <strong>AI Match</strong> results.
                  </p>
                </div>
                <div className="flex justify-center gap-3 pt-2">
                  <Link href="/discover">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Calendar className="h-4 w-4" />
                      Browse Discover
                    </Button>
                  </Link>
                  <Link href="/ai-match">
                    <Button size="sm" className="gap-2">
                      <Sparkles className="h-4 w-4" />
                      Match Research Paper
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          <TabsContent value="all" className="space-y-4">
            {tracked.map((app) => (
              <TrackedCard
                key={app.id}
                app={app}
                onUpdateStatus={(st) => handleUpdateStatus(app, st)}
                onDelete={() => handleDelete(app.id)}
              />
            ))}
          </TabsContent>

          <TabsContent value="active" className="space-y-4">
            {activeApps.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12 border rounded-lg">
                No active submission goals currently in preparation.
              </p>
            )}
            {activeApps.map((app) => (
              <TrackedCard
                key={app.id}
                app={app}
                onUpdateStatus={(st) => handleUpdateStatus(app, st)}
                onDelete={() => handleDelete(app.id)}
              />
            ))}
          </TabsContent>

          <TabsContent value="submitted" className="space-y-4">
            {submittedApps.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12 border rounded-lg">
                No papers currently under review or submitted.
              </p>
            )}
            {submittedApps.map((app) => (
              <TrackedCard
                key={app.id}
                app={app}
                onUpdateStatus={(st) => handleUpdateStatus(app, st)}
                onDelete={() => handleDelete(app.id)}
              />
            ))}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {completedApps.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12 border rounded-lg">
                No concluded conferences in this archive.
              </p>
            )}
            {completedApps.map((app) => (
              <TrackedCard
                key={app.id}
                app={app}
                onUpdateStatus={(st) => handleUpdateStatus(app, st)}
                onDelete={() => handleDelete(app.id)}
              />
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function TrackedCard({
  app,
  onUpdateStatus,
  onDelete,
}: {
  app: TrackedApplication;
  onUpdateStatus: (status: TrackingStatus) => void;
  onDelete: () => void;
}) {
  const getBadgeStyle = (status: TrackingStatus) => {
    switch (status) {
      case "Accepted":
      case "Presented":
        return "bg-success text-white";
      case "Rejected":
        return "bg-destructive text-white";
      case "Under Review":
      case "Submitted":
        return "bg-warning text-black";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  // Calculate days left
  let daysLeftText = "No deadline announced";
  let isPast = false;
  if (app.submissionDeadline) {
    try {
      const dl = new Date(app.submissionDeadline).getTime();
      const now = new Date().getTime();
      const diffDays = Math.ceil((dl - now) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        daysLeftText = `${diffDays} days remaining`;
      } else if (diffDays === 0) {
        daysLeftText = "Deadline is today";
      } else {
        daysLeftText = `Deadline passed (${Math.abs(diffDays)}d ago)`;
        isPast = true;
      }
    } catch {
      daysLeftText = app.submissionDeadline;
    }
  }

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/conferences/${app.conferenceId}`}
                className="text-xl font-bold hover:underline flex items-center gap-1.5"
              >
                {app.conferenceName} {app.editionOrYear}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Badge className={getBadgeStyle(app.status)}>{app.status}</Badge>
            </div>

            {app.title && <p className="text-sm text-muted-foreground line-clamp-1">{app.title}</p>}

            {app.paperTitle && (
              <div className="text-xs bg-muted/60 p-2 rounded-md font-mono text-foreground mt-2 border">
                📄 Working Title: {app.paperTitle}
              </div>
            )}

            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-2">
              {app.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {app.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Deadline: {app.submissionDeadline || "TBD"}
              </span>
              <span className={isPast ? "text-muted-foreground" : "text-success font-medium"}>
                {daysLeftText}
              </span>
            </div>
          </div>

          {/* Status Dropdown and Actions */}
          <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0">
            <select
              value={app.status}
              onChange={(e) => onUpdateStatus(e.target.value as TrackingStatus)}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="Preparing">Preparing</option>
              <option value="Shortlisted">Shortlisted</option>
              <option value="Submitted">Submitted</option>
              <option value="Under Review">Under Review</option>
              <option value="Accepted">Accepted</option>
              <option value="Presented">Presented</option>
              <option value="Rejected">Rejected</option>
            </select>

            <Link href={`/conferences/${app.conferenceId}`}>
              <Button variant="outline" size="sm" className="h-8 px-2 text-xs" title="View Details">
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </Link>

            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-8 px-2 text-destructive hover:bg-destructive/10"
              title="Remove Tracking"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
