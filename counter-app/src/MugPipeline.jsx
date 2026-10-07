import { useRef, useState } from 'react';
import { MUG_STATUSES, mugStatusLabel, canSetMugStatus } from '../../bar-app/src/api.js';

const STEPS = MUG_STATUSES.filter((s) => s !== 'Cancelled'); // Cancelled has its own button

// Small pill with the mug status; empty for a member with no mug order
export function MugPill({ status }) {
  if (!status) return null;
  return <span className={`pill mug-${status.toLowerCase()}`}>{mugStatusLabel(status)}</span>;
}

// The mug order as a pipeline: numbered steps joined by a line. Staff can only move forward; Cancelled has its own button.
export default function MugPipeline({ member, onChange }) {
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const dialog = useRef(null);

  const pick = async (status) => {
    setSaving(status);
    setError('');
    try {
      await onChange(member, status);
    } catch (err) {
      setError("Couldn't save the mug status. Please try again.");
    } finally {
      setSaving('');
    }
  };

  const cur = MUG_STATUSES.indexOf(member.mugStatus);
  const cancelled = member.mugStatus === 'Cancelled';

  return (
    <div className="pipeline-box">
      <ol className="pipeline" aria-label="Mug Order Pipeline">
        {STEPS.map((s, i) => {
          const state = cancelled || cur < 0 ? '' : i < cur ? 'done' : i === cur ? 'current' : '';
          const allowed = canSetMugStatus(member.mugStatus, s);
          const next = i === (cancelled || cur < 0 ? 0 : cur + 1) && allowed && !saving; // the step that comes next pulses
          return (
            <li key={s} className={state}>
              <button
                type="button"
                className={`step ${state}${next ? ' next' : ''}`}
                aria-current={state === 'current' ? 'step' : undefined}
                disabled={!!saving || !allowed}
                title={!allowed && state !== 'current' ? 'The status can only move forward' : undefined}
                onClick={() => allowed && pick(s)}
              >
                <span className="dot">{saving === s ? '…' : state === 'done' ? '✓' : i + 1}</span>
                <span className="step-label">{mugStatusLabel(s)}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {cancelled && <p className="cancelled-note">Order cancelled. Press the first step to order again.</p>}
      {member.mugStatus && canSetMugStatus(member.mugStatus, 'Cancelled') && (
        <button type="button" className="secondary danger small" disabled={!!saving} onClick={() => dialog.current.showModal()}>
          Cancel order
        </button>
      )}
      {error && <p className="error">{error}</p>}

      <dialog ref={dialog}>
        <h2>Cancel this mug order?</h2>
        <p>#{member.mug} {member.name}. If the order was already sent to the vendor, tell them to stop.</p>
        <div className="row">
          <button type="button" className="secondary" onClick={() => dialog.current.close()}>Keep order</button>
          <button type="button" className="danger" onClick={() => { dialog.current.close(); pick('Cancelled'); }}>Cancel order</button>
        </div>
      </dialog>
    </div>
  );
}
