import { store } from '../db/store.js';
import { getSupabase, isSupabaseReady } from '../db/supabase.js';

/** Resolve the caller from the bearer token (Supabase session or local-profile token). Guests get id null. */
export async function getCurrentUserContext(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (isSupabaseReady()) {
      try {
        const supabase = getSupabase();
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) {
          const { data: profile } = await supabase.from('profiles').select('id, interests').eq('id', user.id).maybeSingle();
          return { id: user.id, interests: profile?.interests || [] };
        }
      } catch (e) {
        console.warn('[UserContext] lookup error:', e.message);
      }
    }
    const localUser = store.getLocalProfile(token);
    if (localUser) return { id: localUser.id, interests: localUser.interests || [] };
  }
  return { id: null, interests: [] };
}
