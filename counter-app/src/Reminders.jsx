import { useCallback, useEffect, useMemo, useState } from 'react';
import { withRetry, getReminders, AuthError, readCache, cacheKey } from '../../bar-app/src/api.js';
import { dateTime, todayYmd } from '../../bar-app/src/format.js';

const firstOfMonth = () => `${todayYmd().slice(0, 8)}01`;

const toCsv = (rows) => {
  const cols = ['sentAt', 'day', 'mug', 'member', 'kind', 'unusedPerks', 'expiresOn'];
  const esc = (v) => `"${String(v ?? '').replace(/^[=+@-]/, "'").replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
};

// Unused-perk reminders sent to members (GHL "Reminder Log"), kept apart from the perk activity.
export default function Reminders({ pin, onAuthError, onOpenMember }) {
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(todayYmd);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async (fresh = false) => { // opening the tab reuses an answer under 30 seconds old; Refresh always asks again
    setLoading(true);
    try {
      const res = await withRetry(() => getReminders(pin, from, to, { maxAge: fresh ? 0 : 30_000 }));
      setRows(res.reminders || []);
      setError('');
    } catch (err) {
      if (err instanceof AuthError) return onAuthError();
      setError("Couldn't reach the server right now. Try Refresh in a moment.");
    } finally {
      setLoading(false);
    }
  }, [pin, from, to, onAuthError]);

  useEffect(() => {
    const cached = readCache(cacheKey.reminders(from, to));
    setRows(cached ? cached.data.reminders || [] : null);
    load();
  }, [load, from, to]);

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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCsv(shown)], { type: 'text/csv' }));
    a.download = `reminders_${from}_to_${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <section className="panel">
      <div className="row">
        <h2>Reminders sent</h2>
        <button className="secondary" onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
      </div>

      <div className="filters">
        <label>From <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        <label>Type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All</option>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label>Search
          <input type="search" placeholder="Mug or name" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button className="secondary" onClick={() => load(true)} disabled={loading}>{loading ? <>Loading…<span className="spinner" /></> : 'Refresh'}</button>
      </div>

      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="muted">Loading…<span className="spinner" /></p>}

      {rows && (
        <>
          <div className="summary two">
            <div className="mini"><strong>{summary.total}</strong><span className="label">Reminders sent</span></div>
            <div className="mini"><strong>{summary.members}</strong><span className="label">Members reminded</span></div>
          </div>
          {Object.keys(summary.byKind).length > 0 && (
            <div className="chips">
              <span className="label">By type</span>
              {Object.entries(summary.byKind).map(([k, n]) => <span key={k} className="chip"><b>{n}</b> {k}</span>)}
            </div>
          )}
        </>
      )}

      {rows && shown.length === 0 && <p className="muted">No reminders sent for these filters.</p>}

      {shown.length > 0 && (
        <div className="table-scroll">
          <table className="log-table">
            <thead>
              <tr><th>Member</th><th>Sent</th><th>Type</th><th>Unused perks</th><th>Use by</th></tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={`${r.mug}-${r.sentAt}-${i}`}>
                  <td>
                    {r.mug
                      ? <button className="link" onClick={() => onOpenMember(r.mug)}>{r.member || `Mug #${r.mug}`}</button>
                      : (r.member || '–')}
                    {r.mug && <span className="label"> #{r.mug}</span>}
                  </td>
                  <td className="nowrap">{dateTime(r.sentAt)}</td>
                  <td>{r.kind || 'Reminder'}</td>
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
