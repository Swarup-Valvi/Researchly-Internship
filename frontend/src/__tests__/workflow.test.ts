import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildConferenceQuery,
  getAuthenticatedUserId,
  setAuthenticatedUserId,
} from '../api/client';
import {
  authSignUp,
  authSignIn,
  authSignOut,
  authGetSession,
} from '../lib/supabase';
import { APPLICATION_STATUSES } from '../types';

describe('Frontend Conference Filter Generator', () => {
  it('constructs correct URL query params from filter state', () => {
    const query = buildConferenceQuery({
      event_type: 'workshop',
      submission_status: 'Open',
      include_historical: true,
      country_or_city: 'San Diego',
    });

    expect(query).toContain('event_type=workshop');
    expect(query).toContain('submission_status=Open');
    expect(query).toContain('include_historical=true');
    expect(query).toContain('country_or_city=San+Diego');
  });

  it('omits empty filter values', () => {
    const query = buildConferenceQuery({
      event_type: '',
      include_historical: false,
    });

    expect(query).toBe('');
  });
});

describe('User Authentication & Session Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('generates and persists an authenticated user ID in localStorage', () => {
    const uid1 = getAuthenticatedUserId();
    expect(uid1).toBeTruthy();

    const uid2 = getAuthenticatedUserId();
    expect(uid2).toBe(uid1);

    setAuthenticatedUserId('custom_researcher_id_123');
    expect(getAuthenticatedUserId()).toBe('custom_researcher_id_123');
  });

  it('registers, logs in, persists session, and logs out with full isolation', async () => {
    // 1. Register
    const regRes = await authSignUp('dr.curie@radium.fr', 'password123', 'Dr. Marie Curie');
    expect(regRes.error).toBeNull();
    expect(regRes.user?.email).toBe('dr.curie@radium.fr');
    expect(regRes.user?.fullName).toBe('Dr. Marie Curie');

    // 2. Session verification
    const session1 = await authGetSession();
    expect(session1.user?.email).toBe('dr.curie@radium.fr');

    // 3. Duplicate registration prevention
    const dupRes = await authSignUp('dr.curie@radium.fr', 'password123', 'Duplicate Account');
    expect(dupRes.error).toContain('already exists');

    // 4. Logout
    await authSignOut();
    const sessionAfterLogout = await authGetSession();
    expect(sessionAfterLogout.user).toBeNull();

    // 5. Sign In
    const loginRes = await authSignIn('dr.curie@radium.fr', 'password123');
    expect(loginRes.error).toBeNull();
    expect(loginRes.user?.email).toBe('dr.curie@radium.fr');

    // 6. Bad Password
    const badLogin = await authSignIn('dr.curie@radium.fr', 'wrong_pass');
    expect(badLogin.error).toContain('Invalid');
  });
});

describe('Application Lifecycle Status Integrity', () => {
  it('supports all 8 required submission lifecycle statuses in correct order', () => {
    expect(APPLICATION_STATUSES).toEqual([
      'Interested',
      'Shortlisted',
      'Preparing',
      'Submitted',
      'Under Review',
      'Accepted',
      'Rejected',
      'Withdrawn',
    ]);
  });
});

