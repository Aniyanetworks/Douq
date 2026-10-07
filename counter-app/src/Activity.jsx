import { useCallback, useEffect, useMemo, useState } from 'react';
import { withRetry, getLog, AuthError, readCache, cacheKey } from '../../bar-app/src/api.js';
import { dateTime, eventInfo, isAlert, todayYmd, EVENTS } from '../../bar-app/src/format.js';

const firstOfMonth = () => `${todayYmd().slice(0, 8)}01`;

const toCsv = (rows) => {
  const cols = ['loggedAt', 'businessDay', 'mug', 'member', 'perk', 'event', 'checkNumber', 'orderId', 'detail'];
  const esc = (v) => `"${String(v ?? '').replace(/^[=+@-]/, "'").replace(/"/g, '""')}"`; // a leading = + @ - would run as a formula in Excel
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
};

// Perk log: redemptions, voids and alerts for a date range, with filters, totals and CSV export.
export default function Activity({ pin, onAuthError, onOpenMember }) {
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(todayYmd);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [event, setEvent] = useState('all');
  const [perk, setPerk] = useState('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async (fresh = false) => { // opening the tab reuses an answer under 30 seconds old; Refresh always asks again
    setLoading(true);
    try {
      const res = await withRetry(() => getLog(pin, from, to, { maxAge: fresh ? 0 : 30_000 }));
      setRows(res.log || []);
      setError('');
    } catch (err) {
      if (err instanceof AuthError) return onAuthError();
      setError("Couldn't reach the server right now. Try Refresh in a moment.");
    } finally {
      setLoading(false);
    }
  }, [pin, from, to, onAuthError]);

  // The cached log for these dates shows at once, then a fresh copy loads
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCsv(shown)], { type: 'text/csv' }));
    a.download = `perk-log_${from}_to_${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <section className="panel">
      <div className="row">
        <h2>Benefit activity</h2>
        <button className="secondary" onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
      </div>

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
        <label>Search
          <input type="search" placeholder="Mug or name" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button className="secondary" onClick={() => load(true)} disabled={loading}>{loading ? <>Loading…<span className="spinner" /></> : 'Refresh'}</button>
      </div>

      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="muted">Loading…<span className="spinner" /></p>}

      {rows && (
        <>
          <div className="summary">
            <div className="mini"><strong>{Object.values(summary.redeemed).reduce((a, b) => a + b, 0)}</strong><span className="label">Perks used</span></div>
            <div className="mini"><strong>{summary.voids}</strong><span className="label">Voided</span></div>
            <div className={summary.alerts ? 'mini alert' : 'mini'}><strong>{summary.alerts}</strong><span className="label">Alerts</span></div>
          </div>
          {Object.keys(summary.redeemed).length > 0 && (
            <div className="chips">
              <span className="label">By perk</span>
              {Object.entries(summary.redeemed).map(([p, n]) => <span key={p} className="chip"><b>{n}</b> {p}</span>)}
            </div>
          )}
        </>
      )}

      {rows && shown.length === 0 && <p className="muted">Nothing logged for these filters.</p>}

      {shown.length > 0 && (
        <div className="table-scroll">
          <table className="log-table">
            <thead>
              <tr><th>Member / perk</th><th>Recorded</th><th>Check</th><th>Status</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const ev = eventInfo(r.event);
                return (
                  <tr key={`${r.orderId}-${r.loggedAt}-${i}`}>
                    <td>
                      {r.mug
                        ? <button className="link" onClick={() => onOpenMember(r.mug)}>{r.member || `Mug #${r.mug}`}</button>
                        : (r.member || '–')}
                      {r.mug && <span className="label"> #{r.mug}</span>}
                      <br />
                      <span className="label">{r.perk}</span>
                    </td>
                    <td className="nowrap">{dateTime(r.loggedAt)}</td>
                    <td>{r.checkNumber ? `#${r.checkNumber}` : ''}</td>
                    <td><span className={`badge ${ev.tone}`}>{ev.label}</span></td>
                    <td className="detail" title={r.detail}>{isAlert(r.event) ? r.detail : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
