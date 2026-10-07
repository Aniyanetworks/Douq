import { useEffect } from 'react';
import { sameMug, RANGES, rangeFrom } from './format.js';

export { sameMug, RANGES, rangeFrom };

export function RangeTabs({ value, onChange }) {
  return (
    <div className="segmented" role="tablist">
      {RANGES.map((r) => (
        <button key={r.key} role="tab" aria-selected={value === r.key} className={value === r.key ? 'active' : ''} onClick={() => onChange(r.key)}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

// Popup frame for one member: header with mug + name, closes on ✕, Esc or a click outside.
export default function MemberModal({ member, label, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`${label} for mug ${member.mug}`} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div className="mug">#{member.mug}</div>
          <div className="modal-title">
            <div className="name">{member.name || 'Unknown member'}</div>
            <div className="contact">{label}{member.phone || member.email ? ` · ${member.phone || member.email}` : ''}</div>
          </div>
          <button className="close" onClick={onClose} aria-label="Close">✕</button>
        </header>
        {children}
      </div>
    </div>
  );
}
