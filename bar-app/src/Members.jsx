import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMembers, setMugStatus, AuthError, readCache, cacheKey } from './api.js';
import { clock, monthName, shortDay } from './format.js';
import { MemberCardsSkeleton } from './Skeleton.jsx';
import MemberLog, { MugBadge } from './MemberLog.jsx';
import MemberReminders from './MemberReminders.jsx';

const SmsIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.9A8 8 0 1 1 21 12z" />
    <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
  </svg>
);

const iconProps = { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const GridIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const TableIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 10v10" />
  </svg>
);

const VIEW_KEY = 'members-view';
const loadView = () => {
  try { return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'table'; } catch { return 'table'; }
};

const REFRESH_MS = 60_000;
const PAGE_SIZE = 24;

// "37", "037", "#037" and "Mug 37" all mean mug 37
const mugDigits = (s) => String(s).replace(/\D/g, '').replace(/^0+/, '');
const mugNumber = (m) => Number(mugDigits(m.mug)) || 0;

const SORTS = {
  'mug-asc': { label: 'Mug # (low → high)', compare: (a, b) => mugNumber(a) - mugNumber(b) },
  'mug-desc': { label: 'Mug # (high → low)', compare: (a, b) => mugNumber(b) - mugNumber(a) },
  name: { label: 'Name (A → Z)', compare: (a, b) => a.name.localeCompare(b.name) || mugNumber(a) - mugNumber(b) },
};

