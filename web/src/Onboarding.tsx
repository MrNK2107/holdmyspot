import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { type Api, type Snapshot, rememberOwnerToken, usd } from './api';
import { Icon } from './Icon';
import { HoursEditor, ServicesEditor } from './Studio';

/** Where the owner shares the studio: the public booking page for this workspace. */
export const bookingLink = (ws: string) => `${location.origin}/book?ws=${encodeURIComponent(ws)}`;

interface ServerConfig {
  payments: 'mock' | 'sandbox';
  ai: string;
  clock: 'real' | 'demo';
}

/** First screen at `/`: what the product does, and the one thing to do next (create a studio). */
export function Welcome() {
  const [business, setBusiness] = useState('');
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<ServerConfig | null>(null);
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => undefined);
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // the studio runs in the time zone of the browser that creates it
        body: JSON.stringify({ business, owner, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
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
          <ol className="how-it-works" aria-label="How it works">
            <li>
              <span className="hw-n">1</span>
              <span>
                <strong>A client books and approves a hold.</strong> It reserves the fee on their own PayPal. Nothing is charged.
              </span>
            </li>
            <li>
              <span className="hw-n">2</span>
              <span>
                <strong>Life happens.</strong> A late cancel goes to your waitlist first. A sick child gets excused. You see every proposal before it acts.
              </span>
            </li>
            <li>
              <span className="hw-n">3</span>
              <span>
                <strong>You tap, or you don’t.</strong> A no-show is one tap to charge the hold you already have. A change of heart is one tap to refund.
              </span>
            </li>
          </ol>
          {cfg && (
            <p className="honesty" role="note">
              <Icon name="info" size={16} />
              {cfg.payments === 'sandbox' ? 'Runs on the real PayPal sandbox: real PayPal screens, test money only.' : 'Runs on a built-in PayPal simulator: no PayPal account needed.'}{' '}
              {cfg.ai === 'none' ? 'AI is not configured on this server, so client texts come to you to read.' : cfg.ai === 'fake' ? 'The AI is an offline stand-in.' : `AI: ${cfg.ai.split(':')[0]}.`}
            </p>
          )}
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
          {cfg?.payments === 'mock' && (
            <p className="alt">
              Just looking? <a href="/?ws=demo&demo=1">Play the 3-minute guided demo</a>
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

/** The booking link with Copy and Open: used in setup, on the Studio tab and in the getting-started guide. */
export function ShareLink({ ws, onUse }: { ws: string; onUse?: () => void }) {
  const link = bookingLink(ws);
  const [done, setDone] = useState<'copied' | 'failed' | null>(null);
  const copy = async () => {
    onUse?.();
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
      <a className="button" href={link} target="_blank" rel="noreferrer" onClick={() => onUse?.()}>
        Open booking page ↗
      </a>
    </div>
  );
}

const STEPS = ['Studio', 'Offer', 'Policy', 'PayPal', 'Share'] as const;

/** Five steps from a new studio to a shareable link. Step 1 (the studio) is done when the studio is created. */
export function SetupWizard({
  s,
  ws,
  api,
  onState,
  policyEditor,
  onFinish,
}: {
  s: Snapshot;
  ws: string;
  api: Api;
  onState: (s: Snapshot) => void;
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
      <p className="setup-sub">Five short steps. You can change everything later from the Studio and Policy tabs.</p>
      <ol className="stepper" aria-label="Setup progress">
        {STEPS.map((name, i) => (
          <li key={name} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="step-dot" aria-hidden>
              {i < step ? <Icon name="check" size={14} /> : i + 1}
            </span>
            <span className="step-name">{name}</span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="card setup-card">
          <h2>What do you offer, and when?</h2>
          <p>Clients choose a service and a time from these. Add at least one service to continue.</p>
          <h3 className="sub-h">Services</h3>
          <ServicesEditor s={s} api={api} onState={onState} />
          <h3 className="sub-h">Opening hours</h3>
          <HoursEditor s={s} api={api} onState={onState} />
          <div className="actions">
            <button className="primary" disabled={s.services.length === 0} onClick={next}>
              {s.services.length === 0 ? 'Add a service to continue' : 'Continue'}
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card setup-card">
          <h2>Your cancellation policy</h2>
          <p>This is what clients agree to when they book. You can change it any time on the Policy tab.</p>
          <blockquote className="policy-quote">{s.policy.summary}</blockquote>
          {!editing && (
            <div className="actions">
              <button onClick={() => setStep(1)}>Back</button>
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

      {step === 3 && (
        <section className="card setup-card">
          <h2>PayPal</h2>
          {s.paymentsMode === 'sandbox' ? (
            <p className="status ok" role="status">
              Connected to the PayPal sandbox. Clients see real PayPal screens; the money is test money, so nothing real is charged.
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
            <button onClick={() => setStep(2)}>Back</button>
            <button className="primary" onClick={next}>
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="card setup-card">
          <h2>Share your booking link</h2>
          <p>Clients book here. You can open it again any time from “Client booking page” at the top of the screen.</p>
          <ShareLink ws={ws} onUse={() => localStorageFlag(`hms-shared:${ws}`)} />
          <div className="actions">
            <button onClick={() => setStep(3)}>Back</button>
            <button className="primary" onClick={onFinish}>
              Open my studio
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function localStorageFlag(k: string) {
  try {
    localStorage.setItem(k, '1');
  } catch {
    /* private window */
  }
}
