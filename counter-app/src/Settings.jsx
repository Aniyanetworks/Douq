import { useEffect, useState } from 'react';
import { withRetry, getSettings, saveSettings, AuthError } from '../../bar-app/src/api.js';

const TEXT_FIELDS = {
  ghl: [
    { key: 'locationId', label: 'GHL location ID' },
    { key: 'memberTag', label: 'Member tag' },
    { key: 'mugNumberFieldId', label: 'Mug number field ID' },
    { key: 'mugStatusFieldId', label: 'Mug status field ID' },
  ],
  urls: [
    { key: 'signupFormUrl', label: 'Member signup form link', hint: 'Used by the New member button (QR code and form).' },
    { key: 'alertWebhookUrl', label: 'Alert webhook (GHL)', hint: 'Where Toast perk alerts are sent.' },
    { key: 'newMemberWebhookUrl', label: 'New member webhook (n8n)', hint: 'Workflow 4, which assigns the mug number.' },
  ],
  toast: [{ key: 'restaurantGuid', label: 'Toast restaurant GUID' }],
};

const JSON_FIELDS = [
  { key: 'benefits', label: 'Toast item GUID → perk key', example: '{ "e9a3cfc6-...": "free_pour" }' },
  { key: 'benefitKinds', label: 'Perk rules (monthly, once or log)', example: '{ "free_pour": "monthly", "mug": "log" }' },
  { key: 'benefitLabels', label: 'Perk names shown in logs', example: '{ "free_pour": "Free Monthly Pour" }' },
];

const toForm = (settings) => {
  const f = {};
  for (const [sec, fields] of Object.entries(TEXT_FIELDS)) for (const x of fields) f[`${sec}.${x.key}`] = (settings[sec] && settings[sec][x.key]) || '';
  for (const x of JSON_FIELDS) f[`toast.${x.key}`] = settings.toast && settings.toast[x.key] ? JSON.stringify(settings.toast[x.key], null, 2) : '';
  return f;
};

// Staff PIN and the GHL / webhook / Toast values, saved in n8n. Needs the PIN you are signed in with.
export default function Settings({ pin, onAuthError, onSaved, onPinChanged }) {
  const [loaded, setLoaded] = useState(null);
  const [form, setForm] = useState({});
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const [done, setDone] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let live = true;
    withRetry(() => getSettings(pin), { cancelled: () => !live })
      .then((res) => {
        if (!live) return;
        if (!res || !res.settings) return setLoadError('The n8n server does not support settings yet. Workflow 6 needs the update.');
        setLoaded(res);
        setForm(toForm(res.settings));
      })
      .catch((err) => {
        if (!live) return;
        if (err instanceof AuthError) onAuthError();
        else setLoadError("Couldn't load the settings right now. Try again in a moment.");
      });
    return () => { live = false; };
  }, [pin, onAuthError]);

  const set = (name) => (e) => { setForm((f) => ({ ...f, [name]: e.target.value })); setDone(''); };

  const submit = async (e) => {
    e.preventDefault();
    setErrors([]);
    setDone('');
    const problems = [];
    if (newPin && newPin !== confirmPin) problems.push('The two new PINs do not match.');
    const settings = { ghl: {}, urls: {}, toast: {} };
    for (const [sec, fields] of Object.entries(TEXT_FIELDS)) for (const x of fields) settings[sec][x.key] = form[`${sec}.${x.key}`] || '';
    for (const x of JSON_FIELDS) {
      const text = (form[`toast.${x.key}`] || '').trim();
      if (!text) { settings.toast[x.key] = ''; continue; }
      try { settings.toast[x.key] = JSON.parse(text); } catch { problems.push(`${x.label} is not valid JSON.`); }
    }
    if (problems.length) return setErrors(problems);
    setBusy(true);
    try {
      const res = await saveSettings(pin, settings, newPin);
      if (!res.ok) return setErrors(res.errors || ['The settings were not saved.']);
      setLoaded(res);
      setForm(toForm(res.settings));
      onSaved(res.settings);
      if (newPin) { setNewPin(''); setConfirmPin(''); onPinChanged(newPin); }
      setDone(newPin ? 'Saved. The PIN was changed; use the new PIN next time you sign in.' : 'Saved.');
    } catch (err) {
      if (err instanceof AuthError) onAuthError();
      else setErrors(["Couldn't save right now. Please try again."]);
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <section className="panel"><p className="error">{loadError}</p></section>;
  if (!loaded) return <section className="panel"><p className="muted">Loading settings…<span className="spinner" /></p></section>;

  const field = (sec, x) => (
    <label key={x.key} className="setting">
      <span>{x.label}</span>
      <input type="text" value={form[`${sec}.${x.key}`] || ''} onChange={set(`${sec}.${x.key}`)} placeholder={(loaded.defaults && loaded.defaults[x.key]) || 'Built-in value'} autoComplete="off" spellCheck="false" />
      {x.hint && <small>{x.hint}</small>}
    </label>
  );

  return (
    <section className="panel">
      <h2>Settings</h2>
      <p className="muted">Saved in n8n. An empty box uses the built-in value. Connection changes reach the Toast workflow within about a minute.</p>
      <form onSubmit={submit} className="settings-form">
        <h3>Staff PIN</h3>
        <div className="setting-grid">
          <label className="setting"><span>New PIN</span>
            <input type="password" value={newPin} onChange={(e) => { setNewPin(e.target.value); setDone(''); }} autoComplete="new-password" placeholder={loaded.pinChanged ? 'Leave empty to keep the current PIN' : 'Leave empty to keep the built-in PIN'} />
            <small>4 to 32 characters, no spaces. Numbers are easiest on a tablet.</small>
          </label>
          <label className="setting"><span>Confirm new PIN</span>
            <input type="password" value={confirmPin} onChange={(e) => { setConfirmPin(e.target.value); setDone(''); }} autoComplete="new-password" />
          </label>
        </div>

        <h3>GHL</h3>
        <div className="setting-grid">{TEXT_FIELDS.ghl.map((x) => field('ghl', x))}</div>

        <h3>Links and webhooks</h3>
        <div className="setting-grid">{TEXT_FIELDS.urls.map((x) => field('urls', x))}</div>

        <h3>Toast and perk rules</h3>
        <div className="setting-grid">{TEXT_FIELDS.toast.map((x) => field('toast', x))}</div>
        {JSON_FIELDS.map((x) => (
          <label key={x.key} className="setting">
            <span>{x.label}</span>
            <textarea rows={5} value={form[`toast.${x.key}`] || ''} onChange={set(`toast.${x.key}`)} placeholder={`Built-in rules. Example: ${x.example}`} spellCheck="false" />
          </label>
        ))}

        {errors.length > 0 && <ul className="error settings-errors">{errors.map((m) => <li key={m}>{m}</li>)}</ul>}
        {done && <p className="saved" role="status">{done}</p>}
        <div className="row">
          <button type="submit" disabled={busy}>{busy ? <>Saving…<span className="spinner" /></> : 'Save settings'}</button>
          {loaded.updatedAt && <span className="label">Last saved {new Date(loaded.updatedAt).toLocaleString('en-US')}</span>}
        </div>
      </form>
    </section>
  );
}
