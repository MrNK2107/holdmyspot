import { useEffect, useState } from 'react';
import { type PublicInfo, wsPath, fmtDay, fmtTime, getZone, localMidnight, relDay, setZone, usd } from './api';
import { Icon } from './Icon';
import { portalLink, recallClient, rememberClient } from './Portal';

/** The link in the owner's Instagram bio. Mobile-first. */
export function BookingPage({ ws }: { ws: string }) {
  const [s, setS] = useState<PublicInfo | null>(null);
  const [service, setService] = useState('');
  const [slots, setSlots] = useState<number[]>([]);
  const [start, setStart] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [booked, setBooked] = useState<{ id: string; start?: number; orderId?: string; approvalLink?: string; authorizationId?: string; state: string; clientToken?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [sending, setSending] = useState(false);
  // PayPal's approval page redirects back with ?approved=1 (see the server's /paypal/return)
  const client = recallClient(ws);
  const lastVisit = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(`hms-last:${ws}`) ?? 'null') as { service?: string; start?: number } | null;
    } catch {
      return null;
    }
  })();
  const returnedFromPayPal = new URLSearchParams(location.search).get('approved') === '1';

  useEffect(() => {
    fetch(wsPath(ws, '/public'))
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
        return r.json();
      })
      .then((x: PublicInfo) => {
        setZone(x.timeZone);
        setS(x);
        // the studio's own first service, not a fixed one
        setService((cur) => (x.services.some((v) => v.id === cur) ? cur : x.services[0]?.id ?? ''));
      })
      .catch((e) => setLoadError((e as Error).message));
  }, [ws]);
  useEffect(() => {
    if (!service) {
      setSlots([]);
      setSlotsLoading(false);
      return;
    }
    setStart(null);
    setSlotsLoading(true);
    fetch(wsPath(ws, `/slots?service=${encodeURIComponent(service)}&n=24`))
      .then((r) => r.json())
      .then((x) => setSlots(Array.isArray(x) ? x : []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [ws, service, booked]);

  if (!s) {
    return loadError ? (
      <main className="book">
        <section className="book-card" role="alert">
          <h1 className="book-title">This booking link isn’t working</h1>
          <p className="muted">{loadError}. Ask the studio for a fresh link.</p>
        </section>
      </main>
    ) : (
      <div className="loading" role="status" aria-live="polite">
        <span className="spinner" aria-hidden /> Loading available times…
      </div>
    );
  }
  const svc = s.services;
  const hold = s.policy.rules.holdCents;

  const post = async (url: string, body?: unknown) => {
    setError(null);
    setSending(true);
    try {
      const r = await fetch(url, { method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      setBooked(j.result);
      if (j.result?.clientToken) {
        rememberClient(ws, j.result.clientToken, name);
        try {
          sessionStorage.setItem(`hms-last:${ws}`, JSON.stringify({ service: svc.find((x) => x.id === service)?.name, start: j.result.start }));
        } catch {
          /* private window: the confirmation is just less specific */
        }
      }
    } catch (e) {
      setError(`${(e as Error).message}. Nothing was held; please try again.`);
    } finally {
      setSending(false);
    }
  };
  const book = () => post(wsPath(ws, '/book'), { name, serviceId: service, start });
  const approve = () => {
    const token = booked?.approvalLink?.split('/').at(-1);
    if (token) return post(wsPath(ws, `/sim/approve/${encodeURIComponent(token)}`));
  };

  return (
    <main className="book">
      <header className="book-head">
        <div className="book-avatar" aria-hidden>
          {(s.business.trim()[0] ?? '•').toUpperCase()}
        </div>
        <div>
          <h1 className="book-title">{s.business}</h1>
          <p className="muted">Book a visit in a minute</p>
        </div>
      </header>

      {!booked && returnedFromPayPal ? (
        // PayPal sent the browser back here: the booking itself is not in this page's memory any more, so confirm in general terms
        <section className="book-card done" role="status">
          <h2>You're booked</h2>
          {lastVisit?.start && (
            <p className="visit-line">
              <Icon name="calendar" size={18} />
              <strong>
                {lastVisit.service ? `${lastVisit.service}, ` : ''}
                {relDay(lastVisit.start, Date.now())} at {fmtTime(lastVisit.start)}
              </strong>
            </p>
          )}
          <p>PayPal approved the hold. It is not a charge: it only reserves {usd(hold)} until your visit.</p>
          <p className="muted">{s.owner} sees your visit on the schedule.</p>
          <div className="actions">
            {client && (
              <a className="button primary" href={portalLink(ws, client.token)}>
                See my visit or message {s.owner}
              </a>
            )}
            <a className="button" href={`/book?ws=${encodeURIComponent(ws)}`}>
              Book another visit
            </a>
          </div>
        </section>
      ) : booked?.state === 'HELD' || booked?.state === 'VAULTED' ? (
        <section className="book-card done">
          <h2>You're booked</h2>
          <p>
            {svc.find((x) => x.id === service)?.name}, {booked.start ? `${fmtDay(booked.start)} at ${fmtTime(booked.start)}` : ''}.
          </p>
          <p className="muted">
            {booked.state === 'HELD'
              ? `PayPal is holding ${usd(hold)}. It is not a charge.`
              : `Your PayPal is saved. We'll place a ${usd(hold)} hold 3 days before your visit; it is not a charge.`}{' '}
            Questions or changes? Message {s.owner} from your private page.
          </p>
          {booked.clientToken && (
            <a className="button" href={portalLink(ws, booked.clientToken)}>
              Open my page
            </a>
          )}
          {booked.authorizationId && (
            <p className="muted small">
              PayPal authorization <code>{booked.authorizationId}</code>
            </p>
          )}
        </section>
      ) : booked ? (
        <section className="book-card">
          <h2>One last step</h2>
          <p>Approve with PayPal to keep your spot. Nothing is charged today.</p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {s.paymentsMode === 'mock' ? (
            <>
              <button className="paypal wide" onClick={approve} disabled={sending}>
                {sending ? 'Approving…' : 'Approve with PayPal'}
              </button>
              <p className="muted small">Sandbox simulator: no real money moves.</p>
            </>
          ) : (
            <a className="paypal wide" href={booked.approvalLink}>
              Continue to PayPal
            </a>
          )}
        </section>
      ) : (
        <>
          <section className="book-card">
            <h2>1. Pick a service</h2>
            <div className="svc-list">
              {svc.map((x) => (
                <button key={x.id} aria-pressed={service === x.id} className={service === x.id ? 'svc on' : 'svc'} onClick={() => setService(x.id)}>
                  <span>{x.name}</span>
                  <span className="muted small">
                    {x.durationMin} min · {usd(x.priceCents)}
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="book-card">
            <h2>2. Pick a time</h2>
            <p className="muted small">Times are in {getZone().replace('_', ' ')}.</p>
            {groupByDay(slots).map(({ day, times }) => (
              <div key={day} className="slot-day">
                <div className="slot-day-h">{relDay(times[0], Date.now())}</div>
                <div className="slot-list">
                  {times.map((t) => (
                    <button key={t} aria-pressed={start === t} className={start === t ? 'slot on' : 'slot'} onClick={() => setStart(t)}>
                      <strong>{fmtTime(t)}</strong>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {slotsLoading && <p className="muted">Finding free times…</p>}
            {!slotsLoading && !service && <p className="muted">This studio has not added any services yet. Please check back soon.</p>}
            {!slotsLoading && !!service && slots.length === 0 && <p className="muted">No free times in the next 7 days. Message {s.owner} to ask for one.</p>}
          </section>
          <section className="book-card">
            <h2>3. The fair-cancellation deal</h2>
            <p className="summary">{s.policy.summary}</p>
            <label className="field">
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" />
            </label>
            <label className="check">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                I agree that {s.business} may hold up to {usd(hold)} on my PayPal for this visit, and charge it only as the policy above says.
              </span>
            </label>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button className="paypal wide" disabled={!start || !name.trim() || !agree || sending} onClick={book}>
              {sending ? 'Booking…' : 'Book and approve with PayPal'}
            </button>
            {(!start || !name.trim() || !agree) && (
              <p className="muted small">{!start ? 'Pick a time' : !name.trim() ? 'Add your name' : 'Tick the hold agreement'} to continue.</p>
            )}
            <p className="muted small">Policy v{s.policy.version} · {s.policy.hash.slice(0, 8)}</p>
          </section>
        </>
      )}
    </main>
  );
}

/** Free times grouped by the studio's local day, in order. */
function groupByDay(slots: number[]): Array<{ day: number; times: number[] }> {
  const out: Array<{ day: number; times: number[] }> = [];
  for (const t of slots) {
    const day = localMidnight(t);
    const last = out[out.length - 1];
    if (last && last.day === day) last.times.push(t);
    else out.push({ day, times: [t] });
  }
  return out;
}
