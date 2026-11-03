/**
 * Typed API client for the Researchly.io backend.
 */

import type {
  Conference,
  CredibilityAssessment,
  MatchingResult,
  PaperMatchRequest,
  ApplicationRecord,
  ApplicationStatus,
  ConferenceFilters,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export function getAuthenticatedUserId(): string {
  let uid = localStorage.getItem('researchly_user_id');
  if (!uid) {
    uid = 'user_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('researchly_user_id', uid);
  }
  return uid;
}

export function setAuthenticatedUserId(userId: string): void {
  localStorage.setItem('researchly_user_id', userId);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const userId = getAuthenticatedUserId();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-User-Id': userId,
  };

  try {
    const sessionRaw = localStorage.getItem('researchly_auth_session');
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw);
      if (parsed?.access_token) {
        headers['Authorization'] = `Bearer ${parsed.access_token}`;
      }
    }
  } catch {
    // ignore
  }

  const res = await fetch(url, {
    headers: {
      ...headers,
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    let detail = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      // ignore non-json
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Conferences
// ---------------------------------------------------------------------------

export function buildConferenceQuery(filters: ConferenceFilters): string {
  const params = new URLSearchParams();
  if (filters.event_type) params.set('event_type', filters.event_type);
  if (filters.event_status) params.set('event_status', filters.event_status);
  if (filters.submission_status) params.set('submission_status', filters.submission_status);
  if (filters.format_type) params.set('format_type', filters.format_type);
  if (filters.topic) params.set('topic', filters.topic);
  if (filters.country_or_city) params.set('country_or_city', filters.country_or_city);
  if (filters.include_historical) params.set('include_historical', 'true');
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function getConferences(filters: ConferenceFilters = {}): Promise<Conference[]> {
  return request<Conference[]>(`/api/conferences${buildConferenceQuery(filters)}`);
}

export async function getConference(id: string): Promise<Conference> {
  return request<Conference>(`/api/conferences/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Credibility
// ---------------------------------------------------------------------------

export async function getCredibility(conferenceId: string): Promise<CredibilityAssessment> {
  return request<CredibilityAssessment>(`/api/credibility/${encodeURIComponent(conferenceId)}`);
}

export async function runAssessment(conferenceId: string): Promise<CredibilityAssessment> {
  return request<CredibilityAssessment>(`/api/credibility/${encodeURIComponent(conferenceId)}/assess`, {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export async function matchPaper(payload: PaperMatchRequest): Promise<MatchingResult> {
  return request<MatchingResult>('/api/match', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Tracking / Applications
// ---------------------------------------------------------------------------

export async function getApplications(status?: string): Promise<ApplicationRecord[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<ApplicationRecord[]>(`/api/tracking${query}`);
}

export async function getApplication(conferenceId: string): Promise<ApplicationRecord> {
  return request<ApplicationRecord>(`/api/tracking/${encodeURIComponent(conferenceId)}`);
}

export async function createApplication(
  conferenceId: string,
  status: ApplicationStatus = 'Interested',
  notes?: string,
  submittedAt?: string,
  decisionAt?: string,
): Promise<ApplicationRecord> {
  return request<ApplicationRecord>('/api/tracking', {
    method: 'POST',
    body: JSON.stringify({
      conference_id: conferenceId,
      status,
      notes,
      submitted_at: submittedAt,
      decision_at: decisionAt,
    }),
  });
}

export async function updateApplication(
  conferenceId: string,
  updates: {
    status?: ApplicationStatus;
    notes?: string;
    submitted_at?: string;
    decision_at?: string;
  },
): Promise<ApplicationRecord> {
  return request<ApplicationRecord>(`/api/tracking/${encodeURIComponent(conferenceId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteApplication(conferenceId: string): Promise<void> {
  return request<void>(`/api/tracking/${encodeURIComponent(conferenceId)}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function getHealth(): Promise<{
  status: string;
  database: string;
  conferences: number;
  assessments: number;
  tracked_applications: number;
}> {
  return request('/api/health');
}

