"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Calendar, MapPin, Shield, AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { api, PaperMatchRequest, MatchingResult, ConferenceRecommendation } from "@/lib/api";

export default function AIMatchPage() {
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [keywords, setKeywords] = useState("");
  const [domain, setDomain] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMatch = async () => {
    if (!title.trim() || !abstract.trim()) {
      setError("Please provide both title and abstract.");
      return;
    }

    const request: PaperMatchRequest = {
      title,
      abstract,
      keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
      research_domain: domain || undefined,
      preferred_location: location || undefined,
    };

    try {
      setLoading(true);
      setError(null);
      const data = await api.match.paper(request);
      setResult(data);
    } catch (err) {
      setError("Failed to match paper. Backend API may not be running.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getRiskBadge = (riskLevel: string) => {
    switch (riskLevel.toLowerCase()) {
      case "low":
        return <Badge className="bg-success">Low Risk</Badge>;
      case "medium":
        return <Badge className="bg-warning">Medium Risk</Badge>;
      case "high":
        return <Badge className="bg-destructive">High Risk</Badge>;
      default:
        return <Badge variant="outline">{riskLevel}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-accent" />
            AI Research Match
          </h1>
          <p className="text-muted-foreground">
            Match your research paper to suitable conferences using TF-IDF similarity and credibility assessment
          </p>
        </div>

        {/* Input Form */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Paper Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Paper Title *</label>
              <Input
                placeholder="Enter your paper title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Abstract *</label>
              <Textarea
                placeholder="Enter your paper abstract"
                value={abstract}
                onChange={(e) => setAbstract(e.target.value)}
                rows={4}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Keywords (comma-separated)</label>
              <Input
                placeholder="e.g., machine learning, computer vision, deep learning"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Research Domain</label>
                <Input
                  placeholder="e.g., Computer Vision"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Preferred Location</label>
                <Input
                  placeholder="e.g., USA, Europe"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={handleMatch} disabled={loading} className="w-full gap-2" size="lg">
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Matching...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  Find Matching Conferences
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Error State */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                Recommendations for "{result.paper_title}"
              </h2>
              <Badge variant="outline">
                {result.total_conferences_evaluated} conferences evaluated
              </Badge>
            </div>

            <Tabs defaultValue="open" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="open">
                  Open ({result.upcoming_open_deadline.length})
                </TabsTrigger>
                <TabsTrigger value="passed">
                  Passed ({result.upcoming_passed_deadline.length})
                </TabsTrigger>
                <TabsTrigger value="unknown">
                  Unknown ({result.upcoming_unknown_deadline.length})
                </TabsTrigger>
                <TabsTrigger value="historical">
                  Historical ({result.historical_completed.length})
                </TabsTrigger>
                <TabsTrigger value="date-unknown">
                  No Date ({result.date_unknown.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="open" className="space-y-4 mt-4">
                {result.upcoming_open_deadline.length === 0 ? (
                  <p className="text-muted-foreground">No conferences with open deadlines.</p>
                ) : (
                  result.upcoming_open_deadline.map((rec) => (
                    <RecommendationCard key={rec.conference_id} rec={rec} getRiskBadge={getRiskBadge} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="passed" className="space-y-4 mt-4">
                {result.upcoming_passed_deadline.length === 0 ? (
                  <p className="text-muted-foreground">No conferences with passed deadlines.</p>
                ) : (
                  result.upcoming_passed_deadline.map((rec) => (
                    <RecommendationCard key={rec.conference_id} rec={rec} getRiskBadge={getRiskBadge} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="unknown" className="space-y-4 mt-4">
                {result.upcoming_unknown_deadline.length === 0 ? (
                  <p className="text-muted-foreground">No conferences with unknown deadlines.</p>
                ) : (
                  result.upcoming_unknown_deadline.map((rec) => (
                    <RecommendationCard key={rec.conference_id} rec={rec} getRiskBadge={getRiskBadge} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="historical" className="space-y-4 mt-4">
                {result.historical_completed.length === 0 ? (
                  <p className="text-muted-foreground">No historical conferences.</p>
                ) : (
                  result.historical_completed.map((rec) => (
                    <RecommendationCard key={rec.conference_id} rec={rec} getRiskBadge={getRiskBadge} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="date-unknown" className="space-y-4 mt-4">
                {result.date_unknown.length === 0 ? (
                  <p className="text-muted-foreground">No conferences with unknown dates.</p>
                ) : (
                  result.date_unknown.map((rec) => (
                    <RecommendationCard key={rec.conference_id} rec={rec} getRiskBadge={getRiskBadge} />
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationCard({
  rec,
  getRiskBadge,
}: {
  rec: ConferenceRecommendation;
  getRiskBadge: (riskLevel: string) => React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start mb-2">
          <div>
            <CardTitle className="text-xl">
              {rec.conference_name} {rec.edition_or_year}
            </CardTitle>
            {rec.title && <p className="text-sm text-muted-foreground">{rec.title}</p>}
          </div>
          <div className="text-right">
            <Badge className="bg-accent mb-1">
              #{rec.relevance_rank}
            </Badge>
            <div className="text-sm font-semibold text-accent">
              {(rec.relevance_score * 100).toFixed(1)}% match
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{rec.status}</Badge>
          {getRiskBadge(rec.credibility.risk_level)}
          {rec.location_match && <Badge className="bg-success">Location Match</Badge>}
        </div>

        {rec.submission_deadline && (
          <div className="flex items-center text-sm text-muted-foreground">
            <Calendar className="h-4 w-4 mr-2" />
            Deadline: {rec.submission_deadline}
            {rec.days_until_deadline !== undefined && (
              <span className="ml-2">
                ({rec.days_until_deadline > 0 ? `${rec.days_until_deadline} days left` : rec.days_until_deadline === 0 ? "Today" : `${Math.abs(rec.days_until_deadline)} days ago`})
              </span>
            )}
          </div>
        )}

        {rec.location && (
          <div className="flex items-center text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 mr-2" />
            {rec.location}
          </div>
        )}

        <div className="text-sm">
          <span className="font-medium">Explanation:</span> {rec.match_explanation}
        </div>

        {rec.topic_overlap.matched_conference_topics.length > 0 && (
          <div>
            <span className="text-sm font-medium">Matching topics:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {rec.topic_overlap.matched_conference_topics.map((topic) => (
                <Badge key={topic} variant="secondary" className="text-xs">
                  {topic}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {rec.credibility.assessed && (
          <div className="border-t pt-3 mt-3">
            <div className="flex items-center mb-2">
              <Shield className="h-4 w-4 mr-2" />
              <span className="text-sm font-medium">Credibility Assessment</span>
            </div>
            {rec.credibility.positive_indicators.length > 0 && (
              <div className="text-xs text-success mb-1">
                ✓ {rec.credibility.positive_indicators[0]}
              </div>
            )}
            {rec.credibility.warning_indicators.length > 0 && (
              <div className="text-xs text-warning mb-1">
                ⚠ {rec.credibility.warning_indicators[0]}
              </div>
            )}
          </div>
        )}

        {rec.official_website_url && (
          <a
            href={rec.official_website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 w-full"
          >
            <ExternalLink className="h-4 w-4" />
            Visit Official Website
          </a>
        )}
      </CardContent>
    </Card>
  );
}
