import './styles/main.css';
import { configured, supabase } from './lib/supabase.js';
import { getContext, getCatalog, getMyAttendance, getAdminData, rpc } from './lib/api.js';
import { loginWithGitHub, logout, startHeartbeat } from './lib/auth.js';
import { escapeHtml, formError, normalizeGitHubAccount } from './lib/format.js';
import {
  loginScreen, profileScreen, pendingScreen, studentScreen,
  attendanceScreen, adminScreen, fatalScreen, setupScreen
} from './pages/screens.js';

const app = document.querySelector('#app');
let currentContext = null;
let renderCount = 0;
let oauthError = '';

function path() {
  return window.location.hash.replace(/^#/, '') || '/';
}
function go(route) {
  if (path() !== route) window.location.hash = `#${route}`;
}
function setMarkup(html) { app.innerHTML = html; }
function messageFor(error) { return error instanceof Error ? error.message : 'Unexpected error'; }
function setError(id, error) {
  const target = document.getElementById(id);
  if (target) target.innerHTML = formError(messageFor(error));
}

async function render() {
  const attempt = ++renderCount;
  setMarkup('<div class="grid min-h-[65vh] place-items-center px-6 text-muted">Verifying your secure session…</div>');
  if (!configured) { setMarkup(setupScreen()); return; }

  try {
    const context = await getContext();
    if (attempt !== renderCount) return;
    currentContext = context;
    if (!context) {
      go('/login');
      setMarkup(loginScreen(oauthError));
      return;
    }

    if (context.admin) {
      if (path() !== '/admin') { go('/admin'); return; }
      const data = await getAdminData();
      if (attempt === renderCount) setMarkup(adminScreen(context, data));
      return;
    }

    if (!context.profile) {
      if (path() !== '/profile') { go('/profile'); return; }
      const [catalog, github] = await Promise.all([getCatalog(), rpc('current_github_username')]);
      if (attempt === renderCount) setMarkup(profileScreen(null, catalog, github));
      return;
    }

    if (!context.profile.is_approved) {
      if (path() === '/profile') {
        const [catalog, github] = await Promise.all([getCatalog(), rpc('current_github_username')]);
        if (attempt === renderCount) setMarkup(profileScreen(context.profile, catalog, github));
        return;
      }
      if (path() !== '/pending') { go('/pending'); return; }
      setMarkup(pendingScreen(context.profile));
      return;
    }

    if (path() === '/profile') {
      const [catalog, github] = await Promise.all([getCatalog(), rpc('current_github_username')]);
      if (attempt === renderCount) setMarkup(profileScreen(context.profile, catalog, github));
      return;
    }
    const attendance = await getMyAttendance(context.user.id);
    if (attempt !== renderCount) return;
    if (path() === '/attendance') setMarkup(attendanceScreen(context, attendance));
    else if (path() === '/student') setMarkup(studentScreen(context, attendance));
    else go('/student');
  } catch (error) {
    if (attempt !== renderCount) return;
    // An invalid/expired/revoked portal session cannot open any protected page.
    if (/session.*(expired|invalid)|authentication session|jwt expired/i.test(messageFor(error))) {
      await logout();
      return;
    }
    setMarkup(fatalScreen(messageFor(error)));
  }
}

async function saveProfile(form) {
  const submit = form.querySelector('[type="submit"]');
  const raw = Object.fromEntries(new FormData(form));
  const github = normalizeGitHubAccount(raw.github_username);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(github)) {
    throw new Error('Enter a valid GitHub username or GitHub profile URL.');
  }
  submit.disabled = true;
  try {
    await rpc('save_student_profile', {
      p_surname: raw.surname.trim(),
      p_first_name: raw.first_name.trim(),
      p_middle_initial: raw.middle_initial.trim().toUpperCase(),
      p_sex: raw.sex,
      p_age: Number(raw.age),
      p_section_id: Number(raw.section_id),
      p_subject_id: Number(raw.subject_id),
      p_github_username: github,
    });
    go('/pending');
    await render();
  } finally { submit.disabled = false; }
}

async function handleClick(event) {
  const trigger = event.target.closest('button');
  if (!trigger || trigger.disabled) return;
  try {
    if (trigger.id === 'github-login') {
      trigger.disabled = true;
      await loginWithGitHub();
    } else if (trigger.id === 'logout-button') {
      trigger.disabled = true;
      await logout();
    } else if (trigger.id === 'mark-attendance') {
      trigger.disabled = true;
      try {
        await rpc('mark_my_attendance');
        await render();
      } catch (error) {
        setError('attendance-message', error);
        trigger.disabled = false;
      }
    } else if (trigger.id === 'refresh-status' || trigger.id === 'admin-refresh' || trigger.id === 'retry-load') {
      await render();
    } else if (trigger.matches('[data-approval]')) {
      const requestedApproval = trigger.dataset.approval === 'true';
      const subject = trigger.dataset.userId;
      if (!window.confirm(`Are you sure you want to ${requestedApproval ? 'approve' : 'revoke'} this student?`)) return;
      trigger.disabled = true;
      await rpc('set_student_approval', { p_student_id: subject, p_approved: requestedApproval });
      await render();
    }
  } catch (error) {
    if (trigger.id === 'github-login') {
      oauthError = messageFor(error);
      setMarkup(loginScreen(oauthError));
    } else {
      window.alert(messageFor(error));
      trigger.disabled = false;
    }
  }
}

async function handleSubmit(event) {
  if (event.target?.id !== 'profile-form') return;
  event.preventDefault();
  try { await saveProfile(event.target); }
  catch (error) { setError('form-message', error); }
}

function handleInput(event) {
  if (event.target?.id !== 'student-search') return;
  const keyword = event.target.value.trim().toLowerCase();
  document.querySelectorAll('.student-row').forEach((row) => {
    row.hidden = !row.dataset.search.includes(keyword);
  });
}

function readCallbackError() {
  const url = new URL(window.location.href);
  oauthError = url.searchParams.get('error_description') || url.searchParams.get('error') || '';
  // Preserve `code` for Supabase PKCE automatic exchange, then strip later.
  if (oauthError) {
    url.search = '';
    window.history.replaceState({}, '', url.pathname + url.hash);
  }
}

async function init() {
  readCallbackError();
  window.addEventListener('hashchange', render);
  document.addEventListener('click', handleClick);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('input', handleInput);
  if (configured) {
    startHeartbeat();
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        // Do not await Supabase queries directly inside the SDK auth callback.
        setTimeout(render, 0);
      }
    });
  }
  await render();
  // Supabase has already processed the PKCE query code by this point.
  if (configured && window.location.search.includes('code=')) {
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  }
}

init().catch((error) => setMarkup(fatalScreen(messageFor(error))));
