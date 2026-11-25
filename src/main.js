
import './styles/main.css';
import { configured, supabase } from './lib/supabase.js';
import {
  getContext, getCatalog, getMyAttendance,
  getMyClassData, getAdminData, rpc,
} from './lib/api.js';
import { loginWithGitHub, logout, startHeartbeat } from './lib/auth.js';
import { formError, normalizeGitHubAccount } from './lib/format.js';
import { buildMeetingReport, toCsv } from './lib/report.js';
import { manilaClock } from './lib/schedule.js';
import {
  loginScreen, profileScreen, pendingScreen,
  studentScreen, attendanceScreen,
  adminScreen, adminStudentsScreen,
  adminAttendanceScreen, adminClassesScreen,
  adminReportsScreen, adminAuditScreen,
  fatalScreen, setupScreen,
} from './pages/screens.js';

const app = document.querySelector('#app');

let currentContext = null;
let adminData = null;
let studentData = null;
let renderCount = 0;

let contextFetchedAt = 0;
let adminFetchedAt = 0;
let studentFetchedAt = 0;

// Avoid unnecessary remote checks during navigation.
// Supabase RLS and RPC functions still enforce authorization.
const SESSION_RECHECK_MS = 30_000;
const DATA_RECHECK_MS = 45_000;

function clearCachedState() {
  currentContext = null;
  adminData = null;
  studentData = null;
  contextFetchedAt = 0;
  adminFetchedAt = 0;
  studentFetchedAt = 0;
}

function markAdminDataStale() {
  adminFetchedAt = 0;
}

function markStudentDataStale() {
  studentFetchedAt = 0;
}

let oauthError = '';
let subjectPairs = [];
let reportFilters = {
  date: manilaClock().date,
  sectionId: '',
  subjectId: '',
};
let chartRange = 7;
let globalSearchTerm = '';
let studentApprovalFocus = '';

