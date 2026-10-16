import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { withRetry, getLog, AuthError, readCache, cacheKey, UNLIMITED_PERKS } from '../../bar-app/src/api.js';
import { todayYmd, shortDay } from '../../bar-app/src/format.js';

const firstOfMonth = () => `${todayYmd().slice(0, 8)}01`;

// Fixed order, one colour per perk (validated palette: blue, orange, aqua, yellow)
const SERIES = [
  { key: 'free_pour', name: 'Free pour', perk: 'Free Monthly Pour', note: 'Once a month', color: 'var(--series-1)' },
  { key: 'four_pack', name: '4-Pack 50%', perk: '50% off 4-Pack', note: 'Once a month', color: 'var(--series-2)' },
  { key: 'mug', name: 'Mug pricing', perk: UNLIMITED_PERKS.find((u) => u.key === 'mug').label, note: 'Unlimited', color: 'var(--series-3)' },
  { key: 'merch', name: 'Merch 10%', perk: UNLIMITED_PERKS.find((u) => u.key === 'merch').label, note: 'Unlimited', color: 'var(--series-4)' },
];

const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const span = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });

// One bar per day, or per month when the range is longer than about two months
function buildBuckets(from, to, rows, groupBy) {
  const monthly = groupBy === 'month' || (groupBy === 'auto' && span(from, to) > 62);
  const keyOf = (ymd) => (monthly ? ymd.slice(0, 7) : ymd);
  const keys = [];
  if (monthly) {
    let [y, m] = from.slice(0, 7).split('-').map(Number);
    const last = to.slice(0, 7);
    for (;;) {
      const k = `${y}-${String(m).padStart(2, '0')}`;
      keys.push(k);
      if (k >= last) break;
      if (++m > 12) { m = 1; y++; }
    }
  } else {
    for (let d = from; d <= to; d = addDays(d, 1)) keys.push(d);
  }
  const buckets = keys.map((k) => ({ key: k, label: monthly ? monthLabel(k) : shortDay(k), counts: { free_pour: 0, four_pack: 0, mug: 0, merch: 0 } }));
  const at = new Map(buckets.map((b) => [b.key, b]));
  const perKey = new Map(SERIES.map((s) => [s.perk, s.key]));
  for (const r of rows) {
    const s = perKey.get(r.perk);
    const b = at.get(keyOf(String(r.businessDay).slice(0, 10)));
    if (!s || !b) continue;
    if (r.event === 'redeem' || r.event === 'used') b.counts[s] += 1;
    else if (r.event === 'void') b.counts[s] -= 1; // a voided check takes its use back
  }
  for (const b of buckets) for (const s of SERIES) b.counts[s.key] = Math.max(0, b.counts[s.key]);
  return { buckets, monthly };
}

// Totals for the perks that are switched on
const withTotals = (buckets, series) => buckets.map((b) => ({ ...b, total: series.reduce((n, s) => n + b.counts[s.key], 0) }));

const niceTicks = (max) => {
  const raw = Math.max(max, 1) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)); // counts are whole numbers
  const top = Math.ceil(Math.max(max, 1) / step) * step;
  return { step, top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
};

