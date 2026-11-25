import { useCallback, useEffect, useRef, useState } from 'react';
import { getCampaign, sendCampaignBatch, AuthError } from '../../bar-app/src/api.js';
import { dateTime } from '../../bar-app/src/format.js';

const TEXT_LABELS = ['Text 1', 'Text 2', 'Text 3'];
const POLL_MS = 15_000;

const pct = (n, total) => (total ? Math.min(100, Math.round((n / total) * 100)) : 0);

// Founders text campaign: the audience is split into batches; starting a batch tags its contacts, which starts the GHL texts.
// Only one batch a day can be started (the account sends at most 500 texts a day); the server enforces it too.
export default function Campaign({ pin, onAuthError }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(0); // the batch waiting for "Yes, start"
  const [starting, setStarting] = useState(0);
  const [notice, setNotice] = useState('');
  const live = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCampaign(pin);
      if (!live.current) return;
      if (!res || !Array.isArray(res.batches)) throw new Error('Unexpected answer from the server');
      setData(res);
      setError('');
    } catch (err) {
      if (err instanceof AuthError) return onAuthError();
      if (live.current) setError("Couldn't reach the server right now. Try Refresh in a moment.");
    } finally {
      if (live.current) setLoading(false);
    }
  }, [pin, onAuthError]);

  useEffect(() => {
    live.current = true;
    load();
    return () => { live.current = false; };
  }, [load]);

  // while a batch is being started, keep the numbers fresh
  const busy = !!(data && data.batches.some((b) => b.sending));
  useEffect(() => {
    if (!busy) return undefined;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [busy, load]);

  const start = async (batch) => {
    setStarting(batch);
    setError('');
    setNotice('');
    try {
      await sendCampaignBatch(pin, batch);
      setConfirming(0);
      setNotice(`Batch ${batch} is starting. The texts go out from GHL; the numbers below update as they are sent.`);
      await load();
    } catch (err) {
      if (err instanceof AuthError) return onAuthError();
      setError(err && err.message && !/^Server error|Unexpected/.test(err.message) ? err.message : "Couldn't start the batch. Check the numbers below before trying again.");
      setConfirming(0);
      load();
    } finally {
      setStarting(0);
    }
  };

  const batches = data ? data.batches : [];
  const totals = batches.reduce((a, b) => ({ people: a.people + b.total, started: a.started + (b.started ? 1 : 0), t1: a.t1 + (b.texts[0] || 0) }), { people: 0, started: 0, t1: 0 });
  const startedToday = batches.find((b) => b.started && b.startedDate === (data && data.today));

  return (
    <section className="panel">
      <div className="row">
        <h2>Founders text campaign</h2>
        <button className="secondary" onClick={load} disabled={loading}>{loading ? <>Loading…<span className="spinner" /></> : 'Refresh'}</button>
      </div>
      <p className="muted">
        Start one batch a day. Starting a batch queues its texts in GHL (Founders Essential Text Blast). Texts go out at most 500 a day, so each batch is under that limit.
      </p>

      {error && <p className="error">{error}</p>}
      {notice && <div className="notice">{notice}</div>}
      {!data && !error && <p className="muted">Loading…<span className="spinner" /></p>}

      {data && (
        <>
          <div className="summary two">
            <div className="mini"><strong>{totals.people.toLocaleString('en-US')}</strong><span className="label">People in the campaign</span></div>
            <div className="mini"><strong>{totals.started} of {batches.length}</strong><span className="label">Batches started</span></div>
          </div>
          {startedToday && <p className="muted">Batch {startedToday.batch} was started today, so the next batch can start tomorrow.</p>}

          <div className="batch-grid">
            {batches.map((b) => {
              const already = !b.started && b.texts[0] > 0;
              const locked = !b.started && !!startedToday;
              return (
                <div key={b.batch} className={`batch-card${b.started ? ' started' : ''}`}>
                  <div className="row">
                    <h3>Batch {b.batch}</h3>
                    <span className={`pill ${b.started ? (b.sending ? 'mug-requested' : 'mug-delivered') : 'mug-ordered'}`}>
                      {b.started ? (b.sending ? 'Starting…' : 'Started') : 'Not started'}
                    </span>
                  </div>
                  <p className="label">{b.total.toLocaleString('en-US')} members{b.started && b.startedAt ? ` · started ${dateTime(b.startedAt)}` : ''}</p>

                  {TEXT_LABELS.map((label, i) => (
                    <div key={label} className="bar-row">
                      <span className="label">{label}</span>
                      <div className="bar" aria-label={`${label} sent to ${b.texts[i] || 0} of ${b.total}`}><div style={{ width: `${pct(b.texts[i] || 0, b.total)}%` }} /></div>
                      <span className="label nowrap">{b.texts[i] || 0}</span>
                    </div>
                  ))}

                  {already && <p className="warn-text">{b.texts[0]} of these members already received Text 1 in an earlier send. Starting this batch texts them again.</p>}

                  {!b.started && confirming !== b.batch && (
                    <button onClick={() => { setConfirming(b.batch); setError(''); setNotice(''); }} disabled={locked || !!starting || b.total === 0}>
                      {locked ? 'Available tomorrow' : `Start batch ${b.batch}`}
                    </button>
                  )}
                  {!b.started && confirming === b.batch && (
                    <div className="confirm">
                      <p>Text {b.total.toLocaleString('en-US')} members now? This cannot be undone.</p>
                      <div className="row">
                        <button className="secondary" onClick={() => setConfirming(0)} disabled={!!starting}>Cancel</button>
                        <button onClick={() => start(b.batch)} disabled={!!starting}>{starting === b.batch ? <>Starting…<span className="spinner" /></> : 'Yes, start'}</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="label">Updated {dateTime(data.updatedAt)}. The bars count members the GHL workflow has already texted.</p>
        </>
      )}
    </section>
  );
}