function path() {
  return window.location.hash.replace(/^#/, '') || '/';
}

function go(route) {
  if (path() !== route) {
    window.location.hash = `#${route}`;
  }
}

function setMarkup(html) {
  app.innerHTML = html;
  syncSubjectOptions();

  if (path() === '/admin/students') {
    const field = document.getElementById('student-search');
    const approval = document.getElementById('student-approval-filter');

    if (field) field.value = globalSearchTerm;

    if (approval && studentApprovalFocus) {
      approval.value = studentApprovalFocus;
    }

    applyStudentFilters();
  }
}

function messageFor(error) {
  return error instanceof Error
    ? error.message
    : 'Unexpected error';
}

function setError(id, error) {
  const node = document.getElementById(id);
  if (node) {
    node.innerHTML = formError(messageFor(error));
  }
}

// Frontend convenience only.
// Server-side authorization must remain enforced.
function syncSubjectOptions(form = null) {
  const forms = form
    ? [form]
    : [...document.querySelectorAll(
        '#profile-form, .assignment-form'
      )];

  for (const f of forms) {
    const section = f.querySelector('[name="section_id"]');
    const subject = f.querySelector('[name="subject_id"]');

    if (!section || !subject) continue;

    const allowed = new Set(
      subjectPairs
        .filter(
          (pair) =>
            Number(pair.section_id) === Number(section.value)
        )
        .map((pair) => Number(pair.subject_id))
    );

    for (const option of subject.options) {
      if (!option.value) continue;

      const enabled = allowed.has(Number(option.value));
      option.hidden = !enabled;
      option.disabled = !enabled;
    }

    if (!allowed.has(Number(subject.value))) {
      subject.value = '';
    }
  }
}

// =============================================
// ROUTING AND SMOOTH NAVIGATION
// =============================================

async function render({ force = false } = {}) {
  const attempt = ++renderCount;

  // Loading screen only appears when no context exists.
  // Normal dashboard navigation stays visible.
  if (!currentContext) {
    setMarkup(`
      <div
        class="grid min-h-[65vh] place-items-center text-muted"
        role="status"
      >
        Loading StudentMonitor…
      </div>
    `);
  }

  if (!configured) {
    setMarkup(setupScreen());
    return;
  }

  try {
    const refreshContext =
      force ||
      !currentContext ||
      Date.now() - contextFetchedAt >= SESSION_RECHECK_MS;

    const context = refreshContext
      ? await getContext()
      : currentContext;

    if (attempt !== renderCount) return;

    if (refreshContext) {
      contextFetchedAt = Date.now();
    }

    currentContext = context;

    // =========================================
    // NOT LOGGED IN
    // =========================================

    if (!context) {
      clearCachedState();

      if (path() !== '/login') {
        go('/login');
        return;
      }

      setMarkup(loginScreen(oauthError));
      return;
    }

    // =========================================
    // ADMIN DASHBOARD
    // =========================================

    if (context.admin) {
      studentData = null;
      studentFetchedAt = 0;

      if (!path().startsWith('/admin')) {
        go('/admin');
        return;
      }

      // Reuse verified dashboard data during tab changes.
      const refreshData =
        force ||
        !adminData ||
        Date.now() - adminFetchedAt >= DATA_RECHECK_MS;

      const data = refreshData
        ? await getAdminData()
        : adminData;

      if (attempt !== renderCount) return;

      if (refreshData) {
        adminFetchedAt = Date.now();
      }

      subjectPairs = data.sectionSubjects;
      adminData = data;

      const adminContext = {
        ...context,
        adminMeta: {
          pending: data.profiles.filter(
            (p) => !p.is_approved
          ).length,
          warnings: data.schemaWarnings || [],
        },
      };

      switch (path()) {
        case '/admin':
          setMarkup(
            adminScreen(adminContext, data, chartRange)
          );
          break;

        case '/admin/students':
          setMarkup(
            adminStudentsScreen(adminContext, data)
          );
          break;

        case '/admin/attendance':
          setMarkup(
            adminAttendanceScreen(adminContext, data)
          );
          break;

        case '/admin/classes':
          setMarkup(
            adminClassesScreen(adminContext, data)
          );
          break;

        case '/admin/reports':
          setMarkup(
            adminReportsScreen(
              adminContext,
              data,
              reportFilters
            )
          );
          break;

        case '/admin/audit':
          setMarkup(
            adminAuditScreen(adminContext, data)
          );
          break;

        default:
          go('/admin');
      }

      return;
    }

    // =========================================
    // STUDENT PORTAL
    // =========================================

    adminData = null;
    adminFetchedAt = 0;

    if (!context.profile) {
      if (path() !== '/profile') {
        go('/profile');
        return;
      }

      const [catalog, github] = await Promise.all([
        getCatalog(),
        rpc('current_github_username'),
      ]);

      if (attempt === renderCount) {
        subjectPairs = catalog.sectionSubjects;
        setMarkup(
          profileScreen(null, catalog, github)
        );
      }

      return;
    }

    if (!context.profile.is_approved) {
      if (path() === '/profile') {
        const [catalog, github] = await Promise.all([
          getCatalog(),
          rpc('current_github_username'),
        ]);

        if (attempt === renderCount) {
          subjectPairs = catalog.sectionSubjects;
          setMarkup(
            profileScreen(context.profile, catalog, github)
          );
        }

        return;
      }

      if (path() !== '/pending') {
        go('/pending');
        return;
      }

      setMarkup(pendingScreen(context.profile));
      return;
    }

    if (path() === '/profile') {
      const [catalog, github] = await Promise.all([
        getCatalog(),
        rpc('current_github_username'),
      ]);

      if (attempt === renderCount) {
        subjectPairs = catalog.sectionSubjects;
        setMarkup(
          profileScreen(context.profile, catalog, github)
        );
      }

      return;
    }

    const refreshData =
      force ||
      !studentData ||
      Date.now() - studentFetchedAt >= DATA_RECHECK_MS;

    const data = refreshData
      ? await (async () => {
          const [attendance, classes, catalog] =
            await Promise.all([
              getMyAttendance(context.user.id),
              getMyClassData(context.profile.section_id),
              getCatalog(),
            ]);

          return {
            attendance,
            ...classes,
            ...catalog,
          };
        })()
      : studentData;

    if (attempt !== renderCount) return;

    if (refreshData) {
      studentFetchedAt = Date.now();
    }

    studentData = data;

    if (path() === '/attendance') {
      setMarkup(attendanceScreen(context, data));
    } else if (path() === '/student') {
      setMarkup(studentScreen(context, data));
    } else {
      go('/student');
    }
  } catch (error) {
    if (attempt !== renderCount) return;

    if (
      /session.*(expired|invalid)|authentication session|jwt expired/i.test(
        messageFor(error)
      )
    ) {
      clearCachedState();
      await logout();
      return;
    }

    // Keep the existing dashboard visible if
    // a temporary background refresh fails.
    if (
      currentContext &&
      app.querySelector(
        '.admin-app-shell, .student-app-shell, .portal-shell'
      )
    ) {
      window.alert(
        `Unable to refresh data: ${messageFor(error)}. Please try again.`
      );
      return;
    }

    setMarkup(fatalScreen(messageFor(error)));
  }
}

// =============================================
// STUDENT PROFILE
// =============================================

async function saveProfile(form) {
  const raw = Object.fromEntries(new FormData(form));
  const github = normalizeGitHubAccount(
    raw.github_username
  );

  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(github)
  ) {
    throw new Error(
      'Enter a valid GitHub username or GitHub profile URL.'
    );
  }

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

  const destination = currentContext?.profile?.is_approved
    ? '/student'
    : '/pending';

  clearCachedState();

  if (path() !== destination) {
    go(destination);
  } else {
    await render({ force: true });
  }
}

