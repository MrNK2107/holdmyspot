import { useEffect, useState } from 'react';
import { type Snapshot, fmtDay, fmtTime, usd } from './api';

/** The link in the owner's Instagram bio. Mobile-first. */
export function BookingPage({ ws }: { ws: string }) {
  const [s, setS] = useState<Snapshot | null>(null);
  const [service, setService] = useState('gel');
  const [slots, setSlots] = useState<number[]>([]);
  const [start, setStart] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [booked, setBooked] = useState<{ id: string; orderId?: string; approvalLink?: string; state: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/ws/${ws}/state`).then((r) => r.json()).then(setS);
  }, [ws]);
  useEffect(() => {
    setStart(null);
    fetch(`/api/ws/${ws}/slots?service=${service}&n=6`)
      .then((r) => r.json())
      .then((x) => setSlots(Array.isArray(x) ? x : []));
  }, [ws, service, booked]);

  if (!s) return <div className="loading">Loading…</div>;
  const svc = s.services;
  const hold = s.policy.rules.holdCents;

  const book = async () => {
    setError(null);
    const r = await fetch(`/api/ws/${ws}/book`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, serviceId: service, start }) });
    const j = await r.json();
    if (!r.ok) return setError(j.error);
    setBooked(j.result);
  };

  const approve = async () => {
    const token = booked?.approvalLink?.split('/').at(-1);
    if (!token) return;
    const r = await fetch(`/api/ws/${ws}/sim/approve/${token}`, { method: 'POST' });
    const j = await r.json();
    if (!r.ok) return setError(j.error);
    setBooked(j.result);
  };

  return (
    <div className="book">
      <header className="book-head">
        <div className="book-avatar" aria-hidden>
          P
        </div>
        <div>
          <h1>{s.business}</h1>
          <p className="muted">Home studio · book in a minute</p>
        </div>
      </header>

      {booked?.state === 'HELD' || booked?.state === 'VAULTED' ? (
        <section className="book-card done">
          <h2>You're booked</h2>
          <p>
            {svc.find((x) => x.id === service)?.name}, {start ? `${fmtDay(start)} at ${fmtTime(start)}` : ''}.
          </p>
          <p className="muted">
            {booked.state === 'HELD'
              ? `PayPal is holding ${usd(hold)}. It is not a charge.`
              : `Your PayPal is saved. We'll place a ${usd(hold)} hold 3 days before your visit; it is not a charge.`}{' '}
            Questions or changes? Just text {s.owner}.
          </p>
        </section>
      ) : booked ? (
        <section className="book-card">
          <h2>One last step</h2>
          <p>Approve with PayPal to keep your spot. Nothing is charged today.</p>
          {s.paymentsMode === 'mock' ? (
            <>
              <button className="paypal wide" onClick={approve}>
                Approve with PayPal
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
                <button key={x.id} className={service === x.id ? 'svc on' : 'svc'} onClick={() => setService(x.id)}>
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
            <div className="slot-list">
              {slots.map((t) => (
                <button key={t} className={start === t ? 'slot on' : 'slot'} onClick={() => setStart(t)}>
                  {fmtDay(t)}
                  <br />
                  <strong>{fmtTime(t)}</strong>
                </button>
              ))}
              {slots.length === 0 && <p className="muted">No free times this week.</p>}
            </div>
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
            {error && <div className="error">{error}</div>}
            <button className="paypal wide" disabled={!start || !name.trim() || !agree} onClick={book}>
              Book and approve with PayPal
            </button>
            <p className="muted small">Policy v{s.policy.version} · {s.policy.hash.slice(0, 8)}</p>
          </section>
        </>
      )}
    </div>
  );
}
