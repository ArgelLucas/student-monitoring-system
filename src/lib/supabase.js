import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const configured = Boolean(
  url && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) &&
  key && !key.includes('REPLACE_ME')
);

// Session storage clears tokens when a browser tab closes. Tokens are still
// JavaScript-accessible in a static SPA; use a strict CSP and avoid unsafe HTML.
export const supabase = configured ? createClient(url, key, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    autoRefreshToken: true,
    persistSession: true,
    storage: window.sessionStorage,
  },
}) : null;