// =============================================
// STUDENT FILTERS
// =============================================

function applyStudentFilters() {
  const keyword = (
    document.getElementById('student-search')?.value || ''
  ).trim().toLowerCase();

  const section =
    document.getElementById('student-section-filter')
      ?.value || '';

  const state =
    document.getElementById('student-approval-filter')
      ?.value || '';

  document.querySelectorAll('.student-row').forEach(
    (row) => {
      row.hidden = Boolean(
        (keyword && !row.dataset.search.includes(keyword)) ||
        (section && row.dataset.section !== section) ||
        (state && row.dataset.approvalState !== state)
      );
    }
  );
}

// =============================================
// CSV EXPORT
// =============================================

function downloadCsv(filename, csv) {
  const objectUrl = URL.createObjectURL(
    new Blob([csv], {
      type: 'text/csv;charset=utf-8',
    })
  );

  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = filename;

  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(
    () => URL.revokeObjectURL(objectUrl),
    1500
  );
}

// =============================================
// BUTTON EVENTS
// =============================================

async function handleClick(event) {
  if (
    event.target.closest('a[data-filter-pending]')
  ) {
    studentApprovalFocus = 'pending';

    if (path() === '/admin/students') {
      const approval = document.getElementById(
        'student-approval-filter'
      );

      if (approval) approval.value = 'pending';

      applyStudentFilters();
    }
  }

  if (event.target.closest('.admin-sidebar a')) {
    closeSidebar();
  }

  if (event.target.id === 'sidebar-backdrop') {
    closeSidebar();
    return;
  }

  if (
    event.target.closest('.global-search') &&
    window.matchMedia('(max-width: 650px)').matches
  ) {
    document.getElementById('global-search')?.focus();
  }

  const button = event.target.closest('button');

  if (!button || button.disabled) return;

  try {
    // SIDEBAR
    if (button.id === 'sidebar-toggle') {
      const root = document.querySelector(
        '.admin-app-shell'
      );

      root?.classList.add('sidebar-open');
      button.setAttribute('aria-expanded', 'true');

      document.getElementById('sidebar-close')?.focus();

    } else if (button.id === 'sidebar-close') {
      closeSidebar();
      document.getElementById('sidebar-toggle')?.focus();

    // CHART RANGE
    } else if (button.matches('[data-chart-range]')) {
      const nextRange = Number(button.dataset.chartRange);

      if (![7, 30, 90].includes(nextRange)) return;

      chartRange = nextRange;

      if (
        currentContext?.admin &&
        adminData &&
        path() === '/admin'
      ) {
        setMarkup(
          adminScreen(
            {
              ...currentContext,
              adminMeta: {
                pending: adminData.profiles.filter(
                  (p) => !p.is_approved
                ).length,
                warnings: adminData.schemaWarnings || [],
              },
            },
            adminData,
            chartRange
          )
        );

        document
          .querySelector(
            `[data-chart-range="${nextRange}"]`
          )
          ?.focus();
      }

    // GITHUB LOGIN
    } else if (button.id === 'github-login') {
      button.disabled = true;
      await loginWithGitHub();

    // LOGOUT
    } else if (button.id === 'logout-button') {
      button.disabled = true;
      await logout();

    // STUDENT ATTENDANCE
    } else if (
      button.matches('[data-attendance-checkin]')
    ) {
      button.disabled = true;

      try {
        await rpc('mark_my_attendance', {
          p_schedule_id: Number(button.dataset.scheduleId),
        });

        markStudentDataStale();
        await render({ force: true });
      } catch (error) {
        setError('attendance-message', error);
        button.disabled = false;
      }

    // OPEN / CLOSE CLASS
    } else if (button.matches('[data-window-action]')) {
      const opening =
        button.dataset.windowAction === 'open';

      const scheduleId = Number(
        button.dataset.scheduleId
      );

      if (
        !Number.isSafeInteger(scheduleId) ||
        scheduleId <= 0
      ) {
        throw new Error('Invalid class');
      }

      if (
        !window.confirm(
          `${opening ? 'Open' : 'Close'} attendance for this class?`
        )
      ) {
        return;
      }

      button.disabled = true;

      await rpc(
        opening
          ? 'open_class_attendance'
          : 'close_class_attendance',
        { p_schedule_id: scheduleId }
      );

      markAdminDataStale();
      await render({ force: true });

    // APPROVE / REVOKE STUDENT
    } else if (button.matches('[data-approval]')) {
      const value =
        button.dataset.approval === 'true';

      if (
        !window.confirm(
          `${value ? 'Approve' : 'Revoke approval for'} this student?`
        )
      ) {
        return;
      }

      button.disabled = true;

      await rpc('set_student_approval', {
        p_student_id: button.dataset.userId,
        p_approved: value,
      });

      markAdminDataStale();
      await render({ force: true });

    // EXPORT REPORT
    } else if (button.id === 'export-report') {
      if (!currentContext?.admin || !adminData) {
        throw new Error(
          'Administrator access required'
        );
      }

      const rows = buildMeetingReport(
        adminData,
        reportFilters
      );

      downloadCsv(
        `student-attendance-${reportFilters.date || 'today'}.csv`,
        toCsv(rows)
      );

    // REFRESH
    } else if (
      ['admin-refresh', 'refresh-status', 'retry-load']
        .includes(button.id)
    ) {
      await render({ force: true });
    }
  } catch (error) {
    if (button.id === 'github-login') {
      oauthError = messageFor(error);
      setMarkup(loginScreen(oauthError));
    } else {
      window.alert(messageFor(error));
      button.disabled = false;
    }
  }
}

