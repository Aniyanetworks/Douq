import { useCallback, useEffect, useMemo, useState } from 'react';
import { getLog, AuthError, readCache, cacheKey } from './api.js';
import { dateTime, eventInfo, isAlert, todayYmd, EVENTS } from './format.js';
import { LogRowsSkeleton } from './Skeleton.jsx';
import MemberLog from './MemberLog.jsx';

const firstOfMonth = () => `${todayYmd().slice(0, 8)}01`;

const toCsv = (rows) => {
  const cols = ['loggedAt', 'businessDay', 'mug', 'member', 'perk', 'event', 'checkNumber', 'orderId', 'detail'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
};

export default function Log({ pin, onAuthError }) {
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(todayYmd);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [event, setEvent] = useState('all');
  const [perk, setPerk] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const closeLog = useCallback(() => setSelected(null), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLog(pin, from, to);
      setRows(res.log || []);
      setError('');
    } catch (err) {
      if (err instanceof AuthError) return onAuthError();
      setError(`Couldn't load the log (${err.message}).`);
    } finally {
      setLoading(false);
    }
  }, [pin, from, to, onAuthError]);

  // Show the cached log for these dates at once, then refresh it
  useEffect(() => {
    const cached = readCache(cacheKey.log(from, to));
    setRows(cached ? cached.data.log || [] : null);
    load();
  }, [load, from, to]);

  const perks = useMemo(() => [...new Set((rows || []).map((r) => r.perk).filter(Boolean))].sort(), [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows || []).filter((r) =>
      (event === 'all' || (event === 'alerts' ? isAlert(r.event) : r.event === event)) &&
      (perk === 'all' || r.perk === perk) &&
      (!q || String(r.mug).includes(q) || String(r.member).toLowerCase().includes(q)),
    );
  }, [rows, event, perk, query]);

  const summary = useMemo(() => {
    const redeemed = {};
    let alerts = 0;
    let voids = 0;
    for (const r of shown) {
      if (r.event === 'redeem' || r.event === 'used') redeemed[r.perk] = (redeemed[r.perk] || 0) + 1;
      else if (r.event === 'void') voids++;
      else alerts++;
    }
    return { redeemed, alerts, voids };
  }, [shown]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(shown)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `perk-log_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section>
      {loading && <div className="progress" role="progressbar" aria-label="Loading" />}
      <div className="filters">
        <label>From <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        <label>Event
          <select value={event} onChange={(e) => setEvent(e.target.value)}>
            <option value="all">All</option>
            <option value="alerts">Alerts only</option>
            {Object.entries(EVENTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label>Perk
          <select value={perk} onChange={(e) => setPerk(e.target.value)}>
            <option value="all">All</option>
            {perks.map((p) => <option key={p} value={p}>{p}</option>)}
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
          {Object.entries(summary.redeemed).map(([p, n]) => (
            <div key={p} className="stat"><b>{n}</b><span>{p}</span></div>
          ))}
          <div className="stat"><b>{summary.voids}</b><span>Voided</span></div>
          <div className={summary.alerts ? 'stat alert' : 'stat'}><b>{summary.alerts}</b><span>Alerts</span></div>
        </div>
      )}

      {rows && shown.length === 0 && <div className="empty">Nothing logged for these filters.</div>}

      {shown.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Time</th><th>Mug</th><th>Member</th><th>Perk</th><th>Event</th><th>Check</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const ev = eventInfo(r.event);
                return (
                  <tr key={`${r.orderId}-${r.loggedAt}-${i}`}>
                    <td className="nowrap">{dateTime(r.loggedAt)}</td>
                    <td>{r.mug ? `#${r.mug}` : '–'}</td>
                    <td>
                      {r.mug ? (
                        <button className="link" onClick={() => setSelected({ mug: r.mug, name: r.member })}>
                          {r.member || `Mug #${r.mug}`}
                        </button>
                      ) : (r.member || '–')}
                    </td>
                    <td>{r.perk}</td>
                    <td><span className={`badge ${ev.tone}`}>{ev.label}</span></td>
                    <td>{r.checkNumber ? `#${r.checkNumber}` : ''}</td>
                    <td className="detail" title={r.detail}>{r.detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && <MemberLog pin={pin} member={selected} onClose={closeLog} onAuthError={onAuthError} />}
    </section>
  );
}
