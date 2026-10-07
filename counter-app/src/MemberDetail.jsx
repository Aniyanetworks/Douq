import { useEffect, useMemo, useState } from 'react';
import { withRetry, getLog, getReminders, AuthError, readCache, cacheKey } from '../../bar-app/src/api.js';
import { dateTime, eventInfo, isAlert, shortDay, todayYmd } from '../../bar-app/src/format.js';
import { RANGES, rangeFrom, sameMug } from '../../bar-app/src/MemberModal.jsx';
import MugPipeline, { MugPill } from './MugPipeline.jsx';

const PERK_TEXT = {
  free_pour: 'One complimentary pour each month',
  four_pack: 'One 4-pack at 50% off each month',
  merch: '10% off merchandise each month',
  mug: '24oz beer at the 16oz price each month',
};

// The right-hand panel: perks this month, the mug order pipeline and this member's history.
export default function MemberDetail({ pin, member, onAuthError, onMugStatus }) {
  const [range, setRange] = useState('all');
  const [log, setLog] = useState(null);
  const [reminders, setReminders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    const from = rangeFrom(range);
    const to = todayYmd();
    const mine = (rows) => (rows || []).filter((r) => sameMug(r.mug, member.mug));
    const cachedLog = readCache(cacheKey.log(from, to));
    const cachedRem = readCache(cacheKey.reminders(from, to));
    setLog(cachedLog ? mine(cachedLog.data.log) : null);
    setReminders(cachedRem ? mine(cachedRem.data.reminders) : null);
    setError('');
    const fail = (err) => {
      if (!live) return;
      if (err instanceof AuthError) onAuthError();
      else setError("Couldn't reach the server right now. Pick the member again in a moment.");
    };
    withRetry(() => getLog(pin, from, to, { maxAge: 60_000 }), { cancelled: () => !live }).then((res) => live && setLog(mine(res.log))).catch(fail);
    withRetry(() => getReminders(pin, from, to, { maxAge: 60_000 }), { cancelled: () => !live }).then((res) => live && setReminders(mine(res.reminders))).catch(fail);
    return () => { live = false; };
  }, [pin, member.mug, range, onAuthError]);

  const counts = useMemo(() => {
    const c = { used: 0, voided: 0, alerts: 0 };
    for (const r of log || []) {
      if (r.event === 'void') c.voided++;
      else if (isAlert(r.event)) c.alerts++;
      else c.used++;
    }
    return c;
  }, [log]);

  return (
    <>
      <div className="row">
        <div>
          <h2 className="member-name">{member.name || 'Unknown member'}</h2>
          <span className="label">#{member.mug} · {member.phone || member.email || 'no contact'}</span>
        </div>
        <span className="pill">{member.mugStatus ? 'Member' : 'Active member'}</span>
      </div>

      <div className="benefits">
        {member.perks.map((p) => (
          <div className="benefit" key={p.key}>
            <span className={p.used ? 'used' : 'available'}>{p.used ? `● Used ${shortDay(p.date)}` : '● Available this month'}</span>
            <h3>{p.label}</h3>
            <p>{PERK_TEXT[p.key] || ''}</p>
          </div>
        ))}
      </div>

      <div className="row">
        <span className="label">
          Initial Member Pour: {member.initialPour ? `received ${shortDay(member.initialPour)}` : 'not yet'}
        </span>
      </div>

      <h2 className="section-title">Mug order pipeline {member.mugStatus && <MugPill status={member.mugStatus} />}</h2>
      <MugPipeline member={member} onChange={onMugStatus} />

      <div className="row section-title">
        <h2>Benefit history</h2>
        <nav className="tabs compact" role="tablist">
          {RANGES.map((r) => (
            <button key={r.key} role="tab" aria-selected={range === r.key} className={range === r.key ? 'selected' : ''} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </nav>
      </div>
      {error && <p className="error">{error}</p>}
      {!log && !error && <p className="muted">Loading…<span className="spinner" /></p>}
      {log && (
        <>
          <p className="label">{counts.used} perks used · {counts.voided} voided · {counts.alerts} alerts</p>
          {log.length === 0 ? <p className="muted">No perk activity for this period.</p> : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Perk</th><th>Recorded</th><th>Check</th><th>Status</th></tr></thead>
                <tbody>
                  {log.map((r, i) => {
                    const ev = eventInfo(r.event);
                    return (
                      <tr key={`${r.orderId}-${r.loggedAt}-${i}`}>
                        <td>
                          {r.perk}
                          {isAlert(r.event) && r.detail && <><br /><span className="label">{r.detail}</span></>}
                        </td>
                        <td className="nowrap">{dateTime(r.loggedAt)}</td>
                        <td>{r.checkNumber ? `#${r.checkNumber}` : ''}</td>
                        <td><span className={`badge ${ev.tone}`}>{ev.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {reminders && reminders.length > 0 && (
        <>
          <h2 className="section-title">Reminders sent</h2>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Sent</th><th>Type</th><th>Unused perks</th><th>Use by</th></tr></thead>
              <tbody>
                {reminders.map((r, i) => (
                  <tr key={`${r.sentAt}-${i}`}>
                    <td className="nowrap">{dateTime(r.sentAt)}</td>
                    <td>{r.kind || 'Reminder'}</td>
                    <td>{r.unusedPerks}</td>
                    <td className="nowrap">{r.expiresOn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
