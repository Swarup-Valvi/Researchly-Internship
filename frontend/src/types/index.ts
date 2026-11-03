// Shared TypeScript types matching the backend API contracts

export interface Conference {
  id: string;
  name: string;
  edition_or_year: string;
  title?: string | null;
  submission_deadline?: string | null;
  raw_submission_deadline_str?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  format?: string | null;
  publisher?: string | null;
  organizer?: string | null;
  registration_fees?: string | null;
  topics: string[];
  official_website_url?: string | null;
  submission_url?: string | null;
  status?: string | null;
  event_status: string;
  submission_status: string;
  event_type: string;
  paper_opportunity_status: string;
  has_paper_submission: boolean;
  warnings: string[];
}

export interface VerificationFinding {
  rule_id: string;
  rule_name: string;
  category: string;
  status: 'Verified' | 'Contradicted' | 'Unverified' | 'Missing';
  reason: string;
  evidence_ids: number[];
  evidence_excerpts: string[];
}

export interface EvidenceItem {
  id?: number | null;
  conference_id: string;
  category: string;
  claim: string;
  is_self_claimed: boolean;
  source_name: string;
  source_url: string;
  retrieved_at: string;
  supporting_excerpt?: string | null;
  verification_status: 'Verified' | 'Contradicted' | 'Unverified' | 'Missing';
  notes?: string | null;
}

export interface CredibilityAssessment {
  conference_id: string;
  risk_level: 'Low' | 'Medium' | 'High' | 'Insufficient Evidence' | 'Not assessed' | string;
  credibility_status: string;
  positive_indicators: string[];
  warning_indicators: string[];
  contradictions: string[];
  missing_information: string[];
  findings?: VerificationFinding[];
  evidence?: EvidenceItem[];
  assessed_at?: string | null;
  version?: string | null;
  assessed: boolean;
}

export interface PaperMatchRequest {
  title: string;
  abstract: string;
  keywords: string[];
  research_domain?: string;
  preferred_location?: string;
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
  title?: string | null;
  relevance_score: number;
  relevance_rank: number;
  status: string;
  submission_deadline?: string | null;
  days_until_deadline?: number | null;
  location?: string | null;
  location_match: boolean;
  credibility: CredibilityAssessment;
  topic_overlap: TopicOverlap;
  match_explanation: string;
  official_website_url?: string | null;
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

export type ApplicationStatus =
  | 'Interested'
  | 'Shortlisted'
  | 'Preparing'
  | 'Submitted'
  | 'Under Review'
  | 'Accepted'
  | 'Rejected'
  | 'Withdrawn';

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'Interested',
  'Shortlisted',
  'Preparing',
  'Submitted',
  'Under Review',
  'Accepted',
  'Rejected',
  'Withdrawn',
];

export interface ApplicationRecord {
  conference_id: string;
  user_id?: string;
  status: ApplicationStatus;
  notes?: string | null;
  added_at?: string | null;
  updated_at?: string | null;
  submitted_at?: string | null;
  decision_at?: string | null;
  days_until_deadline?: number | null;
  deadline_urgency?: string | null;
  // Denormalized conference info
  conference_name?: string | null;
  conference_title?: string | null;
  submission_deadline?: string | null;
  start_date?: string | null;
  location?: string | null;
  event_status?: string | null;
  official_website_url?: string | null;
  submission_url?: string | null;
}

export interface ConferenceFilters {
  event_type?: string;
  event_status?: string;
  submission_status?: string;
  format_type?: string;
  topic?: string;
  country_or_city?: string;
  include_historical?: boolean;
}

