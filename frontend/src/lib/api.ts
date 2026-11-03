const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Conference {
  id: string;
  name: string;
  edition_or_year: string;
  title?: string;
  submission_deadline?: string;
  raw_submission_deadline_str?: string;
  start_date?: string;
  end_date?: string;
  location?: string;
  format?: string;
  publisher?: string;
  organizer?: string;
  registration_fees?: string;
  topics: string[];
  official_website_url?: string;
  submission_url?: string;
  status?: string;
  event_status: string;
  submission_status: string;
  event_type: string;
  paper_opportunity_status: string;
  has_paper_submission: boolean;
  warnings: string[];
}

export interface Credibility {
  conference_id: string;
  risk_level: string;
  credibility_status: string;
  positive_indicators: string[];
  warning_indicators: string[];
  contradictions: string[];
  missing_information: string[];
  assessed: boolean;
}

export interface TopicOverlap {
  matched_conference_topics: string[];
  matched_paper_keywords: string[];
  common_terms: string[];
}

export interface ConferenceRecommendation {
  conference_id: string;
  conference_name: string;
  edition_or_year: string;
  title?: string;
  relevance_score: number;
  relevance_rank: number;
  status: string;
  submission_deadline?: string;
  days_until_deadline?: number;
  location?: string;
  location_match: boolean;
  credibility: Credibility;
  topic_overlap: TopicOverlap;
  match_explanation: string;
  official_website_url?: string;
  warnings: string[];
}

export interface MatchingResult {
  paper_title: string;
  total_conferences_evaluated: number;
  upcoming_open_deadline: ConferenceRecommendation[];
  upcoming_passed_deadline: ConferenceRecommendation[];
  upcoming_unknown_deadline: ConferenceRecommendation[];
  historical_completed: ConferenceRecommendation[];
  date_unknown: ConferenceRecommendation[];
}

export interface PaperMatchRequest {
  title: string;
  abstract: string;
  keywords: string[];
  research_domain?: string;
  preferred_location?: string;
}

export interface ConferenceListFilters {
  event_type?: string;
  has_paper_submission?: boolean;
  paper_opportunity_status?: string;
  status?: string;
  event_status?: string;
  submission_status?: string;
  include_historical?: boolean;
  topic?: string;
  country_or_city?: string;
  format_type?: string;
  min_deadline?: string;
  max_deadline?: string;
}

// Client-side Application Tracking Models
export type TrackingStatus = "Preparing" | "Submitted" | "Accepted" | "Under Review" | "Shortlisted" | "Presented" | "Rejected";

export interface TrackedApplication {
  id: string; // unique tracking item id
  conferenceId: string;
  conferenceName: string;
  editionOrYear: string;
  title?: string;
  submissionDeadline?: string;
  startDate?: string;
  location?: string;
  status: TrackingStatus;
  notes?: string;
  paperTitle?: string;
  addedAt: string;
  updatedAt: string;
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  conferences: {
    list: (filters?: ConferenceListFilters) => {
      const params = new URLSearchParams();
      if (filters) {
        if (filters.event_type) params.append("event_type", filters.event_type);
        if (filters.has_paper_submission !== undefined)
          params.append("has_paper_submission", String(filters.has_paper_submission));
        if (filters.paper_opportunity_status)
          params.append("paper_opportunity_status", filters.paper_opportunity_status);
        if (filters.status) params.append("status", filters.status);
        if (filters.event_status) params.append("event_status", filters.event_status);
        if (filters.submission_status) params.append("submission_status", filters.submission_status);
        if (filters.include_historical !== undefined)
          params.append("include_historical", String(filters.include_historical));
        if (filters.topic) params.append("topic", filters.topic);
        if (filters.country_or_city) params.append("country_or_city", filters.country_or_city);
        if (filters.format_type) params.append("format_type", filters.format_type);
        if (filters.min_deadline) params.append("min_deadline", filters.min_deadline);
        if (filters.max_deadline) params.append("max_deadline", filters.max_deadline);
      }
      const qs = params.toString();
      return fetchAPI<Conference[]>(`/api/conferences${qs ? `?${qs}` : ""}`);
    },
    get: (id: string) => fetchAPI<Conference>(`/api/conferences/${id}`),
  },
  credibility: {
    get: (id: string) => fetchAPI<Credibility>(`/api/credibility/${id}`),
  },
  match: {
    paper: (request: PaperMatchRequest) =>
      fetchAPI<MatchingResult>("/api/match", {
        method: "POST",
        body: JSON.stringify(request),
      }),
  },
  health: () => fetchAPI<{ status: string; database: string }>("/api/health"),
};

// Local storage helper for submission tracking
const TRACKING_STORAGE_KEY = "researchly_tracked_applications";

export const trackingStore = {
  getAll: (): TrackedApplication[] => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(TRACKING_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },
  save: (app: TrackedApplication) => {
    if (typeof window === "undefined") return;
    const current = trackingStore.getAll();
    const existingIndex = current.findIndex((item) => item.id === app.id || item.conferenceId === app.conferenceId);
    if (existingIndex >= 0) {
      current[existingIndex] = { ...current[existingIndex], ...app, updatedAt: new Date().toISOString() };
    } else {
      current.push(app);
    }
    localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new Event("researchly_tracking_changed"));
  },
  remove: (idOrConfId: string) => {
    if (typeof window === "undefined") return;
    const current = trackingStore.getAll().filter((item) => item.id !== idOrConfId && item.conferenceId !== idOrConfId);
    localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new Event("researchly_tracking_changed"));
  },
  isTracking: (conferenceId: string): boolean => {
    if (typeof window === "undefined") return false;
    const current = trackingStore.getAll();
    return current.some((item) => item.conferenceId === conferenceId);
  },
};
