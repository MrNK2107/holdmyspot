import { type FormEvent, type ReactNode, useState } from 'react';
import { type Api, type Snapshot, rememberOwnerToken, usd } from './api';

/** Where the owner shares the studio: the public booking page for this workspace. */
export const bookingLink = (ws: string) => `${location.origin}/book?ws=${encodeURIComponent(ws)}`;

/** First screen at `/`: what the product does, and the one thing to do next (create a studio). */
export function Welcome() {
  const [business, setBusiness] = useState('');
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business, owner }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      rememberOwnerToken(j.id, j.ownerToken);
      // the token also rides in the fragment so the next page keeps it even where storage is blocked
      location.href = `/?ws=${encodeURIComponent(j.id)}&setup=1#owner=${encodeURIComponent(j.ownerToken)}`;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="welcome">
      <header className="welcome-top">
        <span className="logo" aria-hidden>
          ◆
        </span>
        <span className="brand-name">HoldMySpot</span>
      </header>
      <main className="welcome-main">
        <section className="welcome-copy">
          <h1>Hold the fee, not the grudge.</h1>
          <p className="lede">
            HoldMySpot puts a PayPal hold on every booking, reads “can’t make it” texts the way a person would, and only moves money when you tap.
          </p>
          <ul className="moments">
            <li>
              <strong>Three days before.</strong> A declined hold is caught on Tuesday, not at the door on Friday.
            </li>
            <li>
              <strong>A late cancel.</strong> Your waitlist fills the slot first, so the client who cancelled pays nothing.
            </li>
            <li>
              <strong>A no-show.</strong> One tap charges the hold you already have. Another refunds it.
            </li>
          </ul>
        </section>
        <section className="welcome-card" aria-labelledby="create-h">
          <h2 id="create-h">Create your studio</h2>
          <form onSubmit={create}>
            <label className="field">
              <span>Studio name</span>
              <input value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Polished by Priya" maxLength={60} autoComplete="organization" required autoFocus />
            </label>
            <label className="field">
              <span>Your first name</span>
              <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Priya" maxLength={40} autoComplete="given-name" required />
            </label>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button className="primary wide" type="submit" disabled={busy || !business.trim() || !owner.trim()}>
              {busy ? 'Creating…' : 'Create studio'}
            </button>
          </form>
          <p className="muted small">No password. Your studio opens in this browser; later you can copy a private link to open it on another device.</p>
          <p className="alt">
            Just looking? <a href="/?ws=demo&demo=1">Play the 3-minute guided demo</a>
          </p>
        </section>
      </main>
    </div>
  );
}

/** The booking link with Copy and Open: used in the last setup step and on an empty schedule. */
export function ShareLink({ ws }: { ws: string }) {
  const link = bookingLink(ws);
  const [done, setDone] = useState<'copied' | 'failed' | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setDone('copied');
    } catch {
      setDone('failed');
    }
    setTimeout(() => setDone(null), 2500);
  };
  return (
    <div className="share">
      <input className="share-link" readOnly value={link} aria-label="Your booking link" onFocus={(e) => e.currentTarget.select()} />
      <button className="primary" onClick={copy}>
        {done === 'copied' ? 'Copied' : done === 'failed' ? 'Select and copy' : 'Copy link'}
      </button>
      <a className="button" href={link} target="_blank" rel="noreferrer">
        Open booking page ↗
      </a>
    </div>
  );
}

/** Shown on the schedule until the first booking exists. */
export function FirstBooking({ s, ws }: { s: Snapshot; ws: string }) {
  const hold = s.policy.rules.holdCents;
  return (
    <section className="card first-booking" aria-labelledby="fb-h">
      <h2 id="fb-h">Get your first booking</h2>
      <p>
        Send this link to a client or put it in your bio. They pick a time and approve a {usd(hold)} hold on their own PayPal; the visit lands on your schedule and nothing is charged unless you tap.
      </p>
      <ShareLink ws={ws} />
      <p className="muted small">Want to see it from the client’s side first? Open the booking page and book a test visit yourself.</p>
    </section>
  );
}

const STEPS = ['Studio', 'Policy', 'PayPal', 'Share'] as const;

/** Four steps from a new studio to a shareable link. Step 1 (the studio) is done when the studio is created. */
export function SetupWizard({
  s,
  ws,
  policyEditor,
  onFinish,
}: {
  s: Snapshot;
  ws: string;
  api: Api;
  policyEditor: ReactNode;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(1); // 0-based: the studio step is already done
  const [editing, setEditing] = useState(false);
  const hold = s.policy.rules.holdCents;
  const next = () => {
    setEditing(false);
    setStep((x) => Math.min(x + 1, STEPS.length - 1));
  };
  return (
    <main className="setup">
      <h1 className="setup-title">Set up {s.business}</h1>
      <ol className="stepper" aria-label="Setup progress">
        {STEPS.map((name, i) => (
          <li key={name} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="step-dot" aria-hidden>
              {i < step ? '✓' : i + 1}
            </span>
            <span className="step-name">{name}</span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="card setup-card">
          <h2>Your cancellation policy</h2>
          <p>This is what clients agree to when they book. You can change it any time on the Policy tab.</p>
          <blockquote className="policy-quote">{s.policy.summary}</blockquote>
          {!editing && (
            <div className="actions">
              <button className="primary" onClick={next}>
                Keep this policy
              </button>
              <button onClick={() => setEditing(true)}>Rewrite it in my own words</button>
            </div>
          )}
          {editing && (
            <>
              <p className="muted small">Write it the way you would tell a client. The AI turns it into rules; nothing goes live until you approve.</p>
              {policyEditor}
              <div className="actions">
                <button onClick={() => setEditing(false)}>Cancel</button>
                <button className="primary" onClick={next}>
                  Continue
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="card setup-card">
          <h2>PayPal</h2>
          {s.paymentsMode === 'sandbox' ? (
            <p className="status ok" role="status">
              Connected to the PayPal sandbox. Test money only: nothing real is charged.
            </p>
          ) : (
            <p className="status" role="status">
              Running on the built-in PayPal simulator, so you can try everything without a PayPal account. The real PayPal sandbox is switched on with <code>PAYMENTS=sandbox</code>.
            </p>
          )}
          <p>How money moves:</p>
          <ol className="how">
            <li>A client books and approves a {usd(hold)} hold in their own PayPal.</li>
            <li>Nothing is charged. The hold only reserves the money.</li>
            <li>After the visit, you tap Charge for a no-show, or the hold is released.</li>
          </ol>
          <div className="actions">
            <button onClick={() => setStep(1)}>Back</button>
            <button className="primary" onClick={next}>
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card setup-card">
          <h2>Share your booking link</h2>
          <p>Clients book here. You can open it again any time from “Client booking page” at the top of the screen.</p>
          <ShareLink ws={ws} />
          <div className="actions">
            <button onClick={() => setStep(2)}>Back</button>
            <button className="primary" onClick={onFinish}>
              Open my studio
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
