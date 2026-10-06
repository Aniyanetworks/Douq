import { useCallback, useEffect, useState } from 'react';
import { DEMO, clearCache } from './api.js';
import Login from './Login.jsx';
import Members from './Members.jsx';
import Log from './Log.jsx';
import Reminders from './Reminders.jsx';
import logo from './assets/logo.png';

const TABS = [
  { key: 'members', label: 'Members', Page: Members },
  { key: 'log', label: 'Log', Page: Log },
  { key: 'reminders', label: 'Reminders', Page: Reminders },
];

const PIN_KEY = 'mugclub-pin';

// The PIN is kept for this browser tab only, so closing the tab locks the site.
const readPin = () => {
  try { return sessionStorage.getItem(PIN_KEY) || ''; } catch { return ''; }
};
const writePin = (pin) => {
  try { pin ? sessionStorage.setItem(PIN_KEY, pin) : sessionStorage.removeItem(PIN_KEY); } catch { /* storage blocked */ }
};

export default function App() {
  const [pin, setPin] = useState(readPin);
  const [tab, setTab] = useState('members');

  const unlock = (p) => { writePin(p); setPin(p); };
  const lock = useCallback(() => { clearCache(); writePin(''); setPin(''); }, []);

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

  if (!pin) return <Login onUnlock={unlock} />;
  const { Page } = TABS.find((t) => t.key === tab);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo-chip"><img src={logo} alt="Craft Mountain" /></span>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </nav>
        {document.documentElement.requestFullscreen && (
          <button
            className="fs-btn"
            onClick={toggleFull}
            title={full ? 'Exit full screen' : 'Full screen'}
            aria-label={full ? 'Exit full screen' : 'Full screen'}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {full
                ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
            </svg>
          </button>
        )}
        <button className="lock" onClick={lock}>Lock</button>
      </header>
      {DEMO && <div className="demo">Demo data – set VITE_API_URL to connect to GHL</div>}
      <main>
        <Page pin={pin} onAuthError={lock} />
      </main>
    </div>
  );
}