// =============================================
// FORM SUBMISSION
// =============================================

async function handleSubmit(event) {
  const form = event.target;

  if (form?.id === 'global-search-form') {
    event.preventDefault();

    globalSearchTerm = (
      form.querySelector('#global-search')?.value || ''
    ).trim().slice(0, 120);

    studentApprovalFocus = '';

    if (path() === '/admin/students') {
      const search = document.getElementById(
        'student-search'
      );

      if (search) {
        search.value = globalSearchTerm;
        applyStudentFilters();
        search.focus();
      }
    } else {
      go('/admin/students');
    }

    return;
  }

  if (
    !form ||
    (
      form.id !== 'profile-form' &&
      !form.matches('.assignment-form')
    )
  ) {
    return;
  }

  event.preventDefault();

  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;

  try {
    if (form.id === 'profile-form') {
      await saveProfile(form);
    } else {
      const raw = Object.fromEntries(
        new FormData(form)
      );

      const userId = form.dataset.userId;
      const sectionId = Number(raw.section_id);
      const subjectId = Number(raw.subject_id);

      if (
        !Number.isSafeInteger(sectionId) ||
        !Number.isSafeInteger(subjectId) ||
        sectionId <= 0 ||
        subjectId <= 0
      ) {
        throw new Error(
          'Select a valid section and subject.'
        );
      }

      if (
        !window.confirm(
          'Change this student’s approved section and primary subject?'
        )
      ) {
        return;
      }

      await rpc(
        'admin_update_student_assignment',
        {
          p_student_id: userId,
          p_section_id: sectionId,
          p_subject_id: subjectId,
        }
      );

      markAdminDataStale();
      await render({ force: true });
    }
  } catch (error) {
    if (form.id === 'profile-form') {
      setError('form-message', error);
    } else {
      window.alert(messageFor(error));
    }
  } finally {
    submit.disabled = false;
  }
}

