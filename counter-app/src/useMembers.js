import { useCallback, useEffect, useRef, useState } from 'react';
import { withRetry, getMembers, AuthError, readCache, cacheKey } from '../../bar-app/src/api.js';

const REFRESH_MS = 60_000;

// The member list: the last copy from this browser shows at once, a fresh one loads in the background every minute.
export default function useMembers(pin, onAuthError) {
  const [data, setData] = useState(() => readCache(cacheKey.members())?.data ?? null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const hadData = useRef(data !== null); // a list from this browser is already on screen: refresh it quietly
  const busy = useRef(false); // a refresh (with its retries) that is still running is never started a second time

  // silent: the automatic refresh every minute changes the list without any loading indicator
  const load = useCallback(async (silent = false) => {
    if (busy.current) return;
    busy.current = true;
    if (!silent) setLoading(true);
    try {
      setData(await withRetry(() => getMembers(pin)));
      setError('');
    } catch (err) {
      if (err instanceof AuthError) return onAuthError();
      setError("Can't reach the server right now. Showing the last list.");
    } finally {
      if (!silent) setLoading(false);
      busy.current = false;
    }
  }, [pin, onAuthError]);

  useEffect(() => {
    load(hadData.current);
    const t = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // Changes one member in the list (used after a mug status is saved)
  const patch = useCallback((id, changes) => {
    setData((d) => d && { ...d, members: d.members.map((m) => (m.id === id ? { ...m, ...changes } : m)) });
  }, []);

  return { data, error, loading, reload: () => load(false), patch };
}
