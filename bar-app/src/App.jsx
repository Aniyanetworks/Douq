import { useCallback, useState } from 'react';
import { DEMO } from './api.js';
import Login from './Login.jsx';
import Members from './Members.jsx';
import Log from './Log.jsx';

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
  const lock = useCallback(() => { writePin(''); setPin(''); }, []);

  if (!pin) return <Login onUnlock={unlock} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Craft Mountain <span>Mug Club</span>
        </div>
        <nav className="tabs">
          <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>Members</button>
          <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>Log</button>
        </nav>
        <button className="lock" onClick={lock}>Lock</button>
      </header>
      {DEMO && <div className="demo">Demo data – set VITE_API_URL to connect to GHL</div>}
      <main>
        {tab === 'members' ? <Members pin={pin} onAuthError={lock} /> : <Log pin={pin} onAuthError={lock} />}
      </main>
    </div>
  );
}
