export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export function manilaDate() {
  // Attendance is dated in Asia/Manila by the database; this is display-only.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = (key) => parts.find((part) => part.type === key)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function readableTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(value));
}

export function formError(message) {
  return `<div role="alert" class="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">${escapeHtml(message)}</div>`;
}

export function normalizeGitHubAccount(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/?$/i);
  return (match ? match[1] : raw.replace(/^@/, '')).toLowerCase();
}
