import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMembers, AuthError } from './api.js';
import { clock, monthName, shortDay } from './format.js';
import { MemberCardsSkeleton } from './Skeleton.jsx';
import MemberLog from './MemberLog.jsx';
import MemberReminders from './MemberReminders.jsx';

const SmsIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.9A8 8 0 1 1 21 12z" />
    <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
  </svg>
);

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
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('mug-asc');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState(null);
  const closeLog = useCallback(() => setSelected(null), []);
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
      const phoneDigits = q.replace(/\D/g, '');
      found = byMug
        ? list.filter((m) => mugDigits(m.mug) === digits)
        : list.filter((m) =>
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          (phoneDigits && m.phone.replace(/\D/g, '').includes(phoneDigits)));
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
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Mug number or name…"
          inputMode="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort members">
          {Object.entries(SORTS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
        </select>
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

      <div className={loading && data ? 'cards refreshing' : 'cards'}>
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

      {selected && <MemberLog pin={pin} member={selected} onClose={closeLog} onAuthError={onAuthError} />}
      {remindersFor && <MemberReminders pin={pin} member={remindersFor} onClose={closeReminders} onAuthError={onAuthError} />}
    </section>
  );
}
