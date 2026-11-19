import { supabase } from './supabase.js';
import { rpc } from './api.js';

export const IDLE_LIMIT_MS = 30 * 60 * 1000;
let lastHumanAction = Date.now();
let lastRemoteTouch = Date.now();
let loggingOut = false;
let heartbeatStarted = false;

export async function loginWithGitHub() {
  const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).href;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github', options: { redirectTo }
  });
  if (error) throw error;
}

export async function logout() {
  if (loggingOut) return;
  loggingOut = true;
  try {
    // Invalidate this server-side portal session before invalidating Auth tokens.
    try { await rpc('end_portal_session'); } catch (error) { console.warn('Portal session revocation:', error.message); }
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) {
      // The preceding portal revocation still protects database access.
      const local = await supabase.auth.signOut({ scope: 'local' });
      if (local.error) throw local.error;
    }
    window.location.hash = '#/login';
    window.location.reload();
  } finally {
    loggingOut = false;
  }
}

export function startHeartbeat() {
  if (heartbeatStarted) return;
  heartbeatStarted = true;
  const recordHumanAction = () => { lastHumanAction = Date.now(); };
  window.addEventListener('pointerdown', recordHumanAction, { passive: true });
  window.addEventListener('keydown', recordHumanAction);
  window.addEventListener('scroll', recordHumanAction, { passive: true });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    await monitorSession();
  });
  window.setInterval(monitorSession, 60_000);
}

async function monitorSession() {
  if (!supabase || loggingOut || document.visibilityState !== 'visible') return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const now = Date.now();
  if (now - lastHumanAction >= IDLE_LIMIT_MS) {
    await logout();
    return;
  }
  // Touch only if the person is genuinely active, not via a blind timer.
  if (now - lastHumanAction < 5 * 60_000 && now - lastRemoteTouch > 3 * 60_000) {
    try {
      await rpc('touch_portal_session');
      lastRemoteTouch = now;
    } catch {
      await logout();
    }
  }
}
