import { useEffect, useMemo, useState } from 'react';
import { getLog, MUG_STATUSES, AuthError, readCache, cacheKey } from './api.js';
import { dateTime, eventInfo, isAlert, shortDay, todayYmd } from './format.js';
import { LogRowsSkeleton } from './Skeleton.jsx';
import MemberModal, { RangeTabs, rangeFrom, sameMug } from './MemberModal.jsx';

// Small coloured tag for a mug status; empty status shows a dash (table) or nothing
export function MugBadge({ status, label }) {
  if (!status) return <span className="mug-status s-none">–</span>;
  return <span className={`mug-status s-${status.toLowerCase()}`}>{label ? `Mug ${status.toLowerCase()}` : status}</span>;
}

// Popup with one member's perk history. `member` needs mug + name; perks are shown when known.
export default function MemberLog({ pin, member, onClose, onAuthError, onMugStatus }) {
  const [saving, setSaving] = useState('');
  const [statusError, setStatusError] = useState('');
  const pickStatus = async (status) => {
    setSaving(status);
    setStatusError('');
    try {
      await onMugStatus(member, status);
    } catch (err) {
      setStatusError(`Couldn't save the mug status (${err.message}).`);
    } finally {
      setSaving('');
    }
  };
  const [range, setRange] = useState('all');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    const cached = readCache(cacheKey.log(rangeFrom(range), todayYmd()));
    setRows(cached ? (cached.data.log || []).filter((r) => sameMug(r.mug, member.mug)) : null);
    setError('');
    getLog(pin, rangeFrom(range), todayYmd())
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
    <MemberModal member={member} label="Perk history" onClose={onClose}>
      {member.perks && (
        <ul className="perk-pills">
          {member.perks.map((p) => (
            <li key={p.key} className={p.used ? 'used' : 'available'}>
              {p.label}: <b>{p.used ? `used ${shortDay(p.date)}` : 'available'}</b>
            </li>
          ))}
        </ul>
      )}

      {onMugStatus && member.id && (
        <div className="mug-track">
          <span className="mug-track-label">Mug status</span>
          <div className="segmented" role="group" aria-label="Mug status">
            {MUG_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={member.mugStatus === s ? 'active' : ''}
                aria-pressed={member.mugStatus === s}
                disabled={!!saving}
                onClick={() => {
                  if (member.mugStatus === s) return;
                  if (s === 'Cancelled' && !window.confirm(`Cancel the mug order for #${member.mug} ${member.name}?`)) return;
                  pickStatus(s);
                }}
              >
                {saving === s ? 'Saving…' : s}
              </button>
            ))}
          </div>
          {statusError && <p className="error">{statusError}</p>}
        </div>
      )}

      <RangeTabs value={range} onChange={setRange} />

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
    </MemberModal>
  );
}
