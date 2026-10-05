// Talks to the "Bartender Site API" n8n workflow. Without VITE_API_URL the site runs on demo data.
const API_URL = import.meta.env.VITE_API_URL || '';
export const DEMO = !API_URL;

export class AuthError extends Error {}

async function call(action, pin, extra = {}) {
  if (DEMO) return demo(action, pin, extra);
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, pin, ...extra }),
  });
  if (res.status === 401) throw new AuthError('Wrong PIN');
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.json();
}

// ---------- browser cache ----------
// Last answer per request, shown instantly on tab switches and page reloads while a fresh copy loads.
// Kept in memory and in localStorage; "Lock" clears it so member data does not stay on a shared tablet.
const CACHE_PREFIX = 'mugclub-cache:';
const memory = new Map();

export const cacheKey = {
  members: () => 'members',
  log: (from, to) => `log:${from}:${to}`,
  reminders: (from, to) => `reminders:${from}:${to}`,
};

export function readCache(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_PREFIX + key));
    if (saved) memory.set(key, saved);
    return saved || null;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  const entry = { at: Date.now(), data };
  memory.set(key, entry);
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // storage full or blocked: the in-memory copy still works for tab switches
  }
  return data;
}

export function clearCache() {
  memory.clear();
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch {
    // storage blocked: nothing saved
  }
}

export const getMembers = async (pin) => writeCache(cacheKey.members(), await call('members', pin));
export const getLog = async (pin, from, to) => writeCache(cacheKey.log(from, to), await call('log', pin, { from, to }));
export const MUG_STATUSES = ['Requested', 'Ordered', 'Received', 'Delivered', 'Cancelled'];

// Sets one member's mug status, then patches the cached member list so every screen shows it at once
export async function setMugStatus(pin, member, status) {
  await call('mug-status', pin, { contactId: member.id, status });
  const key = cacheKey.members();
  const cached = readCache(key);
  if (cached?.data?.members) {
    writeCache(key, { ...cached.data, members: cached.data.members.map((m) => (m.id === member.id ? { ...m, mugStatus: status } : m)) });
  }
}

export const getReminders = async (pin, from, to) => writeCache(cacheKey.reminders(from, to), await call('reminders', pin, { from, to }));

// ---------- demo data ----------
const DEMO_PIN = '1234';
const demoStatus = { d001: 'Delivered', d002: 'Received', d014: 'Ordered' };
const perks = (used) => [
  { key: 'free_pour', label: 'Free Monthly Pour', used: used.includes('free_pour'), date: used.includes('free_pour') ? '2026-09-12' : '' },
  { key: 'four_pack', label: '50% off 4-Pack', used: used.includes('four_pack'), date: used.includes('four_pack') ? '2026-09-20' : '' },
  { key: 'merch', label: 'Merchandise 10%', used: used.includes('merch'), date: used.includes('merch') ? '2026-09-05' : '' },
  { key: 'mug', label: 'Special Mug Pricing', used: used.includes('mug'), date: used.includes('mug') ? '2026-09-27' : '' },
];

