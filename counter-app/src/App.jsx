import { useCallback, useEffect, useState } from 'react';
import { DEMO, clearCache } from '../../bar-app/src/api.js';
import { clock, monthName } from '../../bar-app/src/format.js';
import useMembers from './useMembers.js';
import Login from './Login.jsx';
import Counter from './Counter.jsx';
import Activity from './Activity.jsx';
import Reminders from './Reminders.jsx';

const TABS = [
  { key: 'counter', label: 'Member counter' },
  { key: 'activity', label: 'Activity' },
  { key: 'reminders', label: 'Reminders' },
];

const PIN_KEY = 'counter-pin';

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
  return <Dashboard pin={pin} onLock={lock} />;
}

function Dashboard({ pin, onLock }) {
  const [tab, setTab] = useState('counter');
  const [focus, setFocus] = useState(null); // a mug number to open on the counter tab
  const state = useMembers(pin, onLock);
  const { data, loading } = state;

  const freePours = data ? data.members.filter((m) => m.perks.some((p) => p.key === 'free_pour' && p.used)).length : '–';
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
            <strong>{data ? data.members.length.toLocaleString('en-US') : '–'}</strong>
          </div>
          <div className="stat">
            <span className="label">Free pours used this month</span>
            <strong>{freePours}</strong>
          </div>
          <div className="stat">
            <span className="label">Benefit period · Mountain time</span>
            <strong className="period">{data ? monthName(data.period) : '–'}</strong>
          </div>
        </div>

        {tab === 'counter' && <Counter pin={pin} onAuthError={onLock} state={state} focus={focus} clearFocus={clearFocus} />}
        {tab === 'activity' && <Activity pin={pin} onAuthError={onLock} onOpenMember={openMember} />}
        {tab === 'reminders' && <Reminders pin={pin} onAuthError={onLock} onOpenMember={openMember} />}

        <footer>Craft Mountain Community · Powered by Archimedes Hospitality</footer>
      </main>
    </>
  );
}
