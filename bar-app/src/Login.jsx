import { useState } from 'react';
import { getMembers, AuthError, DEMO } from './api.js';

export default function Login({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!pin) return;
    setBusy(true);
    setError('');
    try {
      await getMembers(pin); // checks the PIN against n8n
      onUnlock(pin);
    } catch (err) {
      setError(err instanceof AuthError ? 'Wrong PIN – try again.' : `Can't reach the server (${err.message}).`);
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form onSubmit={submit} className="login-card">
        <h1>Craft Mountain<br /><span>Mug Club</span></h1>
        <label htmlFor="pin">Staff PIN</label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || !pin}>{busy ? 'Checking…' : 'Unlock'}</button>
        {DEMO && <p className="hint">Demo mode – PIN is 1234</p>}
      </form>
    </div>
  );
}
