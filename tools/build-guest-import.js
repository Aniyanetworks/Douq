// Builds a GHL-ready contact import from the Toast Guestbook export.
//
//   node tools/build-guest-import.js [input.csv] [output.csv] [firstMugNumber]
//   defaults: guest-list.csv  ghl-import-guests.csv  1
//
// - merges guests that share an email or phone (GHL would merge them anyway, keeping one mug number)
// - phones -> +1XXXXXXXXXX, emails lower-case, card placeholder names ("Visa Cardholder") removed
// - every guest gets a 5-digit mug number, oldest first visit first (00001, 00002, ...)
// - tags: toast-guest (+ email-unsubscribed when the guest opted out of email)
// Output contains customer personal data: keep it out of git (*.csv is ignored).
const fs = require('fs');
const MUG_DIGITS = 5;
const path = require('path');

const [input = 'guest-list.csv', output = 'ghl-import-guests.csv', firstMug = '1'] = process.argv.slice(2);

// ---------- CSV ----------
const parseCsv = (text) => {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(v => v !== '')) rows.push(row); }
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.replace(/^﻿/, '').trim(), (r[i] ?? '').trim()])));
};
const toCsv = (rows, cols) => {
  const esc = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\r\n') + '\r\n';
};

// ---------- clean one guest ----------
const PLACEHOLDER = /^(visa|mastercard|master card|amex|american express|discover|card ?holder|cardholder|valued customer|customer|guest)$/i;
const cleanName = (s) => (PLACEHOLDER.test(String(s || '').trim()) ? '' : String(s || '').trim());
const cleanPhone = (s) => {
  const d = String(s || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (d.length === 10) return `+1${d}`;
  return '';
};
const cleanDate = (s) => (s && s !== 'null' ? s : '');
const num = (s) => (s !== '' && Number.isFinite(+s) ? +s : 0); // "NaN" / "null" -> 0

const guests = parseCsv(fs.readFileSync(input, 'utf8')).map((r) => ({
  email: String(r.email1 || '').toLowerCase(),
  phone: cleanPhone(r.phone1),
  firstName: cleanName(r.firstName),
  lastName: cleanName(r.lastName),
  unsubscribed: /UNSUB/i.test(r.email1MarketingPreference || ''),
  firstVisit: cleanDate(r.firstVisitDate),
  lastVisit: cleanDate(r.lastVisitDate),
  visits: num(r.totalVisits),
  lifetimeSpend: num(r.lifetimeSpend),
  averageSpend: num(r.averageSpend),
  averageTip: num(r.averageTip),
  averageTipPercentage: num(r.averageTipPercentage),
  lastDiningBehavior: r.lastDiningBehavior || '',
  diningBehaviors: r.diningBehaviors || '',
  marketingPreference: r.email1MarketingPreference || '',
  guestGuid: r.guestGuid || '',
}));

// ---------- merge guests sharing an email or phone (union-find) ----------
const parent = guests.map((_, i) => i);
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
const firstByKey = new Map();
guests.forEach((g, i) => {
  for (const key of [g.email && `e:${g.email}`, g.phone && `p:${g.phone}`].filter(Boolean)) {
    if (firstByKey.has(key)) parent[find(i)] = find(firstByKey.get(key));
    else firstByKey.set(key, i);
  }
});
const groups = new Map();
guests.forEach((g, i) => {
  const root = find(i);
  if (!groups.has(root)) groups.set(root, []);
  groups.get(root).push(g);
});

const round2 = (n) => Math.round(n * 100) / 100;
const weighted = (list, k) => {
  const visits = list.reduce((s, g) => s + g.visits, 0);
  return round2(visits ? list.reduce((s, g) => s + g[k] * g.visits, 0) / visits : Math.max(...list.map(g => g[k])));
};
const earliest = (list) => list.filter(Boolean).sort()[0] || '';
const latest = (list) => list.filter(Boolean).sort().at(-1) || '';
const merged = [...groups.values()].map((list) => {
  const main = [...list].sort((a, b) => b.visits - a.visits)[0]; // most visits wins for name / ids
  const pick = (k) => main[k] || list.map(g => g[k]).find(Boolean) || '';
  return {
    email: pick('email'),
    phone: pick('phone'),
    firstName: main.firstName || main.lastName ? main.firstName : pick('firstName'),
    lastName: main.firstName || main.lastName ? main.lastName : pick('lastName'),
    unsubscribed: list.some(g => g.unsubscribed),
    firstVisit: earliest(list.map(g => g.firstVisit)),
    lastVisit: latest(list.map(g => g.lastVisit)),
    visits: list.reduce((s, g) => s + g.visits, 0),
    lifetimeSpend: round2(list.reduce((s, g) => s + g.lifetimeSpend, 0)),
    // averages of merged guests are weighted by their visits
    averageSpend: weighted(list, 'averageSpend'),
    averageTip: weighted(list, 'averageTip'),
    averageTipPercentage: weighted(list, 'averageTipPercentage'),
    lastDiningBehavior: [...list].sort((a, b) => b.lastVisit.localeCompare(a.lastVisit))[0].lastDiningBehavior || pick('lastDiningBehavior'),
    diningBehaviors: [...new Set(list.flatMap(g => g.diningBehaviors.split(/[;,|]/).map(s => s.trim())).filter(Boolean))].join(', '),
    marketingPreference: list.some(g => g.unsubscribed) ? 'UNSUBSCRIBED' : pick('marketingPreference'),
    guestGuid: main.guestGuid,
    mergedFrom: list.length,
  };
});

// ---------- mug numbers: oldest first visit first, never-visited last ----------
merged.sort((a, b) =>
  (a.firstVisit ? 0 : 1) - (b.firstVisit ? 0 : 1) ||
  a.firstVisit.localeCompare(b.firstVisit) ||
  b.visits - a.visits ||
  a.guestGuid.localeCompare(b.guestGuid));
let next = parseInt(firstMug, 10);
const rows = merged.map((g) => ({
  'First Name': g.firstName,
  'Last Name': g.lastName,
  'Email': g.email,
  'Phone': g.phone,
  'Mug Number': String(next++).padStart(MUG_DIGITS, '0'),
  'Toast Customer ID': g.guestGuid,
  'Tags': ['toast-guest', g.unsubscribed && 'email-unsubscribed'].filter(Boolean).join(','),
  'Toast First Visit': g.firstVisit.slice(0, 10),
  'Toast Last Visit': g.lastVisit.slice(0, 10),
  'Toast Visits': g.visits,
  'Toast Lifetime Spend': g.lifetimeSpend,
  'Toast Average Spend': g.averageSpend,
  'Toast Average Tip': g.averageTip,
  'Toast Average Tip %': g.averageTipPercentage,
  'Toast Last Dining Behavior': g.lastDiningBehavior,
  'Toast Dining Behaviors': g.diningBehaviors,
  'Toast Email Marketing': g.marketingPreference,
}));

const cols = Object.keys(rows[0]);
fs.writeFileSync(output, toCsv(rows, cols));

// ---------- report ----------
const merges = merged.filter(g => g.mergedFrom > 1);
console.log(`input guests       ${guests.length}`);
console.log(`contacts to import ${rows.length}  (${guests.length - rows.length} duplicates merged into ${merges.length} contacts)`);
console.log(`mug numbers        ${rows[0]['Mug Number']} – ${rows.at(-1)['Mug Number']}`);
console.log(`with email ${rows.filter(r => r.Email).length} | with phone ${rows.filter(r => r.Phone).length} | no name ${rows.filter(r => !r['First Name'] && !r['Last Name']).length} | email-unsubscribed ${rows.filter(r => r.Tags.includes('unsub')).length}`);
console.log(`written            ${path.resolve(output)}`);