// Bar with its top corners rounded (the data end); the base stays square on the axis
const topRounded = (x, y, w, h, r) => {
  const k = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + k}Q${x},${y} ${x + k},${y}H${x + w - k}Q${x + w},${y} ${x + w},${y + k}V${y + h}Z`;
};

const M = { l: 30, r: 6, t: 10, b: 28 };

function StackedBars({ buckets, monthly, series }) {
  const [hover, setHover] = useState(null);
  // the chart is drawn at the width it is shown at, so text and bars keep their real size on a phone
  const wrap = useRef(null);
  const [W, setW] = useState(760);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const measure = () => setW(Math.max(260, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 210 : 270;
  const plotW = W - M.l - M.r, plotH = H - M.t - M.b;
  const { top, ticks } = useMemo(() => niceTicks(Math.max(...buckets.map((b) => b.total))), [buckets]);
  const slot = plotW / buckets.length;
  const bw = Math.max(3, Math.min(30, slot * 0.7));
  const every = Math.ceil(buckets.length / Math.max(2, Math.floor(plotW / 56))); // about one label per 56px
  const y = (v) => M.t + plotH - (v / top) * plotH;

  return (
    <div className="chart-wrap" ref={wrap} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Benefit uses per ${monthly ? 'month' : 'day'}, stacked by perk. A table view is available.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
            <text x={M.l - 8} y={y(t) + 4} textAnchor="end" className="tick">{t}</text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const cx = M.l + slot * i + slot / 2;
          const x = cx - bw / 2;
          let cum = 0;
          const present = series.filter((s) => b.counts[s.key] > 0);
          const topKey = present.length ? present[present.length - 1].key : null;
          return (
            <g key={b.key}>
              {series.map((s) => {
                const v = b.counts[s.key];
                if (!v) return null;
                const y0 = y(cum), y1 = y(cum + v);
                cum += v;
                const gap = cum - v > 0 ? 2 : 0; // 2px of surface between stacked fills
                const h = Math.max(1, y0 - y1 - gap);
                return s.key === topKey
                  ? <path key={s.key} d={topRounded(x, y1, bw, h, 4)} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.55} />
                  : <rect key={s.key} x={x} y={y1} width={bw} height={h} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.55} />;
              })}
              {i % every === 0 && <text x={cx} y={H - 10} textAnchor="middle" className="tick">{b.label}</text>}
              <rect x={M.l + slot * i} y={M.t} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} onFocus={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: `${Math.min(86, Math.max(14, ((M.l + slot * hover + slot / 2) / W) * 100))}%` }} role="status">
          <b>{buckets[hover].label}</b>
          {series.map((s) => (
            <span key={s.key} className="tip-row"><i style={{ background: s.color }} />{s.name}<em>{buckets[hover].counts[s.key]}</em></span>
          ))}
          <span className="tip-row total">Total<em>{buckets[hover].total}</em></span>
        </div>
      )}
    </div>
  );
}

function Table({ buckets, series }) {
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>{buckets.length && buckets[0].key.length === 7 ? 'Month' : 'Day'}</th>{series.map((s) => <th key={s.key}>{s.name}</th>)}<th>Total</th></tr></thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key}><td className="nowrap">{b.label}</td>{series.map((s) => <td key={s.key}>{b.counts[s.key]}</td>)}<td><b>{b.total}</b></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const monthStart = (ymd) => `${ymd.slice(0, 8)}01`;
const PRESETS = [
  { key: 'month', label: 'This month', range: () => [monthStart(todayYmd()), todayYmd()] },
  { key: 'last', label: 'Last month', range: () => { const last = addDays(monthStart(todayYmd()), -1); return [monthStart(last), last]; } },
  { key: '30', label: 'Last 30 days', range: () => [addDays(todayYmd(), -29), todayYmd()] },
  { key: 'year', label: 'This year', range: () => [`${todayYmd().slice(0, 5)}01-01`, todayYmd()] },
];

const csvCell = (v) => `"${String(v ?? '').replace(/^[=+@-]/, "'").replace(/"/g, '""')}"`;

