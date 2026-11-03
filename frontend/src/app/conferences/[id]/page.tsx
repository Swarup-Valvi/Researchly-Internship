"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Shield,
  Calendar,
  MapPin,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Bookmark,
  Check,
  Globe,
  FileText,
  Building,
  Tag,
} from "lucide-react";
import { api, Conference, Credibility, trackingStore } from "@/lib/api";

function ConferenceDetailContent() {
  const params = useParams();
  const conferenceId = (params?.id as string) || "";
  const [conference, setConference] = useState<Conference | null>(null);
  const [credibility, setCredibility] = useState<Credibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTracked, setIsTracked] = useState(false);

  useEffect(() => {
    if (!conferenceId) return;

    setIsTracked(trackingStore.isTracking(conferenceId));

    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [confData, credData] = await Promise.all([
          api.conferences.get(conferenceId),
          api.credibility.get(conferenceId).catch(() => null),
        ]);
        setConference(confData);
        setCredibility(credData);
      } catch (err) {
        setError("Failed to load conference details. Backend API may not be running.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [conferenceId]);

  const toggleTrack = () => {
    if (!conference) return;
    if (isTracked) {
      trackingStore.remove(conference.id);
      setIsTracked(false);
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
      setIsTracked(true);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading conference profile...</p>
        </div>
      </div>
    );
  }

  if (error || !conference) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error || "Conference not found"}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel?.toLowerCase()) {
      case "low":
        return "text-success";
      case "medium":
        return "text-warning";
      case "high":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  const isPast = conference.event_status === "Completed";
  const isOpen = conference.submission_status === "Open";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 border-b pb-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h1 className="text-3xl font-bold">
                  {conference.name} {conference.edition_or_year}
                </h1>
                <Badge variant="outline" className="text-xs uppercase">
                  {conference.event_type || "conference"}
                </Badge>
                {isPast ? (
                  <Badge variant="secondary">Concluded Event</Badge>
                ) : (
                  <Badge className="bg-primary text-primary-foreground">Active Opportunity</Badge>
                )}
                {isOpen && <Badge className="bg-success text-white">🟢 Submissions Open</Badge>}
              </div>
              {conference.title && <p className="text-lg text-muted-foreground">{conference.title}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant={isTracked ? "secondary" : "default"}
                onClick={toggleTrack}
                className="gap-2"
              >
                {isTracked ? (
                  <>
                    <Check className="h-4 w-4 text-success" />
                    Tracked in Applications
                  </>
                ) : (
                  <>
                    <Bookmark className="h-4 w-4" />
                    Track Submission
                  </>
                )}
              </Button>

              {conference.submission_url && (
                <a
                  href={conference.submission_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
                >
                  <FileText className="h-4 w-4 text-accent" />
                  Submit Paper / CFP
                </a>
              )}

              {conference.official_website_url && (
                <a
                  href={conference.official_website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
                >
                  <Globe className="h-4 w-4" />
                  Official Website
                </a>
              )}
            </div>
          </div>

          {/* Quick Key Facts Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Submission Deadline</p>
              <p className="font-semibold mt-0.5 flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {conference.submission_deadline || "Unannounced"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Conference Dates</p>
              <p className="font-semibold mt-0.5">
                {conference.start_date
                  ? `${conference.start_date}${conference.end_date ? ` to ${conference.end_date}` : ""}`
                  : "Dates pending"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="font-semibold mt-0.5 flex items-center gap-1.5 truncate">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{conference.location || "Location TBD"}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Publisher / Organizer</p>
              <p className="font-semibold mt-0.5 flex items-center gap-1.5 truncate">
                <Building className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{conference.publisher || conference.organizer || "Academic Organization"}</span>
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="credibility" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="credibility">Trust & Credibility</TabsTrigger>
            <TabsTrigger value="details">Submission & Details</TabsTrigger>
          </TabsList>

          {/* Researchly Trust & Credibility */}
          <TabsContent value="credibility" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-6 w-6 text-primary" />
                  Evidence-Based Credibility Assessment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {credibility && credibility.assessed ? (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-lg bg-muted/40 border">
                      <Badge className="text-base px-3 py-1.5 w-fit" variant="outline">
                        Risk Level:{" "}
                        <span className={`ml-2 font-bold ${getRiskColor(credibility.risk_level)}`}>
                          {credibility.risk_level}
                        </span>
                      </Badge>
                      <p className="text-sm text-muted-foreground">{credibility.credibility_status}</p>
                    </div>

                    <Separator />

                    {credibility.positive_indicators && credibility.positive_indicators.length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-2 flex items-center gap-2 text-success">
                          <CheckCircle className="h-5 w-5" />
                          Positive Verification Indicators
                        </h3>
                        <ul className="space-y-1.5">
                          {credibility.positive_indicators.map((indicator, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                              <span className="text-success font-bold">✓</span>
                              {indicator}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {credibility.warning_indicators && credibility.warning_indicators.length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-2 flex items-center gap-2 text-warning">
                          <AlertCircle className="h-5 w-5" />
                          Warning Indicators
                        </h3>
                        <ul className="space-y-1.5">
                          {credibility.warning_indicators.map((indicator, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                              <span className="text-warning font-bold">⚠</span>
                              {indicator}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {credibility.contradictions && credibility.contradictions.length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-2 flex items-center gap-2 text-destructive">
                          <XCircle className="h-5 w-5" />
                          Contradictions & Red Flags
                        </h3>
                        <ul className="space-y-1.5">
                          {credibility.contradictions.map((contradiction, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                              <span className="text-destructive font-bold">✗</span>
                              {contradiction}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {credibility.missing_information && credibility.missing_information.length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-2 flex items-center gap-2 text-muted-foreground">
                          <AlertCircle className="h-5 w-5" />
                          Missing Evidence Fields
                        </h3>
                        <ul className="space-y-1">
                          {credibility.missing_information.map((missing, idx) => (
                            <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
                              <span className="text-muted-foreground">•</span>
                              {missing}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Automated credibility assessment is evaluating evidence for this edition. Verified records
                      are derived deterministically from publisher registries and official academic links.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Quality Warnings */}
            {conference.warnings && conference.warnings.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-warning">
                    <AlertTriangle className="h-4 w-4" />
                    Data Quality & Verification Warnings ({conference.warnings.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {conference.warnings.map((w, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                        <span>•</span> {w}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Details & Submission Tab */}
          <TabsContent value="details" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5" /> Topics & Research Areas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {conference.topics && conference.topics.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {conference.topics.map((t) => (
                      <Badge key={t} variant="secondary" className="px-3 py-1">
                        {t}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No explicit topics listed.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conference Provenance & Logistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">Format</span>
                  <span className="font-medium">{conference.format || "In-Person"}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">Paper Submission Track</span>
                  <span className="font-medium">
                    {conference.has_paper_submission ? "Academic CFP available" : "Attendance-only"}
                  </span>
                </div>
                {conference.registration_fees && (
                  <div className="flex justify-between py-1.5 border-b">
                    <span className="text-muted-foreground">Registration Fees</span>
                    <span className="font-medium">{conference.registration_fees}</span>
                  </div>
                )}
                {conference.raw_submission_deadline_str && (
                  <div className="flex justify-between py-1.5 border-b">
                    <span className="text-muted-foreground">Raw Announced Deadline</span>
                    <span className="font-medium font-mono text-xs">{conference.raw_submission_deadline_str}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function ConferenceDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ConferenceDetailContent />
    </Suspense>
  );
}
