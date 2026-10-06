import { useCallback, useState } from 'react';
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
        <button className="lock" onClick={lock}>Lock</button>
      </header>
      {DEMO && <div className="demo">Demo data – set VITE_API_URL to connect to GHL</div>}
      <main>
        <Page pin={pin} onAuthError={lock} />
      </main>
    </div>
  );
}
