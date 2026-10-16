import { useEffect, useMemo, useRef, useState } from 'react';
import { withRetry, getLog, getReminders, AuthError, readCache, cacheKey, UNLIMITED_PERKS } from '../../bar-app/src/api.js';
import { dateTime, eventInfo, isAlert, shortDay, todayYmd } from '../../bar-app/src/format.js';
import { RANGES, rangeFrom, sameMug, cleanMug } from '../../bar-app/src/format.js';
import MugPipeline, { MugPill } from './MugPipeline.jsx';

const PERK_TEXT = {
  free_pour: 'One complimentary pour each month',
  four_pack: 'One 4-pack at 50% off each month',
};

// The right-hand panel: perks this month, the mug order pipeline and this member's history.
export default function MemberDetail({ pin, member, members = [], onAuthError, onMugStatus, onSaveMember }) {
  const [range, setRange] = useState('all');
  const [log, setLog] = useState(null);
  const [reminders, setReminders] = useState(null);
  const [error, setError] = useState('');
  const dialog = useRef(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', mug: '' });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

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

  const startEdit = () => {
    setForm({ name: member.name || '', email: member.email || '', phone: member.phone || '', mug: member.mug || '' });
    setEditError('');
    dialog.current.showModal();
  };

  const save = async (e) => {
    e.preventDefault();
    const email = form.email.trim();
    if (!form.name.trim()) return setEditError('A name is required.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setEditError('That email address does not look right.');
    if (form.phone.trim() && form.phone.replace(/\D/g, '').length < 7) return setEditError('That phone number looks too short.');
    const mug = cleanMug(form.mug);
    if (!mug) return setEditError('The mug number is digits, or a tier letter (P, F, E, I, V) and digits, like P00010.');
    if (members.some((m) => m.id !== member.id && sameMug(m.mug, mug))) return setEditError(`Mug #${mug} already belongs to another member.`);
    setSaving(true);
    setEditError('');
    try {
      await onSaveMember(member, { name: form.name.trim(), email, phone: form.phone.trim(), mug });
      dialog.current.close();
    } catch {
      setEditError("Couldn't save the changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => {
    const c = { used: 0, voided: 0, alerts: 0 };
    for (const r of log || []) {
      if (r.event === 'void') c.voided++;
      else if (isAlert(r.event)) c.alerts++;
      else c.used++;
    }
    return c;
  }, [log]);

  // Unlimited benefits are counted from the log (a voided item is not a use); they never gray out
  const unlimited = useMemo(() => UNLIMITED_PERKS.map((u) => {
    const uses = (log || []).filter((r) => r.perk === u.label && (r.event === 'used' || r.event === 'redeem'));
    return { ...u, count: log ? uses.length : null, last: uses[0] ? shortDay(uses[0].businessDay) : '' }; // the log is newest first
  }), [log]);

  return (
    <>
      <div className="row">
        <div>
          <div className="member-title">
            <h2 className="member-name">{member.name || 'Unknown member'}</h2>
            <span className="pill">{member.mugStatus ? 'Member' : 'Active member'}</span>
          </div>
          <span className="label">#{member.mug} · {member.phone || member.email || 'no contact'}</span>
        </div>
        <div className="member-actions">
          <button type="button" className="secondary small" onClick={startEdit}>Edit</button>
        </div>
      </div>

      <dialog ref={dialog} className="member-dialog">
        <form className="member-edit" onSubmit={save}>
          <h2>Edit member <span className="label">#{member.mug}</span></h2>
          <label>Mug number
            <input type="text" value={form.mug} disabled={saving} onChange={(e) => setForm({ ...form, mug: e.target.value })} />
          </label>
          {sameMug(form.mug, member.mug) ? null : <p className="label">Past perk history stays under the old number #{member.mug}. Toast tabs must use the new number.</p>}
          <label>Name
            <input type="text" value={form.name} autoFocus disabled={saving} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>Email
            <input type="email" value={form.email} disabled={saving} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>Phone
            <input type="tel" value={form.phone} disabled={saving} placeholder="+1 555 123 4567" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          {editError && <p className="error">{editError}</p>}
          <div className="row">
            <button type="button" className="secondary" disabled={saving} onClick={() => dialog.current.close()}>Cancel</button>
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      </dialog>

      <div className="benefits">
        {member.perks.map((p) => {
          // when and at which check this perk was used: the matching perk-log entry
          const rec = p.used && (log || []).find((r) => r.perk === p.label && (r.event === 'redeem' || r.event === 'used') && r.businessDay === p.date);
          return (
            <div className="benefit" key={p.key}>
              <span className={p.used ? 'used' : 'available'}>{p.used ? '● Used this month' : '● Available this month'}</span>
              <h3>{p.label}</h3>
              <p>
                {p.used
                  ? (rec ? `Recorded ${dateTime(rec.loggedAt)}${rec.checkNumber ? ` · check #${rec.checkNumber}` : ''}` : `Recorded ${shortDay(p.date)}`)
                  : PERK_TEXT[p.key] || ''}
              </p>
              <div className={p.used ? 'benefit-btn' : 'benefit-btn open'} aria-disabled="true">
                {p.used ? 'Already redeemed' : 'Not redeemed yet'}
              </div>
            </div>
          );
        })}
        {unlimited.map((u) => (
          <div className="benefit" key={u.key}>
            <span className="available">● Unlimited</span>
            <h3>{u.label}</h3>
            <p>
              {u.count === null ? 'Counting…' : u.count === 0 ? u.text : `Used ${u.count} ${u.count === 1 ? 'time' : 'times'}${u.last ? ` · last ${u.last}` : ''}`}
            </p>
            <div className="benefit-btn open" aria-disabled="true">Available on every visit</div>
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
