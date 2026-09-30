import { useCallback, useEffect, useMemo, useState } from 'react';
import { getReminders, AuthError } from './api.js';
import { dateTime, todayYmd } from './format.js';
import { LogRowsSkeleton } from './Skeleton.jsx';
import { kindTone } from './MemberReminders.jsx';

const firstOfMonth = () => `${todayYmd().slice(0, 8)}01`;

const toCsv = (rows) => {
  const cols = ['sentAt', 'day', 'mug', 'member', 'kind', 'unusedPerks', 'expiresOn'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
};

// Unused-perk reminders sent to members (GHL "Reminder Log"), kept apart from the perk log.
export default function Reminders({ pin, onAuthError }) {
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(todayYmd);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getReminders(pin, from, to);
      setRows(res.reminders || []);
      setError('');
    } catch (err) {
      if (err instanceof AuthError) return onAuthError();
      setError(`Couldn't load reminders (${err.message}).`);
    } finally {
      setLoading(false);
    }
  }, [pin, from, to, onAuthError]);

  useEffect(() => { load(); }, [load]);

  const kinds = useMemo(() => [...new Set((rows || []).map((r) => r.kind).filter(Boolean))].sort(), [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows || []).filter((r) =>
      (kind === 'all' || r.kind === kind) &&
      (!q || String(r.mug).includes(q) || String(r.member).toLowerCase().includes(q)),
    );
  }, [rows, kind, query]);

  const summary = useMemo(() => {
    const byKind = {};
    for (const r of shown) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
    return { total: shown.length, members: new Set(shown.map((r) => r.mug)).size, byKind };
  }, [shown]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(shown)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reminders_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section>
      <div className="filters">
        <label>From <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        <label>Type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All</option>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <input className="search small" type="search" placeholder="Mug or name" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        <button onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
      </div>

      {error && <p className="error">{error}</p>}

      {!rows && !error && <LogRowsSkeleton />}

      {rows && (
        <div className="summary">
          <div className="stat"><b>{summary.total}</b><span>Reminders sent</span></div>
          <div className="stat"><b>{summary.members}</b><span>Members reminded</span></div>
          {Object.entries(summary.byKind).map(([k, n]) => (
            <div key={k} className="stat"><b>{n}</b><span>{k}</span></div>
          ))}
        </div>
      )}

      {rows && shown.length === 0 && <div className="empty">No reminders sent for these filters.</div>}

      {shown.length > 0 && (
        <div className={loading ? 'table-wrap refreshing' : 'table-wrap'}>
          <table>
            <thead>
              <tr><th>Sent</th><th>Mug</th><th>Member</th><th>Type</th><th>Unused perks</th><th>Use by</th></tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={`${r.mug}-${r.sentAt}-${i}`}>
                  <td className="nowrap">{dateTime(r.sentAt)}</td>
                  <td>{r.mug ? `#${r.mug}` : '–'}</td>
                  <td>{r.member || '–'}</td>
                  <td><span className={`badge ${kindTone(r.kind)}`}>{r.kind || 'Reminder'}</span></td>
                  <td className="detail">{r.unusedPerks}</td>
                  <td className="nowrap">{r.expiresOn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