// =============================================
// INPUT AND FILTER EVENTS
// =============================================

function handleInput(event) {
  if (event.target?.id === 'student-search') {
    globalSearchTerm = event.target.value;
  }

  if (event.target?.id === 'student-approval-filter') {
    studentApprovalFocus = event.target.value;
  }

  if (
    event.target?.name === 'section_id' &&
    event.target.closest(
      '#profile-form, .assignment-form'
    )
  ) {
    syncSubjectOptions(
      event.target.closest('form')
    );
    return;
  }

  if (
    [
      'student-search',
      'student-section-filter',
      'student-approval-filter',
    ].includes(event.target?.id)
  ) {
    applyStudentFilters();
  }
}

function handleChange(event) {
  handleInput(event);

  const id = event.target?.id;

  if (id === 'report-date') {
    reportFilters.date =
      event.target.value || manilaClock().date;
  } else if (id === 'report-section') {
    reportFilters.sectionId = event.target.value;
  } else if (id === 'report-subject') {
    reportFilters.subjectId = event.target.value;
  } else {
    return;
  }

  // Reuses cached data; no full-screen loading.
  render();
}

// =============================================
// MOBILE SIDEBAR
// =============================================

function closeSidebar() {
  const root = document.querySelector(
    '.admin-app-shell'
  );

  root?.classList.remove('sidebar-open');

  document
    .getElementById('sidebar-toggle')
    ?.setAttribute('aria-expanded', 'false');
}

function handleGlobalKeys(event) {
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === 'k'
  ) {
    const search = document.getElementById(
      'global-search'
    );

    if (search) {
      event.preventDefault();
      search.focus();
      search.select();
    }
  }

  if (event.key === 'Escape') {
    closeSidebar();
  }
}

// =============================================
// OAUTH CALLBACK
// =============================================

function readCallbackError() {
  const url = new URL(
    window.location.href
  );

  oauthError =
    url.searchParams.get('error_description') ||
    url.searchParams.get('error') ||
    '';

  if (oauthError) {
    url.search = '';

    window.history.replaceState(
      {},
      '',
      url.pathname + url.hash
    );
  }
}

// =============================================
// APPLICATION INITIALIZATION
// =============================================

async function init() {
  readCallbackError();

  window.addEventListener('hashchange', render);

  document.addEventListener(
    'click',
    handleClick
  );

  document.addEventListener(
    'submit',
    handleSubmit
  );

  document.addEventListener(
    'input',
    handleInput
  );

  document.addEventListener(
    'change',
    handleChange
  );

  document.addEventListener(
    'keydown',
    handleGlobalKeys
  );

  if (configured) {
    startHeartbeat();

    supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          clearCachedState();
        }

        if (
          event === 'SIGNED_IN' &&
          currentContext?.user?.id !==
            session?.user?.id
        ) {
          clearCachedState();
        }

        if (
          event === 'SIGNED_IN' ||
          event === 'SIGNED_OUT'
        ) {
          window.setTimeout(
            () => render(),
            0
          );
        }
      }
    );
  }

  await render();

  if (
    configured &&
    window.location.search.includes('code=')
  ) {
    window.history.replaceState(
      {},
      '',
      window.location.pathname +
        window.location.hash
    );
  }
}

init().catch((error) => {
  setMarkup(
    fatalScreen(messageFor(error))
  );
});
