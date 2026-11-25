import { useCallback, useEffect, useRef, useState } from 'react';
import { getCampaign, sendCampaignBatch, sendCampaignTest, newCampaignBatch, AuthError } from '../../bar-app/src/api.js';
import { dateTime } from '../../bar-app/src/format.js';

const TEXT_LABELS = ['Text 1', 'Text 2', 'Text 3'];
const POLL_MS = 15_000;
const DEFAULT_TEST = { email: 'test.user01@mail.com', phone: '+1 437-529-3053' };

const pct = (n, total) => (total ? Math.min(100, Math.round((n / total) * 100)) : 0);
const readable = (err, fallback) => (err && err.message && !/^Server error|Unexpected/.test(err.message) ? err.message : fallback);

// Founders text campaign: the audience is split into batches; starting a batch tags its contacts, which starts the GHL texts.
// Only one batch a day can be started (the account sends at most 500 texts a day); the server enforces it too.
export default function Campaign({ pin, onAuthError }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const live = useRef(true);

  // popups
  const testDialog = useRef(null);
  const freshDialog = useRef(null);
  const startDialog = useRef(null);
  const [testTo, setTestTo] = useState(DEFAULT_TEST);
  const [testBusy, setTestBusy] = useState(false);
  const [testError, setTestError] = useState('');
  const [fresh, setFresh] = useState(null); // { checking } | { available, max, size } | { creating, available, max, size }
  const [freshError, setFreshError] = useState('');
  const [starting, setStarting] = useState(null); // the batch waiting for "Yes, start"
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState('');

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

  // ----- send a test
  const openTest = () => {
    setTestError('');
    testDialog.current.showModal();
  };
  const runTest = async (e) => {
    e.preventDefault();
    setTestBusy(true);
    setTestError('');
    try {
      const res = await sendCampaignTest(pin, testTo);
      testDialog.current.close();
      setNotice(`Test started for ${(res.tested || []).join(', ') || 'the test contact'}. Text 1 goes out now; the next texts follow the workflow's schedule.`);
    } catch (err) {
      if (err instanceof AuthError) return onAuthError();
      setTestError(readable(err, 'Could not start the test. Please try again.'));
    } finally {
      setTestBusy(false);
    }
  };

  // ----- new batch
  const openFresh = async () => {
    setFresh({ checking: true });
    setFreshError('');
    freshDialog.current.showModal();
    try {
      const res = await newCampaignBatch(pin, { preview: true });
      const max = res.max || 490;
      setFresh({ available: res.available, max, size: Math.min(res.available, 480) });
    } catch (err) {
      if (err instanceof AuthError) return onAuthError();
      setFresh(null);
      setFreshError(readable(err, 'Could not check for new contacts. Please try again.'));
    }
  };
  const createFresh = async (e) => {
    e.preventDefault();
    const size = Math.max(1, Math.min(fresh.size, fresh.available, fresh.max));
    setFresh({ ...fresh, creating: true });
    setFreshError('');
    try {
      const res = await newCampaignBatch(pin, { size });
      freshDialog.current.close();
      setNotice(res.created ? `Batch ${res.batch} created with ${res.count} members. Tagging takes a minute or two; press Refresh to see the final count.` : 'No contacts were available for a new batch.');
      await load();
    } catch (err) {
      if (err instanceof AuthError) return onAuthError();
      setFresh({ available: fresh.available, max: fresh.max, size: fresh.size });
      setFreshError(readable(err, 'Could not create the batch. Please try again.'));
    }
  };

  // ----- start a batch
  const askStart = (b) => {
    setStarting(b);
    setStartError('');
    startDialog.current.showModal();
  };
  const start = async () => {
    setStartBusy(true);
    setStartError('');
    try {
      await sendCampaignBatch(pin, starting.batch);
      startDialog.current.close();
      setNotice(`Batch ${starting.batch} is starting. The texts go out from GHL; the numbers below update as they are sent.`);
      await load();
    } catch (err) {
      if (err instanceof AuthError) return onAuthError();
      setStartError(readable(err, "Couldn't start the batch. Check the numbers before trying again."));
      load();
    } finally {
      setStartBusy(false);
    }
  };

  const batches = data ? data.batches : [];
  const people = batches.reduce((a, b) => a + b.total, 0);
  const startedCount = batches.filter((b) => b.started).length;
  const startedToday = batches.find((b) => b.started && b.startedDate === (data && data.today));

  return (
    <section className="panel">
      <div className="row">
        <h2>Founders text campaign</h2>
        <div className="row campaign-actions">
          <button className="secondary" onClick={openTest}>Send test</button>
          <button className="secondary" onClick={openFresh}>New batch</button>
          <button className="secondary" onClick={load} disabled={loading}>{loading ? <>Loading…<span className="spinner" /></> : 'Refresh'}</button>
        </div>
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
            <div className="mini"><strong>{people.toLocaleString('en-US')}</strong><span className="label">People in the campaign</span></div>
            <div className="mini"><strong>{startedCount} of {batches.length}</strong><span className="label">Batches started</span></div>
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

                  {already && <p className="warn-text">{b.texts[0]} of these members already received Text 1 in an earlier send.</p>}

                  {!b.started && (
                    <button onClick={() => askStart(b)} disabled={locked || b.total === 0}>
                      {locked ? 'Available tomorrow' : `Start batch ${b.batch}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="label">Updated {dateTime(data.updatedAt)}. The bars count members the GHL workflow has already texted.</p>
        </>
      )}

      {/* Send a test */}
      <dialog ref={testDialog} className="member-dialog">
        <form className="member-edit" onSubmit={runTest}>
          <h2>Send a test</h2>
          <p className="label">Starts the same texts for one test contact only, before you start a real batch. Use a number whose owner agreed to get the texts.</p>
          <label>Test email
            <input type="email" required value={testTo.email} disabled={testBusy} onChange={(e) => setTestTo({ ...testTo, email: e.target.value })} />
          </label>
          <label>Test phone
            <input type="tel" required value={testTo.phone} disabled={testBusy} placeholder="+1 555 123 4567" onChange={(e) => setTestTo({ ...testTo, phone: e.target.value })} />
          </label>
          {testError && <p className="error">{testError}</p>}
          <div className="row">
            <button type="button" className="secondary" disabled={testBusy} onClick={() => testDialog.current.close()}>Cancel</button>
            <button type="submit" disabled={testBusy}>{testBusy ? <>Sending…<span className="spinner" /></> : 'Send test'}</button>
          </div>
        </form>
      </dialog>

      {/* New batch */}
      <dialog ref={freshDialog} className="member-dialog" onClose={() => { setFresh(null); setFreshError(''); }}>
        <form className="member-edit" onSubmit={createFresh}>
          <h2>New batch</h2>
          <p className="label">Makes a batch from members who are not in a batch yet, for example new signups.</p>
          {fresh && fresh.checking && <p className="muted">Checking for new contacts…<span className="spinner" /></p>}
          {fresh && fresh.available === 0 && <p>Everyone who can be texted is already in a batch.</p>}
          {fresh && fresh.available > 0 && (
            <>
              <p><b>{fresh.available.toLocaleString('en-US')}</b> members are not in a batch yet.</p>
              <label>Members in the new batch (up to {Math.min(fresh.available, fresh.max)})
                <input type="number" min="1" max={Math.min(fresh.available, fresh.max)} value={fresh.size} disabled={!!fresh.creating} onChange={(e) => setFresh({ ...fresh, size: Number(e.target.value) })} />
              </label>
            </>
          )}
          {freshError && <p className="error">{freshError}</p>}
          <div className="row">
            <button type="button" className="secondary" disabled={!!(fresh && fresh.creating)} onClick={() => freshDialog.current.close()}>{fresh && fresh.available > 0 ? 'Cancel' : 'Close'}</button>
            {fresh && fresh.available > 0 && (
              <button type="submit" disabled={!!fresh.creating || !(fresh.size >= 1)}>{fresh.creating ? <>Creating…<span className="spinner" /></> : 'Create batch'}</button>
            )}
          </div>
        </form>
      </dialog>

      {/* Start a batch */}
      <dialog ref={startDialog} className="member-dialog" onClose={() => setStarting(null)}>
        <div className="member-edit">
          <h2>Start batch {starting ? starting.batch : ''}?</h2>
          <p>This texts <b>{starting ? starting.total.toLocaleString('en-US') : 0} members</b> now. It cannot be undone.</p>
          {starting && starting.texts[0] > 0 && <p className="warn-text">{starting.texts[0]} of these members already received Text 1 in an earlier send. Starting this batch texts them again.</p>}
          {startError && <p className="error">{startError}</p>}
          <div className="row">
            <button type="button" className="secondary" disabled={startBusy} onClick={() => startDialog.current.close()}>Cancel</button>
            <button type="button" disabled={startBusy} onClick={start}>{startBusy ? <>Starting…<span className="spinner" /></> : 'Yes, start'}</button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
