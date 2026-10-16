import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { setMugStatus, updateMember, AuthError } from '../../bar-app/src/api.js';
import { sameMug, mugKey, mugRank } from '../../bar-app/src/format.js';
import { MugPill } from './MugPipeline.jsx';
import MemberDetail from './MemberDetail.jsx';

const PAGE = 50;

// "37", "037", "#037" and "Mug 37" all mean mug 37; "P10" and "p00010" mean mug P00010
const mugDigits = (s) => String(s).replace(/\D/g, '').replace(/^0+/, '');
const mugNumber = (m) => mugRank(m.mug);
const MUG_QUERY = /^\s*(mug)?\s*#?\s*[a-z]?\s*\d+\s*$/i;

const SORTS = {
  'mug-desc': { label: 'Mug # (high → low)', compare: (a, b) => mugNumber(b) - mugNumber(a) },
  'mug-asc': { label: 'Mug # (low → high)', compare: (a, b) => mugNumber(a) - mugNumber(b) },
  name: { label: 'Name (A → Z)', compare: (a, b) => a.name.localeCompare(b.name) || mugNumber(a) - mugNumber(b) },
};

// Name, mug number, phone or email
function filterMembers(list, query) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const byMug = MUG_QUERY.test(q);
  const mugOnly = /^\s*(mug|#)/i.test(q);
  const typed = q.replace(/^\s*mug\s*/i, '').replace(/^#\s*/, '').replace(/\s+/g, '');
  const lettered = /^[a-z]/i.test(typed); // "P10": that exact mug; "10": that number in any tier
  const digits = mugDigits(q);
  const phoneDigits = q.replace(/\D/g, '');
  const phoneHit = (m) => phoneDigits.length >= 4 && m.phone.replace(/\D/g, '').includes(phoneDigits);
  const hit = (m) => (lettered ? mugKey(m.mug) === mugKey(typed) : mugDigits(m.mug) === digits);
  const plain = (m) => !/^[A-Z]/i.test(String(m.mug));
  const found = byMug
    ? list.filter((m) => hit(m) || (!mugOnly && !lettered && phoneHit(m)))
    : list.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || String(m.mug).toLowerCase().includes(q) || phoneHit(m));
  // an exact mug match comes first (a plain number before the same number in a tier)
  return byMug ? [...found].sort((x, y) => (hit(y) && plain(y)) - (hit(x) && plain(x))) : found;
}

export default function Counter({ pin, onAuthError, state, focus, clearFocus }) {
  const { data, error, patch } = state;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('mug-desc');
  const [selectedId, setSelectedId] = useState(null);
  const [shown, setShown] = useState(PAGE);
  const detail = useRef(null);

  const list = useMemo(() => {
    const found = filterMembers(data?.members || [], query);
    return query.trim() && MUG_QUERY.test(query) ? found : [...found].sort(SORTS[sort].compare);
  }, [data, query, sort]);

  useEffect(() => { setShown(PAGE); }, [query, sort]);

  // Opened from the Activity tab: show that member
  useEffect(() => {
    if (!focus || !data) return;
    const m = data.members.find((x) => sameMug(x.mug, focus));
    if (m) { setSelectedId(m.id); setQuery(''); }
    clearFocus();
  }, [focus, data, clearFocus]);

  const member = (data?.members || []).find((m) => m.id === selectedId) || list[0] || null;

  const pick = (m) => {
    setSelectedId(m.id);
    // on a phone the detail sits under the list
    if (window.innerWidth <= 850) detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const changeStatus = useCallback(async (m, status) => {
    try {
      await setMugStatus(pin, m, status);
    } catch (err) {
      if (err instanceof AuthError) onAuthError();
      throw err;
    }
    patch(m.id, { mugStatus: status });
  }, [pin, onAuthError, patch]);

  const saveMember = useCallback(async (m, fields) => {
    try {
      const changes = await updateMember(pin, m, fields);
      patch(m.id, changes);
    } catch (err) {
      if (err instanceof AuthError) onAuthError();
      throw err;
    }
  }, [pin, onAuthError, patch]);

  return (
    <section className="layout">
      <aside className="panel side">
      <div className="aside-inner">
        <h2>Find a member</h2>
        <input
          className="search"
          type="search"
          placeholder="Name, phone, or mug number"
          aria-label="Search members"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort members">
          {Object.entries(SORTS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
        </select>

        {error && <p className="error">{error}</p>}
        {!data && !error && <p className="muted">Loading members…<span className="spinner" /></p>}
        {data && list.length === 0 && <p className="muted">No members found{query ? ` for “${query}”` : ''}.</p>}

        <div className="members">
          {list.slice(0, shown).map((m) => (
            <button key={m.id || m.mug} className={`member ${member && m.id === member.id ? 'active' : ''}`} onClick={() => pick(m)}>
              <b>{m.name}</b>
              <small>#{m.mug} · {m.phone || m.email}</small>
              {m.mugStatus && <span className="member-pill"><MugPill status={m.mugStatus} /></span>}
            </button>
          ))}
        </div>
        {list.length > shown && (
          <button className="secondary more" onClick={() => setShown((n) => n + PAGE)}>
            Show {Math.min(PAGE, list.length - shown)} more ({shown} of {list.length})
          </button>
        )}
      </div>
      </aside>

      <article className="panel" ref={detail}>
        {member
          ? <MemberDetail key={member.id} pin={pin} member={member} members={data?.members || []} onAuthError={onAuthError} onMugStatus={changeStatus} onSaveMember={saveMember} />
          : <p className="muted">Pick a member to see their benefits.</p>}
      </article>
    </section>
  );
}
