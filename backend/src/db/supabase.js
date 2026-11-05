import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';

let supabaseClient = null;
let isConfigured = false;
let isOnline = false;
let lastHealthCheck = null;
let lastHealthTime = 0;

if (config.supabaseUrl && (config.supabaseServiceKey || config.supabaseAnonKey) && config.supabaseUrl.startsWith('http')) {
  try {
    const key = config.supabaseServiceKey || config.supabaseAnonKey;
    supabaseClient = createClient(config.supabaseUrl, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    isConfigured = true;
    console.log('[Supabase] Initialized client for:', config.supabaseUrl);
  } catch (err) {
    console.warn('[Supabase] Initialization failed:', err.message);
    isConfigured = false;
  }
} else {
  console.log('[Supabase] Running in high-performance autonomous in-memory store mode.');
}

/**
 * Probes Supabase connectivity with a strict 1.2s timeout so the server never hangs.
 * Results are cached for 30s to keep API responses instantaneous (<2ms).
 */
export async function probeSupabase(force = false) {
  if (!isConfigured || !supabaseClient) {
    isOnline = false;
    return {
      status: 'offline',
      mode: 'in-memory-autonomous',
      message: 'Running in high-performance local store mode. To sync with Supabase cloud, provide valid SUPABASE_URL and SUPABASE_ANON_KEY in .env.'
    };
  }

  const now = Date.now();
  if (!force && lastHealthCheck && (now - lastHealthTime < 30000)) {
    return lastHealthCheck;
  }

  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Supabase probe timed out (1200ms)')), 1200)
    );

    const checkQuery = supabaseClient.from('conferences').select('id').limit(1);

    const { data, error } = await Promise.race([checkQuery, timeout]);

    if (error) {
      // Table doesn't exist yet or permission error
      isOnline = false;
      lastHealthCheck = {
        status: 'degraded',
        mode: 'cloud-supabase-tables-missing',
        message: `Connected to Supabase, but conferences table not yet created: ${error.message}. Using fast local store.`
      };
    } else {
      isOnline = true;
      lastHealthCheck = {
        status: 'online',
        mode: 'cloud-supabase-active',
        message: 'Connected to live cloud Supabase database.'
      };
    }
  } catch (err) {
    isOnline = false;
    lastHealthCheck = {
      status: 'offline',
      mode: 'in-memory-autonomous',
      message: `Supabase cloud unreachable (${err.message}). Using high-performance local repository.`
    };
  }

  lastHealthTime = Date.now();
  return lastHealthCheck;
}

// Initial non-blocking probe on boot
if (isConfigured) {
  probeSupabase(true).then(res => {
    console.log(`[Supabase Status] ${res.status} (${res.mode})`);
  }).catch(() => {});
}

export const getSupabase = () => supabaseClient;
export const isSupabaseReady = () => isOnline;
export const checkSupabaseHealth = () => probeSupabase(false);
