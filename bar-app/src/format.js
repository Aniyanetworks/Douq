// Display helpers shared by the pages.
const TZ = 'America/Denver';

// "2026-09-28" -> "Sep 28" (date-only strings are not shifted by time zone)
export const shortDay = (ymd) =>
  ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';

// "2026-09" -> "September 2026"
export const monthName = (ym) =>
  ym ? new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

// ISO time -> "Sep 28, 3:10 PM" in brewery time
export const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ }) : '';

export const clock = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }) : '';

// Today in brewery time as YYYY-MM-DD
export const todayYmd = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

export const EVENTS = {
  redeem: { label: 'Redeemed', tone: 'good' },
  used: { label: 'Used', tone: 'good' },
  void: { label: 'Voided', tone: 'neutral' },
  double: { label: 'Double use', tone: 'bad' },
  no_member: { label: 'Unknown mug', tone: 'warn' },
  no_mug: { label: 'No mug on tab', tone: 'warn' },
  duplicate_mug: { label: 'Duplicate mug', tone: 'warn' },
};
export const eventInfo = (e) => EVENTS[e] || { label: e || 'Alert', tone: 'warn' };
export const isAlert = (e) => !['redeem', 'used', 'void'].includes(e);

// ---- helpers for one member's history (shared with the other app)
export const sameMug = (a, b) => String(a).replace(/^0+/, '') === String(b).replace(/^0+/, '');

// First day of the month `back` months ago, as YYYY-MM-DD
const monthStart = (back) => {
  const [y, m] = todayYmd().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 - back, 1)).toISOString().slice(0, 10);
};
export const RANGES = [
  { key: 'month', label: 'This month', from: () => monthStart(0) },
  { key: '3m', label: '3 months', from: () => monthStart(2) },
  { key: 'all', label: 'All', from: () => '' },
];
export const rangeFrom = (key) => RANGES.find((r) => r.key === key).from();
