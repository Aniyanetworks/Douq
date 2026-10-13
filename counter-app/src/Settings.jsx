import { useEffect, useState } from 'react';
import { withRetry, getSettings, saveSettings, AuthError } from '../../bar-app/src/api.js';

const TEXT_FIELDS = {
  ghl: [
    { key: 'locationId', label: 'GHL location ID', hint: 'Your GHL sub-account ID: the long code after /location/ in the GHL address bar.' },
    { key: 'memberTag', label: 'Member tag', hint: 'Only contacts with this tag count as Mug Club members. Guests without it are not listed or reminded.' },
    { key: 'mugNumberFieldId', label: 'Mug number field ID', hint: 'ID of the "Mug Number" custom field in GHL. The "Helper - List GHL Custom Field IDs" workflow in n8n lists every ID.' },
    { key: 'mugStatusFieldId', label: 'Mug status field ID', hint: 'ID of the "Mug Status" dropdown field in GHL (Requested, Ordered, Received, Delivered, Cancelled).' },
  ],
  urls: [
    { key: 'signupFormUrl', label: 'Member signup form link', hint: 'The GHL form guests fill in to join. Used by the New member button (QR code and form). Must start with https://' },
    { key: 'alertWebhookUrl', label: 'Alert webhook (GHL)', hint: 'GHL workflow webhook that receives perk alerts such as a double use or an unknown mug number. Must start with https://' },
    { key: 'newMemberWebhookUrl', label: 'New member webhook (n8n)', hint: 'Production URL of the "New Member Mug Number" workflow, which gives a new member their mug number. Must start with https://' },
  ],
  toast: [{ key: 'restaurantGuid', label: 'Toast restaurant GUID', hint: 'Identifies your restaurant in Toast. Orders from any other restaurant are ignored. Find it in Toast Web under Integrations, API access.' }],
};

const JSON_FIELDS = [
  { key: 'benefits', label: 'Toast item GUID → perk key', example: '{ "e9a3cfc6-...": "free_pour" }',
    hint: 'Which Toast menu items or discounts count as which perk. Left: the item or discount GUID from Toast. Right: the perk key (free_pour, four_pack, initial_pour, mug, merch or member_mug).' },
  { key: 'benefitKinds', label: 'Perk rules (monthly, once or log)', example: '{ "free_pour": "monthly", "mug": "log" }',
    hint: 'How each perk behaves. monthly: once a month, resets on the 1st. once: one time only. log: unlimited, every use is counted and noted but never blocked.' },
  { key: 'benefitLabels', label: 'Perk names shown in logs', example: '{ "free_pour": "Free Monthly Pour" }',
    hint: 'The name shown for each perk key in the Activity log, member notes and alerts. The report and perk cards match perks by these names, so change them with care.' },
];

const pretty = (v) => JSON.stringify(v, null, 2);
// What a box shows: the saved value, or the built-in one while nothing was saved
const toForm = (settings, defaults = {}) => {
  const f = {};
  for (const [sec, fields] of Object.entries(TEXT_FIELDS)) for (const x of fields) f[`${sec}.${x.key}`] = (settings[sec] && settings[sec][x.key]) || defaults[x.key] || '';
  for (const x of JSON_FIELDS) {
    const v = (settings.toast && settings.toast[x.key]) || defaults[x.key];
    f[`toast.${x.key}`] = v ? pretty(v) : '';
  }
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
        setForm(toForm(res.settings, res.defaults));
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
    for (const [sec, fields] of Object.entries(TEXT_FIELDS)) for (const x of fields) {
      const v = (form[`${sec}.${x.key}`] || '').trim();
      settings[sec][x.key] = v === ((loaded.defaults || {})[x.key] || '') ? '' : v; // the built-in value is not saved as a change
    }
    for (const x of JSON_FIELDS) {
      const text = (form[`toast.${x.key}`] || '').trim();
      if (!text) { settings.toast[x.key] = ''; continue; }
      try {
        const parsed = JSON.parse(text);
        const builtIn = (loaded.defaults || {})[x.key];
        settings.toast[x.key] = builtIn && pretty(parsed) === pretty(builtIn) ? '' : parsed;
      } catch { problems.push(`${x.label} is not valid JSON.`); }
    }
    if (problems.length) return setErrors(problems);
    setBusy(true);
    try {
      const res = await saveSettings(pin, settings, newPin);
      if (!res.ok) return setErrors(res.errors || ['The settings were not saved.']);
      setLoaded(res);
      setForm(toForm(res.settings, res.defaults));
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
      <input type="text" value={form[`${sec}.${x.key}`] || ''} onChange={set(`${sec}.${x.key}`)} placeholder="Not set" autoComplete="off" spellCheck="false" />
      {x.hint && <small>{x.hint}</small>}
    </label>
  );

  return (
    <section className="panel">
      <h2>Settings</h2>
      <p className="muted">Saved in n8n. The boxes show the values in use now. Changes to the Toast and GHL values reach live Toast orders within about a minute, so check them before saving.</p>
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
            <textarea rows={8} value={form[`toast.${x.key}`] || ''} onChange={set(`toast.${x.key}`)} placeholder={`Example: ${x.example}`} spellCheck="false" />
            <small>{x.hint}</small>
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