async function demo(action, pin, { from, to, contactId, status }) {
  await new Promise((r) => setTimeout(r, 300));
  if (pin !== DEMO_PIN) throw new AuthError('Wrong PIN');
  if (action === 'mug-status') {
    demoStatus[contactId] = status;
    return { ok: true, status };
  }
  if (action === 'members') {
    return {
      period: '2026-09',
      updatedAt: new Date().toISOString(),
      members: [
        { id: 'd001', mug: '001', name: 'Test User', phone: '+14375293053', email: 'test.user01@mail.com', perks: perks(['free_pour', 'four_pack', 'merch', 'mug']), initialPour: '2026-09-28' },
        { id: 'd002', mug: '002', name: 'Jane Smith', phone: '+13035550102', email: 'jane@example.com', perks: perks(['free_pour']), initialPour: '2026-09-02' },
        { id: 'd014', mug: '014', name: 'Carlos Rivera', phone: '+13035550114', email: 'carlos@example.com', perks: perks([]), initialPour: '' },
        { id: 'd037', mug: '037', name: 'Doug Reed', phone: '+13035550137', email: 'doug@example.com', perks: perks(['four_pack', 'mug']), initialPour: '2026-08-15' },
      ].map((m) => ({ ...m, mugStatus: demoStatus[m.id] || '' })),
    };
  }
  if (action === 'reminders') {
    const reminders = [
      { sentAt: '2026-09-27T16:00:00Z', day: '2026-09-27', mug: '014', member: 'Carlos Rivera', kind: 'Last-chance reminder', unusedPerks: 'Free Monthly Pour, 50% off a 4-Pack, 10% off merchandise and 24oz beer at the 16oz price', expiresOn: 'Sep 30' },
      { sentAt: '2026-09-27T16:00:00Z', day: '2026-09-27', mug: '002', member: 'Jane Smith', kind: 'Last-chance reminder', unusedPerks: '50% off a 4-Pack, 10% off merchandise and 24oz beer at the 16oz price', expiresOn: 'Sep 30' },
      { sentAt: '2026-09-20T16:00:00Z', day: '2026-09-20', mug: '014', member: 'Carlos Rivera', kind: 'Reminder', unusedPerks: 'Free Monthly Pour, 50% off a 4-Pack, 10% off merchandise and 24oz beer at the 16oz price', expiresOn: 'Sep 30' },
      { sentAt: '2026-09-20T16:00:00Z', day: '2026-09-20', mug: '037', member: 'Doug Reed', kind: 'Reminder', unusedPerks: 'Free Monthly Pour and 10% off merchandise', expiresOn: 'Sep 30' },
    ].filter((r) => (!from || r.day >= from) && (!to || r.day <= to));
    return { from, to, reminders };
  }
  const log = [
    { loggedAt: '2026-09-29T17:25:00Z', businessDay: '2026-09-29', mug: '001', member: 'Test User', perk: 'Initial Member Pour', event: 'redeem', orderId: 'test-order-0010', checkNumber: '99', detail: 'Initial Member Pour redeemed – check #99' },
    { loggedAt: '2026-09-29T17:18:00Z', businessDay: '2026-09-29', mug: '001', member: 'Test User', perk: 'Merchandise 10%', event: 'double', orderId: 'test-order-0007', checkNumber: '99', detail: 'Test User (mug 001) already used Merch 10% for 2026-09' },
    { loggedAt: '2026-09-28T22:10:00Z', businessDay: '2026-09-28', mug: '999', member: '', perk: 'Free Monthly Pour', event: 'no_member', orderId: 'test-order-0011', checkNumber: '104', detail: 'No member found with mug number 999' },
    { loggedAt: '2026-09-28T21:02:00Z', businessDay: '2026-09-28', mug: '002', member: 'Jane Smith', perk: 'Free Monthly Pour', event: 'redeem', orderId: 'ord-1', checkNumber: '88', detail: 'Free Monthly Pour redeemed – period 2026-09' },
    { loggedAt: '2026-09-27T19:40:00Z', businessDay: '2026-09-27', mug: '037', member: 'Doug Reed', perk: 'Special Mug Pricing', event: 'redeem', orderId: 'ord-2', checkNumber: '61', detail: 'Mug pricing redeemed – period 2026-09' },
    { loggedAt: '2026-09-20T18:12:00Z', businessDay: '2026-09-20', mug: '037', member: 'Doug Reed', perk: '50% off 4-Pack', event: 'redeem', orderId: 'ord-3', checkNumber: '40', detail: '50% off 4-Pack redeemed – period 2026-09' },
    { loggedAt: '2026-09-19T23:30:00Z', businessDay: '2026-09-19', mug: '', member: '', perk: 'Free Monthly Pour', event: 'no_mug', orderId: 'ord-4', checkNumber: '33', detail: 'Benefit rung up WITHOUT a mug number in the tab name' },
    { loggedAt: '2026-09-12T20:05:00Z', businessDay: '2026-09-12', mug: '002', member: 'Jane Smith', perk: 'Free Monthly Pour', event: 'void', orderId: 'ord-0', checkNumber: '21', detail: 'Free Monthly Pour REVERTED (voided in Toast)' },
  ].filter((r) => (!from || r.businessDay >= from) && (!to || r.businessDay <= to));
  return { from, to, log };
}