export default function Members({ pin, onAuthError }) {
  // Last list from this browser shows instantly; a fresh copy loads in the background
  const [data, setData] = useState(() => readCache(cacheKey.members())?.data ?? null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('mug-desc');
  const [view, setView] = useState(loadView);
  const pickView = (v) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage unavailable */ }
  };
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState(null);
  const closeLog = useCallback(() => setSelected(null), []);
  // Saves a new mug status; the modal shows an error if it fails
  const changeMugStatus = useCallback(async (member, status) => {
    try {
      await setMugStatus(pin, member, status);
    } catch (err) {
      if (err instanceof AuthError) onAuthError();
      throw err;
    }
    setData((d) => d && { ...d, members: d.members.map((m) => (m.id === member.id ? { ...m, mugStatus: status } : m)) });
    setSelected((m) => (m && m.id === member.id ? { ...m, mugStatus: status } : m));
  }, [pin, onAuthError]);
  const [remindersFor, setRemindersFor] = useState(null);
  const closeReminders = useCallback(() => setRemindersFor(null), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getMembers(pin));
      setError('');
    } catch (err) {
      if (err instanceof AuthError) return onAuthError();
      setError(`Couldn't refresh (${err.message}). Showing the last list.`);
    } finally {
      setLoading(false);
    }
  }, [pin, onAuthError]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const members = useMemo(() => {
    const list = data?.members || [];
    const q = query.trim().toLowerCase();
    let found = list;
    if (q) {
      const digits = mugDigits(q);
      const byMug = /^\s*(mug)?\s*#?\s*\d+\s*$/i.test(q);
      // Bare digits could be a mug or part of a phone; "#37" / "mug 37" is only ever a mug
      const mugOnly = /^\s*(mug|#)/i.test(q);
      const phoneDigits = q.replace(/\D/g, '');
      const phoneHit = (m) => phoneDigits.length >= 4 && m.phone.replace(/\D/g, '').includes(phoneDigits);
      found = byMug
        ? list.filter((m) => mugDigits(m.mug) === digits || (!mugOnly && phoneHit(m)))
        : list.filter((m) =>
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          phoneHit(m));
      // An exact mug match always comes first
      if (byMug) {
        const isMug = (m) => mugDigits(m.mug) === digits;
        return [...found].sort((a, b) => isMug(b) - isMug(a) || SORTS[sort].compare(a, b));
      }
    }
    return [...found].sort(SORTS[sort].compare);
  }, [data, query, sort]);

  // A new search or sort starts again from the first page
  useEffect(() => { setShown(PAGE_SIZE); }, [query, sort]);
  const visible = members.slice(0, shown);
  const hasMore = visible.length < members.length;
  const loadMore = useCallback(() => setShown((n) => n + PAGE_SIZE), []);

  // Infinite scroll: load the next page when the bottom of the list comes near the screen
  const sentinel = useRef(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore, visible.length]);

  return (
    <section>
      {loading && <div className="progress" role="progressbar" aria-label="Loading" />}
      <div className="toolbar">
        <h2 className="page-title">Essential <span>Members</span></h2>
        <input
          className="search"
          type="search"
          placeholder="Mug number, name or phone…"
          inputMode="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort members">
          {Object.entries(SORTS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
        </select>
        <div className="view-toggle" role="group" aria-label="View">
          <button type="button" className={view === 'grid' ? 'active' : ''} aria-pressed={view === 'grid'} title="Grid view" aria-label="Grid view" onClick={() => pickView('grid')}><GridIcon /></button>
          <button type="button" className={view === 'table' ? 'active' : ''} aria-pressed={view === 'table'} title="Table view" aria-label="Table view" onClick={() => pickView('table')}><TableIcon /></button>
        </div>
        <button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      <p className="meta">
        {data ? <>Perks for <b>{monthName(data.period)}</b> · {data.members.length} members · updated {clock(data.updatedAt)}</> : 'Loading members…'}
      </p>
      {error && <p className="error">{error}</p>}

      {!data && !error && <MemberCardsSkeleton />}

      {data && members.length === 0 && (
        <div className="empty">
          No member found{query ? <> for “{query}”</> : ''}.
          {query && <><br />Check the mug number, or ask a manager to add the member in GHL.</>}
        </div>
      )}

      {view === 'table' && visible.length > 0 && (
        <div className="table-wrap members-wrap">
          <table className="members-table">
            <thead>
              <tr>
                <th>Mug</th>
                <th>Name</th>
                <th>Contact</th>
                {visible[0].perks.map((p) => <th key={p.key}>{p.label}</th>)}
                <th>Initial Pour</th>
                <th>Mug</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr
                  key={m.mug + m.name}
                  tabIndex={0}
                  aria-label={`Mug ${m.mug} ${m.name} – view history`}
                  onClick={() => setSelected(m)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    setSelected(m);
                  }}
                >
                  <td className="t-mug">#{m.mug}</td>
                  <td className="t-name">{m.name}</td>
                  <td className="t-contact">{m.phone || m.email}</td>
                  {m.perks.map((p) => (
                    <td key={p.key} className={p.used ? 'perk-cell used' : 'perk-cell available'}>
                      {p.used ? `Used ${shortDay(p.date)}` : 'Available'}
                    </td>
                  ))}
                  <td className="t-initial">{m.initialPour ? `Received ${shortDay(m.initialPour)}` : <span className="ok">Not yet</span>}</td>
                  <td><MugBadge status={m.mugStatus} /></td>
                  <td className="t-actions">
                    <button
                      className="icon-btn"
                      title="Reminders sent"
                      aria-label={`Reminders sent to mug ${m.mug}`}
                      onClick={(e) => { e.stopPropagation(); setRemindersFor(m); }}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <SmsIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={view === 'table' ? 'cards hidden' : 'cards'}>
        {visible.map((m) => (
          <article
            key={m.mug + m.name}
            className="card clickable"
            role="button"
            tabIndex={0}
            aria-label={`Mug ${m.mug} ${m.name} – view history`}
            onClick={() => setSelected(m)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              setSelected(m);
            }}
          >
            <div className="card-head">
              <div className="mug">#{m.mug}</div>
              <div>
                <div className="name">{m.name}</div>
                <div className="contact">{m.phone || m.email}</div>
                {m.mugStatus && <MugBadge status={m.mugStatus} label />}
              </div>
            </div>
            <ul className="perks">
              {m.perks.map((p) => (
                <li key={p.key} className={p.used ? 'perk used' : 'perk available'}>
                  <span>{p.label}</span>
                  <b>{p.used ? `Used ${shortDay(p.date)}` : 'Available'}</b>
                </li>
              ))}
            </ul>
            <div className="card-foot">
              <span className="initial">
                Initial Member Pour: {m.initialPour ? <b>received {shortDay(m.initialPour)}</b> : <b className="ok">not yet</b>}
              </span>
              <span className="card-actions">
                <button
                  className="icon-btn"
                  title="Reminders sent"
                  aria-label={`Reminders sent to mug ${m.mug}`}
                  onClick={(e) => { e.stopPropagation(); setRemindersFor(m); }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <SmsIcon />
                </button>
                <span className="history-link">History ›</span>
              </span>
            </div>
          </article>
        ))}
      </div>

      {members.length > 0 && (
        <div className="load-more" ref={sentinel}>
          <span>Showing {visible.length} of {members.length}</span>
          {hasMore && (
            <button onClick={loadMore}>
              Load {Math.min(PAGE_SIZE, members.length - visible.length)} more
            </button>
          )}
        </div>
      )}

      {selected && <MemberLog pin={pin} member={selected} onClose={closeLog} onAuthError={onAuthError} onMugStatus={changeMugStatus} />}
      {remindersFor && <MemberReminders pin={pin} member={remindersFor} onClose={closeReminders} onAuthError={onAuthError} />}
    </section>
  );
}
