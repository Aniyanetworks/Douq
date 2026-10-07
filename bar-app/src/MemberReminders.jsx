import { useEffect, useState } from 'react';
import { withRetry, getReminders, AuthError, readCache, cacheKey } from './api.js';
import { dateTime, todayYmd } from './format.js';
import { LogRowsSkeleton } from './Skeleton.jsx';
import MemberModal, { RangeTabs, rangeFrom, sameMug } from './MemberModal.jsx';

export const kindTone = (k) => (/last/i.test(k) ? 'warn' : /test/i.test(k) ? 'neutral' : 'info');

// Popup with the unused-perk reminders sent to one member (GHL "Reminder Log").
export default function MemberReminders({ pin, member, onClose, onAuthError }) {
  const [range, setRange] = useState('all');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    const cached = readCache(cacheKey.reminders(rangeFrom(range), todayYmd()));
    setRows(cached ? (cached.data.reminders || []).filter((r) => sameMug(r.mug, member.mug)) : null);
    setError('');
    withRetry(() => getReminders(pin, rangeFrom(range), todayYmd(), { maxAge: 60_000 }), { cancelled: () => !live })
      .then((res) => live && setRows((res.reminders || []).filter((r) => sameMug(r.mug, member.mug))))
      .catch((err) => {
        if (!live) return;
        if (err instanceof AuthError) onAuthError();
        else setError("Couldn't reach the server right now. Close this and open it again in a moment.");
      });
    return () => { live = false; };
  }, [pin, member.mug, range, onAuthError]);

  return (
    <MemberModal member={member} label="Reminders sent" onClose={onClose}>
      <RangeTabs value={range} onChange={setRange} />

      <div className="modal-body">
        {error && <p className="error">{error}</p>}
        {!rows && !error && <LogRowsSkeleton rows={3} stats={false} />}
        {rows && (
          <>
            <p className="meta">{rows.length} {rows.length === 1 ? 'reminder' : 'reminders'} sent</p>
            {rows.length === 0 && <div className="empty">No reminders sent to this member for this period.</div>}
            <ol className="timeline">
              {rows.map((r, i) => (
                <li key={`${r.sentAt}-${i}`}>
                  <div className="tl-top">
                    <span className="tl-perk">Use by {r.expiresOn}</span>
                    <span className={`badge ${kindTone(r.kind)}`}>{r.kind || 'Reminder'}</span>
                  </div>
                  <div className="tl-meta">{dateTime(r.sentAt)}</div>
                  <div className="tl-detail">Unused: {r.unusedPerks}</div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </MemberModal>
  );
}
