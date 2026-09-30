import { useEffect, useMemo, useState } from 'react';
import { getLog, AuthError } from './api.js';
import { dateTime, eventInfo, isAlert, shortDay, todayYmd } from './format.js';
import { LogRowsSkeleton } from './Skeleton.jsx';

const sameMug = (a, b) => String(a).replace(/^0+/, '') === String(b).replace(/^0+/, '');

// First day of the month `back` months ago, as YYYY-MM-DD
const monthStart = (back) => {
  const [y, m] = todayYmd().split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return d.toISOString().slice(0, 10);
};
const RANGES = [
  { key: 'month', label: 'This month', from: () => monthStart(0) },
  { key: '3m', label: '3 months', from: () => monthStart(2) },
  { key: 'all', label: 'All', from: () => '' },
];

// Popup with one member's perk history. `member` needs mug + name; perks are shown when known.
export default function MemberLog({ pin, member, onClose, onAuthError }) {
  const [range, setRange] = useState('all');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);

  useEffect(() => {
    let live = true;
    setRows(null);
    setError('');
    const from = RANGES.find((r) => r.key === range).from();
    getLog(pin, from, todayYmd())
      .then((res) => live && setRows((res.log || []).filter((r) => sameMug(r.mug, member.mug))))
      .catch((err) => {
        if (!live) return;
        if (err instanceof AuthError) onAuthError();
        else setError(`Couldn't load the history (${err.message}).`);
      });
    return () => { live = false; };
  }, [pin, member.mug, range, onAuthError]);

  const counts = useMemo(() => {
    const c = { used: 0, voided: 0, alerts: 0 };
    for (const r of rows || []) {
      if (r.event === 'void') c.voided++;
      else if (isAlert(r.event)) c.alerts++;
      else c.used++;
    }
    return c;
  }, [rows]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`History for mug ${member.mug}`} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div className="mug">#{member.mug}</div>
          <div className="modal-title">
            <div className="name">{member.name || 'Unknown member'}</div>
            {(member.phone || member.email) && <div className="contact">{member.phone || member.email}</div>}
          </div>
          <button className="close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        {member.perks && (
          <ul className="perk-pills">
            {member.perks.map((p) => (
              <li key={p.key} className={p.used ? 'used' : 'available'}>
                {p.label}: <b>{p.used ? `used ${shortDay(p.date)}` : 'available'}</b>
              </li>
            ))}
          </ul>
        )}

        <div className="segmented" role="tablist">
          {RANGES.map((r) => (
            <button key={r.key} role="tab" aria-selected={range === r.key} className={range === r.key ? 'active' : ''} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {error && <p className="error">{error}</p>}
          {!rows && !error && <LogRowsSkeleton rows={4} stats={false} />}
          {rows && (
            <>
              <p className="meta">
                {counts.used} perks used · {counts.voided} voided · <span className={counts.alerts ? 'bad' : ''}>{counts.alerts} alerts</span>
              </p>
              {rows.length === 0 && <div className="empty">No perk activity for this period.</div>}
              <ol className="timeline">
                {rows.map((r, i) => {
                  const ev = eventInfo(r.event);
                  return (
                    <li key={`${r.orderId}-${r.loggedAt}-${i}`}>
                      <div className="tl-top">
                        <span className="tl-perk">{r.perk}</span>
                        <span className={`badge ${ev.tone}`}>{ev.label}</span>
                      </div>
                      <div className="tl-meta">
                        {dateTime(r.loggedAt)}{r.checkNumber ? ` · check #${r.checkNumber}` : ''}
                      </div>
                      {isAlert(r.event) && r.detail && <div className="tl-detail">{r.detail}</div>}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
