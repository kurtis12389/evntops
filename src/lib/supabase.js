import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

/** Turn a Supabase/Postgres error into a sentence a person can act on. */
export function friendlyError(err) {
  if (!err) return '';
  const msg = err.message || String(err);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'No connection. Try again when you have signal.';
  if (/Invalid login credentials/i.test(msg)) return 'That email and password do not match.';
  if (/Email not confirmed/i.test(msg)) return 'Check your inbox and confirm your email first.';
  if (/row-level security|permission denied/i.test(msg)) return 'Your account does not have permission to do that.';
  return msg;
}
