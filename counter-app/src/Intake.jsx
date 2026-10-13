import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';

// "New member" popup: a QR code for the GHL signup form (a guest scans it with their phone), the link, and the form itself.
export default function Intake({ open, url, onClose, onOpenSettings }) {
  const dialog = useRef(null);
  const [inline, setInline] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (!open) { setInline(false); setCopied(false); }
  }, [open]);

  const svg = useMemo(() => {
    if (!url) return '';
    try {
      const qr = qrcode(0, 'M'); // the smallest size that fits the link
      qr.addData(url);
      qr.make();
      return qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
    } catch { return ''; }
  }, [url]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };

  return (
    <dialog ref={dialog} className="intake" onClose={onClose}>
      <div className="row">
        <h2>New member</h2>
        <button type="button" className="secondary" onClick={onClose}>Close</button>
      </div>
      {!url ? (
        <>
          <p className="muted">No signup form link is saved yet. Add it in Settings to show the QR code here.</p>
          <button type="button" onClick={onOpenSettings}>Open Settings</button>
        </>
      ) : (
        <>
          <p className="muted">Let the guest scan this code with their phone camera to join the Mug Club, or fill the form in here.</p>
          {svg
            ? <div className="qr" role="img" aria-label="QR code for the member signup form" dangerouslySetInnerHTML={{ __html: svg }} />
            : <p className="error">The link is too long to make a QR code.</p>}
          <p className="intake-url">{url}</p>
          <div className="row intake-actions">
            <a className="button" href={url} target="_blank" rel="noreferrer">Open form</a>
            <button type="button" className="secondary" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
            <button type="button" className="secondary" onClick={() => setInline((v) => !v)}>{inline ? 'Hide form' : 'Fill in here'}</button>
          </div>
          {inline && <iframe className="intake-frame" title="Member signup form" src={url} />}
        </>
      )}
    </dialog>
  );
}