// Benefit uses over time and by perk, for a date range (from the perk log), with filters.
export default function Report({ pin, onAuthError }) {
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(todayYmd);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [asTable, setAsTable] = useState(false);
  const [off, setOff] = useState([]); // perks switched off
  const [query, setQuery] = useState('');
  const [groupBy, setGroupBy] = useState('auto');

  const load = useCallback(async (fresh = false) => {
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

  useEffect(() => {
    const cached = readCache(cacheKey.log(from, to));
    setRows(cached ? cached.data.log || [] : null);
    load();
  }, [load, from, to]);

  const series = useMemo(() => SERIES.filter((s) => !off.includes(s.key)), [off]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, '');
    return (rows || []).filter((r) => !q || String(r.mug).toLowerCase().includes(q) || String(r.member).toLowerCase().includes(q));
  }, [rows, query]);
  const base = useMemo(() => buildBuckets(from, to, filtered, groupBy), [from, to, filtered, groupBy]);
  const buckets = useMemo(() => withTotals(base.buckets, series), [base, series]);
  const monthly = base.monthly;
  const totals = useMemo(() => SERIES.map((s) => ({ ...s, on: !off.includes(s.key), total: base.buckets.reduce((n, b) => n + b.counts[s.key], 0) })), [base, off]);
  const shown = totals.filter((s) => s.on);
  const grand = shown.reduce((n, s) => n + s.total, 0);
  const maxTotal = Math.max(...shown.map((s) => s.total), 1);
  const busiest = buckets.reduce((m, b) => (b.total > m.total ? b : m), { total: 0, label: '' });
  const filtersOn = off.length > 0 || query.trim() !== '' || groupBy !== 'auto';

  const pick = (range) => { const [f, t] = range(); setFrom(f); setTo(t); };
  const toggle = (key) => setOff((o) => (o.includes(key) ? o.filter((k) => k !== key) : [...o, key]));
  const reset = () => { setOff([]); setQuery(''); setGroupBy('auto'); pick(PRESETS[0].range); };

  const exportCsv = () => {
    const head = [monthly ? 'Month' : 'Day', ...series.map((s) => s.name), 'Total'];
    const lines = [head, ...buckets.map((b) => [b.key, ...series.map((s) => b.counts[s.key]), b.total])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.map((l) => l.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv' }));
    a.download = `benefit-report_${from}_to_${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <section className="panel viz">
      <div className="row">
        <h2>Benefit report</h2>
        <div className="row-actions">
          <button className="secondary" onClick={exportCsv} disabled={!grand}>Export CSV</button>
          <button className="secondary" onClick={() => load(true)} disabled={loading}>{loading ? <>Loading…<span className="spinner" /></> : 'Refresh'}</button>
        </div>
      </div>

      <div className="presets" role="group" aria-label="Date range">
        {PRESETS.map((p) => {
          const [f, t] = p.range();
          return <button key={p.key} className={`chip-btn ${f === from && t === to ? 'selected' : ''}`} onClick={() => pick(p.range)}>{p.label}</button>;
        })}
      </div>

      <div className="filters">
        <label>From <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        <label>Member <input type="search" placeholder="Name or mug number" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <label>Group by
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="auto">Automatic</option>
            <option value="day">Day</option>
            <option value="month">Month</option>
          </select>
        </label>
      </div>

      <div className="presets" role="group" aria-label="Perks shown">
        <span className="label">Perks</span>
        {SERIES.map((s) => (
          <button key={s.key} className={`chip-btn perk ${off.includes(s.key) ? '' : 'selected'}`} aria-pressed={!off.includes(s.key)} onClick={() => toggle(s.key)}>
            <i style={{ background: s.color }} />{s.name}
          </button>
        ))}
        {filtersOn && <button className="link" onClick={reset}>Reset filters</button>}
      </div>

      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="muted">Loading…<span className="spinner" /></p>}

      {rows && (
        <>
          <div className="summary">
            <div className="mini"><strong>{grand}</strong><span className="label">Benefit uses{query.trim() ? ` for “${query.trim()}”` : ''}</span></div>
            <div className="mini"><strong>{buckets.length ? (grand / buckets.length).toFixed(1) : '0'}</strong><span className="label">Average per {monthly ? 'month' : 'day'}</span></div>
            <div className="mini"><strong>{busiest.total || '–'}</strong><span className="label">{busiest.total ? `Busiest ${monthly ? 'month' : 'day'} · ${busiest.label}` : `Busiest ${monthly ? 'month' : 'day'}`}</span></div>
          </div>

          <div className="row section-title">
            <h3>Uses per {monthly ? 'month' : 'day'}</h3>
            <button className="secondary" onClick={() => setAsTable((v) => !v)}>{asTable ? 'Show chart' : 'Show as table'}</button>
          </div>
          {series.length === 0 ? <p className="muted">Switch on at least one perk.</p>
            : grand === 0 ? <p className="muted">No benefit use for these filters.</p>
            : asTable ? <Table buckets={buckets} series={series} /> : <StackedBars buckets={buckets} monthly={monthly} series={series} />}

          <h3 className="section-title">Uses by perk</h3>
          <div className="hbars">
            {shown.map((s) => (
              <div className="hbar" key={s.key}>
                <span className="hbar-name">{s.name}<small>{s.note}</small></span>
                <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(s.total / maxTotal) * 100}%`, background: s.color }} /></span>
                <b>{s.total}</b>
              </div>
            ))}
          </div>
          <p className="label">Counted from the perk log by the day the check was paid. A voided check takes its use back.</p>
        </>
      )}
    </section>
  );
}
