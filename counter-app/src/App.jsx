import { useCallback, useEffect, useState } from 'react';
import { DEMO, clearCache, getLog, getSettings, withRetry, AuthError, UNLIMITED_PERKS } from '../../bar-app/src/api.js';
import { clock, monthName, todayYmd } from '../../bar-app/src/format.js';
import useMembers from './useMembers.js';
import Login from './Login.jsx';
import Counter from './Counter.jsx';
import Activity from './Activity.jsx';
import Graphs from './Graphs.jsx';
import Settings from './Settings.jsx';
import Intake from './Intake.jsx';
import Reminders from './Reminders.jsx';

const TABS = [
  { key: 'counter', label: 'Member counter' },
  { key: 'activity', label: 'Activity' },
  { key: 'graphs', label: 'Graphs' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'settings', label: 'Settings' },
];

const PIN_KEY = 'counter-pin';

// This month's uses of each unlimited perk, counted from the perk log (a voided item is not a use)
function useMonthlyUses(pin, onLock) {
  const [uses, setUses] = useState(null);
  useEffect(() => {
    let live = true;
    const to = todayYmd();
    withRetry(() => getLog(pin, `${to.slice(0, 8)}01`, to, { maxAge: 60_000 }), { cancelled: () => !live })
      .then((res) => {
        if (!live) return;
        const c = {};
        for (const r of res.log || []) if (r.event === 'used' || r.event === 'redeem') c[r.perk] = (c[r.perk] || 0) + 1;
        setUses(c);
      })
      .catch((err) => { if (live && err instanceof AuthError) onLock(); else if (live) setUses({}); });
    return () => { live = false; };
  }, [pin, onLock]);
  return uses;
}

// The PIN is kept for this browser tab only, so closing the tab locks the site.
const readPin = () => {
  try { return sessionStorage.getItem(PIN_KEY) || ''; } catch { return ''; }
};
const writePin = (pin) => {
  try { pin ? sessionStorage.setItem(PIN_KEY, pin) : sessionStorage.removeItem(PIN_KEY); } catch { /* storage blocked */ }
};

export default function App() {
  const [pin, setPin] = useState(readPin);
  const unlock = (p) => { writePin(p); setPin(p); };
  const lock = useCallback(() => { clearCache(); writePin(''); setPin(''); }, []);

  if (!pin) return <Login onUnlock={unlock} />;
  return <Dashboard pin={pin} onLock={lock} onPinChange={unlock} />;
}

function Dashboard({ pin, onLock, onPinChange }) {
  const [tab, setTab] = useState('counter');
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [signupUrl, setSignupUrl] = useState(''); // the GHL signup form, saved on the Settings tab
  useEffect(() => {
    let live = true;
    getSettings(pin).then((r) => { if (live) setSignupUrl((r && r.settings && r.settings.urls && r.settings.urls.signupFormUrl) || ''); }).catch(() => {});
    return () => { live = false; };
  }, [pin]);
  const [focus, setFocus] = useState(null); // a mug number to open on the counter tab
  const state = useMembers(pin, onLock);
  const { data, loading } = state;

  const monthlyUsed = (key) => (data ? data.members.filter((m) => m.perks.some((p) => p.key === key && p.used)).length : '–');
  const total = data ? data.members.length : 0;
  const uses = useMonthlyUses(pin, onLock);
  const unlimitedUses = (key) => {
    const u = UNLIMITED_PERKS.find((x) => x.key === key);
    return uses ? (uses[u.label] || 0) : '–';
  };
  const clearFocus = useCallback(() => setFocus(null), []);
  const openMember = (mug) => { setFocus(String(mug)); setTab('counter'); };

  // Full screen (not available on iPhone Safari, so the button is hidden there)
  const [full, setFull] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const sync = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggleFull = () => {
    const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    if (p && p.catch) p.catch(() => {});
  };

  return (
    <>
      {loading && <div className="progress" role="progressbar" aria-label="Loading" />}
      <header>
        <div className="brand">
          Craft Mountain
          <small>BREWING · MEMBER COUNTER</small>
        </div>
        <div className="header-actions">
          <span className="pill">Staff dashboard</span>
          {document.documentElement.requestFullscreen && (
            <button className="icon-btn" onClick={toggleFull} title={full ? 'Exit full screen' : 'Full screen'} aria-label={full ? 'Exit full screen' : 'Full screen'}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {full ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
              </svg>
            </button>
          )}
          <button className="header-btn" onClick={() => setIntakeOpen(true)}>New member</button>
          <button className="header-btn" onClick={onLock}>Lock</button>
        </div>
      </header>

      <main>
        <div className="row">
          <div>
            <h1>A better way to serve your members.</h1>
            <p className="lead">Member benefits, mug orders and a clear record at the counter.</p>
          </div>
          <div className="refresh">
            <span className="label">{data ? `Updated ${clock(data.updatedAt)}` : 'Loading members…'}</span>
            <button className="secondary" onClick={state.reload} disabled={loading}>{loading ? <>Loading…<span className="spinner" /></> : 'Refresh'}</button>
          </div>
        </div>

        {DEMO && (
          <div className="notice">
            <b>Demonstration – sample members.</b> VITE_API_URL is not set, so GHL is not connected (PIN 1234).
          </div>
        )}

        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'selected' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </nav>

        <div className="stats">
          <div className="stat">
            <span className="label">Active members</span>
            <strong>{data ? total.toLocaleString('en-US') : '–'}</strong>
          </div>
          <div className="stat">
            <span className="label">Free pours used this month</span>
            <strong>{monthlyUsed('free_pour')}</strong>
            <span className="sub">{data ? `of ${total.toLocaleString('en-US')} members · once a month` : ''}</span>
          </div>
          <div className="stat">
            <span className="label">4-Packs used this month</span>
            <strong>{monthlyUsed('four_pack')}</strong>
            <span className="sub">{data ? `of ${total.toLocaleString('en-US')} members · once a month` : ''}</span>
          </div>
          <div className="stat">
            <span className="label">Mug pricing uses this month</span>
            <strong>{unlimitedUses('mug')}</strong>
            <span className="sub">Unlimited · any visit</span>
          </div>
          <div className="stat">
            <span className="label">Merchandise 10% uses this month</span>
            <strong>{unlimitedUses('merch')}</strong>
            <span className="sub">Unlimited · any visit</span>
          </div>
          <div className="stat">
            <span className="label">Benefit period · Mountain time</span>
            <strong className="period">{data ? monthName(data.period) : '–'}</strong>
            <span className="sub">Monthly perks reset on the 1st</span>
          </div>
        </div>

        {tab === 'counter' && <Counter pin={pin} onAuthError={onLock} state={state} focus={focus} clearFocus={clearFocus} />}
        {tab === 'activity' && <Activity pin={pin} onAuthError={onLock} onOpenMember={openMember} />}
        {tab === 'graphs' && <Graphs pin={pin} onAuthError={onLock} />}
        {tab === 'settings' && <Settings pin={pin} onAuthError={onLock} onPinChanged={onPinChange} onSaved={(sv) => setSignupUrl((sv.urls && sv.urls.signupFormUrl) || '')} />}
        {tab === 'reminders' && <Reminders pin={pin} onAuthError={onLock} onOpenMember={openMember} />}

        <Intake open={intakeOpen} url={signupUrl} onClose={() => setIntakeOpen(false)} onOpenSettings={() => { setIntakeOpen(false); setTab('settings'); }} />

        <footer>Craft Mountain Community · Powered by Archimedes Hospitality</footer>
      </main>
    </>
  );
}
