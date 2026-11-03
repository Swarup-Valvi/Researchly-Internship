"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, ExternalLink, Calendar, MapPin, AlertTriangle, Filter, Bookmark, Check } from "lucide-react";
import { api, Conference, trackingStore } from "@/lib/api";
import Link from "next/link";

export default function DiscoverPage() {
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [includeHistorical, setIncludeHistorical] = useState(true);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [opportunityFilter, setOpportunityFilter] = useState<string>("all");
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState<string>("all");

  const [trackedIds, setTrackedIds] = useState<string[]>([]);

  useEffect(() => {
    const updateTracked = () => {
      const all = trackingStore.getAll();
      setTrackedIds(all.map((a) => a.conferenceId));
    };
    updateTracked();
    window.addEventListener("researchly_tracking_changed", updateTracked);
    return () => window.removeEventListener("researchly_tracking_changed", updateTracked);
  }, []);

  const loadConferences = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.conferences.list({
        include_historical: includeHistorical,
      });
      setConferences(data);
    } catch (err) {
      setError("Failed to load conferences. Ensure the backend API is running at http://localhost:8000.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConferences();
  }, [includeHistorical]);

  const filtered = useMemo(() => {
    return conferences.filter((c) => {
      // 1. Text Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = c.name?.toLowerCase().includes(query);
        const matchesTitle = c.title?.toLowerCase().includes(query);
        const matchesTopics = c.topics?.some((t) => t.toLowerCase().includes(query));
        const matchesLoc = c.location?.toLowerCase().includes(query);
        if (!matchesName && !matchesTitle && !matchesTopics && !matchesLoc) {
          return false;
        }
      }

      // 2. Event Type Filter
      if (eventTypeFilter !== "all") {
        if ((c.event_type || "conference").toLowerCase() !== eventTypeFilter.toLowerCase()) {
          return false;
        }
      }

      // 3. Paper Opportunity Filter
      if (opportunityFilter !== "all") {
        if (opportunityFilter === "paper_only" && !c.has_paper_submission) {
          return false;
        }
        if (opportunityFilter === "attendance_only" && c.has_paper_submission) {
          return false;
        }
      }

      // 4. Submission Status Filter
      if (submissionStatusFilter !== "all") {
        if ((c.submission_status || "").toLowerCase() !== submissionStatusFilter.toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  }, [conferences, searchQuery, eventTypeFilter, opportunityFilter, submissionStatusFilter]);

  const getRiskBadge = (warnings: string[]) => {
    if (!warnings || warnings.length === 0) return <Badge className="bg-success text-white">Verified</Badge>;
    if (warnings.length >= 3) return <Badge className="bg-destructive text-white">Review Needed</Badge>;
    return <Badge className="bg-warning text-black">Flagged</Badge>;
  };

  const toggleTrack = (conference: Conference) => {
    const isCurrentlyTracked = trackedIds.includes(conference.id);
    if (isCurrentlyTracked) {
      trackingStore.remove(conference.id);
    } else {
      trackingStore.save({
        id: `track-${conference.id}`,
        conferenceId: conference.id,
        conferenceName: conference.name,
        editionOrYear: conference.edition_or_year,
        title: conference.title,
        submissionDeadline: conference.submission_deadline,
        startDate: conference.start_date,
        location: conference.location,
        status: "Preparing",
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Discover Academic Events</h1>
            <p className="text-muted-foreground">
              Explore verified global conferences, workshops, symposia, and student tracks
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Showing {filtered.length} of {conferences.length} events</span>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="space-y-4 mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
            <Input
              placeholder="Search by conference name, acronym, topic, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 text-base"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Filter className="h-3.5 w-3.5" /> Filters:
            </div>

            {/* Historical vs Upcoming Toggle */}
            <div className="flex rounded-lg border border-input p-0.5 bg-muted/40">
              <button
                type="button"
                onClick={() => setIncludeHistorical(false)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  !includeHistorical ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Upcoming Only
              </button>
              <button
                type="button"
                onClick={() => setIncludeHistorical(true)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  includeHistorical ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Include Past / Archive
              </button>
            </div>

            {/* Event Type Filter */}
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">All Event Types</option>
              <option value="conference">Conferences</option>
              <option value="workshop">Workshops</option>
              <option value="symposium">Symposia</option>
              <option value="colloquium">Colloquia / Consortia</option>
              <option value="summit">Summits</option>
            </select>

            {/* Paper Submission Filter */}
            <select
              value={opportunityFilter}
              onChange={(e) => setOpportunityFilter(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">All Opportunities</option>
              <option value="paper_only">📄 Paper CFP Only</option>
              <option value="attendance_only">🚫 Attendance Only</option>
            </select>

            {/* Submission Status Filter */}
            <select
              value={submissionStatusFilter}
              onChange={(e) => setSubmissionStatusFilter(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">All Submission Statuses</option>
              <option value="open">🟢 Open Submissions</option>
              <option value="deadline passed">Deadline Passed</option>
              <option value="deadline unknown">Deadline Unknown / Pending</option>
            </select>

            {(searchQuery || eventTypeFilter !== "all" || opportunityFilter !== "all" || submissionStatusFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setEventTypeFilter("all");
                  setOpportunityFilter("all");
                  setSubmissionStatusFilter("all");
                }}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        {/* Error State */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={loadConferences} className="ml-4 h-7 text-xs">
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-16">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4" />
            <p className="text-muted-foreground">Loading academic events...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 border rounded-xl bg-card">
            <p className="text-lg font-medium">No conferences found matching your criteria.</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Try adjusting your search terms or toggling &quot;Include Past / Archive&quot;.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setEventTypeFilter("all");
                setOpportunityFilter("all");
                setSubmissionStatusFilter("all");
                setIncludeHistorical(true);
              }}
            >
              Reset Filters
            </Button>
          </div>
        )}

        {/* Conference Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((conference) => (
            <ConferenceCard
              key={conference.id}
              conference={conference}
              getRiskBadge={getRiskBadge}
              isTracked={trackedIds.includes(conference.id)}
              onToggleTrack={() => toggleTrack(conference)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ConferenceCard({
  conference,
  getRiskBadge,
  isTracked,
  onToggleTrack,
}: {
  conference: Conference;
  getRiskBadge: (warnings: string[]) => React.ReactNode;
  isTracked: boolean;
  onToggleTrack: () => void;
}) {
  const isPast = conference.event_status === "Completed";
  const isOpen = conference.submission_status === "Open";

  return (
    <Card className="hover:shadow-md transition-shadow flex flex-col justify-between">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-2 mb-1.5">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-xl truncate">{conference.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {conference.edition_or_year}
              </Badge>
              <Badge variant="secondary" className="text-xs uppercase tracking-wider">
                {conference.event_type || "conference"}
              </Badge>
              {isPast && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Concluded
                </Badge>
              )}
            </div>
          </div>
          {getRiskBadge(conference.warnings)}
        </div>
        {conference.title && (
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
            {conference.title}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {conference.location && (
          <div className="flex items-center text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 mr-2 shrink-0" />
            <span className="truncate">{conference.location}</span>
          </div>
        )}

        {/* Date / Deadline Status */}
        <div className="flex items-center text-sm text-muted-foreground">
          <Calendar className="h-4 w-4 mr-2 shrink-0" />
          {conference.submission_deadline ? (
            <span className="truncate">
              Deadline: <strong className={isOpen ? "text-success font-semibold" : ""}>{conference.submission_deadline}</strong>
              {isOpen && " (Open)"}
            </span>
          ) : (
            <span className="text-muted-foreground/80 italic">Deadline unannounced</span>
          )}
        </div>

        {/* Paper Opportunity Badge */}
        {!conference.has_paper_submission && (
          <div className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded inline-block">
            🚫 Attendance-only summit
          </div>
        )}

        {/* Topics */}
        {conference.topics && conference.topics.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {conference.topics.slice(0, 3).map((topic) => (
              <Badge key={topic} variant="secondary" className="text-xs font-normal">
                {topic}
              </Badge>
            ))}
            {conference.topics.length > 3 && (
              <Badge variant="secondary" className="text-xs font-normal">
                +{conference.topics.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-3 border-t">
          <Link href={`/conferences/${conference.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              View Details
            </Button>
          </Link>

          <Button
            variant={isTracked ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleTrack}
            title={isTracked ? "Remove from tracking" : "Track submission"}
            className="gap-1 h-9 px-2.5"
          >
            {isTracked ? (
              <>
                <Check className="h-4 w-4 text-success" />
                <span className="text-xs">Tracked</span>
              </>
            ) : (
              <>
                <Bookmark className="h-4 w-4" />
                <span className="text-xs">Track</span>
              </>
            )}
          </Button>

          {conference.official_website_url && (
            <a
              href={conference.official_website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-9 w-9 shrink-0 border border-input"
              title="Official Website"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
