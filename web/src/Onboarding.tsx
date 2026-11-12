import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { type Api, type Snapshot, rememberOwnerToken, usd } from './api';
import { Icon } from './Icon';
import { HoursEditor, ServicesEditor } from './Studio';
import './welcome.css';

/** Where the owner shares the studio: the public booking page for this workspace. */
export const bookingLink = (ws: string) => `${location.origin}/book?ws=${encodeURIComponent(ws)}`;

interface ServerConfig {
  payments: 'mock' | 'sandbox';
  ai: string;
  clock: 'real' | 'demo';
  google: boolean;
  storage: 'memory' | 'postgres' | 'none';
}

export interface Me {
  google: boolean;
  account: { name: string; email: string; picture?: string } | null;
  studios: Array<{ id: string; business: string }>;
}

/** Who is signed in (Google), if anyone. */
export function useMe(): [Me | null, () => void] {
  const [me, setMe] = useState<Me | null>(null);
  const load = () =>
    fetch('/api/me')
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe({ google: false, account: null, studios: [] }));
  useEffect(() => {
    load();
  }, []);
  return [me, load];
}

const signOut = async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.href = '/';
};

/** Small "signed in as" chip with sign-out, for the console header. */
export function AccountChip({ me }: { me: Me | null }) {
  if (!me?.account) return null;
  return (
    <span className="account-chip">
      <span className="avatar sm" aria-hidden>
        {(me.account.name[0] ?? '•').toUpperCase()}
      </span>
      <span className="muted small">{me.account.email}</span>
      <button className="ghost" onClick={signOut}>
        Sign out
      </button>
    </span>
  );
}

/** Example holds the landing ledger lets a visitor try; the studio's real hold is its own setting. */
const HOLD_CHOICES = [1000, 2000, 3500, 5000];

/** First screen at `/`: what the product does, and the one thing to do next (sign in, or create a studio). */
export function Welcome() {
  const [business, setBusiness] = useState('');
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const [hold, setHold] = useState(2000);
  const [error, setError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<ServerConfig | null>(null);
  const [me] = useMe();
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => undefined);
  }, []);
  // a signed-in owner does not retype their name
  useEffect(() => {
    if (me?.account && !owner) setOwner(me.account.name.split(' ')[0]);
  }, [me, owner]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!business.trim() || !owner.trim()) {
      setError('Add your studio name and your first name to continue.');
      return;
    }
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

  const signedIn = !!me?.account;
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const goStart = () => {
    document.getElementById('start')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => document.getElementById('studio-name')?.focus({ preventScroll: true }), 350);
  };
  return (
    <div className="lg">
      <header className="lg-top">
        <svg className="lg-mark" width="22" height="22" viewBox="0 0 24 24" aria-hidden focusable="false">
          <path d="M12 2l8.5 10L12 22 3.5 12z" fill="currentColor" />
        </svg>
        <span className="lg-name">HoldMySpot</span>
        <nav className="lg-nav" aria-label="Page sections">
          <a href="#how">How it works</a>
          <a href="#trust">Why you can trust it</a>
          <a href="#rules">Your rules</a>
        </nav>
        <span className="spacer" />
        <AccountChip me={me} />
        <button type="button" className="lg-top-cta" onClick={goStart}>
          Create studio
        </button>
      </header>

      <main>
        <section className="lg-hero">
          <div className="lg-hero-in">
            <div className="lg-intro">
              <h1>Hold the fee, not the grudge.</h1>
              <p className="lg-lede">
                HoldMySpot puts a PayPal hold on every booking, reads “can’t make it” texts the way a person would, and only moves money when you tap.
              </p>

              <div className="lg-entry" id="start" aria-labelledby="create-h">
                {signedIn && me!.studios.length > 0 && (
                  <div className="my-studios">
                    <h2>Welcome back, {me!.account!.name.split(' ')[0]}</h2>
                    <ul>
                      {me!.studios.map((st) => (
                        <li key={st.id}>
                          <a className="button primary" href={`/?ws=${encodeURIComponent(st.id)}`}>
                            Open {st.business}
                          </a>
                        </li>
                      ))}
                    </ul>
                    <hr />
                  </div>
                )}
                {!signedIn && cfg?.google && (
                  <>
                    <h2>Sign in to get started</h2>
                    <a className="button google wide" href="/auth/google">
                      <GoogleMark /> Continue with Google
                    </a>
                    <p className="muted small">Your studios stay linked to your Google account, so you can open them from any device.</p>
                    <div className="or" role="separator">
                      <span>or</span>
                    </div>
                  </>
                )}
                <h2 id="create-h">{signedIn && me!.studios.length ? 'Create another studio' : signedIn || !cfg?.google ? 'Create your studio' : 'Start without an account'}</h2>
                <form onSubmit={create} className="lg-form">
                  <label className="field">
                    <span>Studio name</span>
                    <input id="studio-name" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Polished by Priya" maxLength={60} autoComplete="organization" required />
                  </label>
                  <label className="field">
                    <span>Your first name</span>
                    <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Priya" maxLength={40} autoComplete="given-name" required />
                  </label>
                  <button className={signedIn || !cfg?.google ? 'primary' : ''} type="submit" disabled={busy}>
                    {busy ? 'Creating…' : 'Create studio'}
                  </button>
                </form>
                {error && (
                  <div className="error" role="alert">
                    {error}
                  </div>
                )}
                <p className="muted small">
                  {signedIn
                    ? 'This studio will be yours across devices.'
                    : 'No password. Your studio opens in this browser; later you can copy a private link to open it on another device.'}
                </p>
                {cfg?.payments === 'mock' && (
                  <p className="alt">
                    Just looking? <a href="/?ws=demo&demo=1">Play the 3-minute guided demo</a>
                  </p>
                )}
              </div>
            </div>

            <BookingDemo hold={hold} money={money} />
          </div>
        </section>

        <section className="lg-trust" id="trust-strip" aria-label="Built on PayPal">
          <p>Built on PayPal’s own payment rails</p>
          <ul>
            <li>Orders v2 authorizations</li>
            <li>Vault v3 saved wallets</li>
            <li>Void, capture and refund</li>
            <li>Agent Toolkit, read-only</li>
          </ul>
        </section>

        <section className="lg-section lg-how" id="how" aria-labelledby="how-h">
          <div className="lg-sec-h">
            <h2 id="how-h">How a booking moves money</h2>
            <p>Three steps, and the owner’s tap is the only thing that ever charges.</p>
          </div>
          <ol className="lg-steps" aria-label="How it works">
            <li>
              <span className="lg-n">1</span>
              <h3>A client books and approves a hold.</h3>
              <p>It reserves the fee on their own PayPal. Nothing is charged.</p>
              <div className="lg-fig">
                <span>Hold on their PayPal</span>
                <output key={`a${hold}`}>{money(hold)}</output>
              </div>
            </li>
            <li>
              <span className="lg-n">2</span>
              <h3>Life happens.</h3>
              <p>A late cancel goes to your waitlist first. A sick child gets excused. You see every proposal before it acts.</p>
              <div className="lg-fig released">
                <span>Released, nothing charged</span>
                <output>$0.00</output>
              </div>
            </li>
            <li>
              <span className="lg-n">3</span>
              <h3>You tap, or you don’t.</h3>
              <p>A no-show is one tap to charge the hold you already have. A change of heart is one tap to refund.</p>
              <div className="lg-fig captured">
                <span>Charged only on your tap, up to</span>
                <output key={`c${hold}`}>{money(hold)}</output>
              </div>
            </li>
          </ol>
        </section>

        <section className="lg-dark" id="trust" aria-labelledby="trust-h">
          <div className="lg-dark-in">
            <h2 id="trust-h">Built so it can be trusted with money.</h2>
            <div className="lg-cols3">
              <div>
                <h3>The AI only proposes.</h3>
                <p>It labels a message and drafts a proposal. It has no tool that authorizes, captures, voids or refunds, so nothing it reads can move money.</p>
              </div>
              <div>
                <h3>Rules, not guesses.</h3>
                <p>A deterministic engine enforces your policy: a charge never exceeds the hold or your fee, never happens without your tap, and silence never charges.</p>
              </div>
              <div>
                <h3>Every cent traced.</h3>
                <p>Each booking’s PayPal authorization, capture and refund IDs sit in a ledger beside the exact request behind each step.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="lg-section lg-rulesec" id="rules" aria-labelledby="rules-h">
          <div className="lg-sec-h">
            <h2 id="rules-h">Your studio, your rules.</h2>
            <p>An example studio. Choose a hold and every figure on this page follows it.</p>
          </div>
          <div className="lg-ledger">
            <div className="lg-ledger-h">
              <div className="lg-pick" role="group" aria-labelledby="hold-l">
                <span className="lg-pick-l" id="hold-l">
                  Hold per visit
                </span>
                {HOLD_CHOICES.map((c) => (
                  <button key={c} type="button" aria-pressed={hold === c} className={hold === c ? 'on' : ''} onClick={() => setHold(c)}>
                    ${c / 100}
                  </button>
                ))}
              </div>
            </div>
            <div className="lg-cols" aria-hidden>
              <span>You decide</span>
              <span>Example</span>
            </div>
            <dl className="lg-rule-list">
              <div>
                <dt>The hold</dt>
                <dd>{money(hold)} reserved on the client’s PayPal</dd>
              </div>
              <div>
                <dt>The free-cancel window</dt>
                <dd>Cancel in time and the hold is simply released</dd>
              </div>
              <div>
                <dt>Late-cancel and no-show fees</dt>
                <dd>Set separately, never above the hold</dd>
              </div>
              <div>
                <dt>Which reasons are excused</dt>
                <dd>Illness, for example, is released with no fee</dd>
              </div>
            </dl>
            <div className="lg-net">
              <span>Moved before you tap</span>
              <output>$0.00</output>
            </div>
          </div>
        </section>

        <section className="lg-cta" aria-labelledby="cta-h">
          <h2 id="cta-h">Open your studio in a minute.</h2>
          <p>No password. Clients approve a hold; you decide whether it ever becomes a charge.</p>
          <button type="button" className="primary" onClick={goStart}>
            Create your studio
          </button>
        </section>
      </main>

      <footer className="lg-foot">
        <div className="lg-foot-in">
          <span className="lg-foot-brand">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden focusable="false">
              <path d="M12 2l8.5 10L12 22 3.5 12z" fill="currentColor" />
            </svg>
            HoldMySpot <em>Fair, without the fight.</em>
          </span>
          {cfg && (
            <p className="honesty" role="note">
              <Icon name="info" size={16} />
              <span>
                {cfg.payments === 'sandbox' ? 'Runs on the real PayPal sandbox: real PayPal screens, test money only.' : 'Runs on a built-in PayPal simulator: no PayPal account needed.'}{' '}
                {cfg.ai === 'none' ? 'AI is not configured on this server, so client texts come to you to read.' : cfg.ai === 'fake' ? 'The AI is an offline stand-in.' : `AI: ${cfg.ai.split(':')[0]}.`}{' '}
                {cfg.storage === 'postgres' ? 'Studios are saved in a database.' : cfg.payments === 'sandbox' ? 'Studios are kept in memory: a server restart forgets them.' : ''}
              </span>
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}

/** The hero's product picture: one example booking replaying its hold lifecycle. Labelled as an example; never real data. */
function BookingDemo({ hold, money }: { hold: number; money: (c: number) => string }) {
  const TOTAL = 5;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [step, setStep] = useState(reduced ? TOTAL : 1);
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setStep((s) => (s >= TOTAL ? 1 : s + 1)), step >= TOTAL ? 4200 : 1900);
    return () => clearTimeout(t);
  }, [step, reduced]);
  const status = step >= 5 ? 'Slot refilled' : step >= 4 ? 'Hold released' : step >= 1 ? 'Hold authorized' : 'Booked';
  const tone = step >= 4 ? 'green' : 'ink';
  const rows: Array<{ who: string; text: string; fig?: string; tone?: string; msg?: boolean }> = [
    { who: 'PayPal', text: 'Booked. Hold authorized on Maya’s PayPal', fig: money(hold) },
    { who: 'Maya', text: '“Kiddo threw up, can’t make it today.”', msg: true },
    { who: 'Read as', text: 'Sick child, excused by your policy. Proposal ready for you.' },
    { who: 'You approved', text: 'Hold released, nothing charged', fig: '$0.00', tone: 'green' },
    { who: 'Waitlist', text: 'Jordan took the slot and his hold authorized', fig: money(hold) },
  ];
  return (
    <figure className="lg-demo" aria-label="Example booking, step by step">
      <div className="lg-demo-card">
        <div className="lg-demo-h">
          <span className="lg-demo-av" aria-hidden>
            M
          </span>
          <div>
            <strong>Maya R.</strong>
            <span>Gel fill · Fri 2:00 pm</span>
          </div>
          <span className={`lg-pill ${tone}`} key={status}>
            {status}
          </span>
        </div>
        <ol className="lg-demo-log">
          {rows.map((r, i) => (
            <li key={i} className={`${i < step ? 'in' : ''} ${r.msg ? 'msg' : ''}`} aria-hidden={i >= step && !reduced}>
              <span className="lg-demo-who">{r.who}</span>
              <span className="lg-demo-text">{r.text}</span>
              {r.fig && <output className={r.tone ?? ''}>{r.fig}</output>}
            </li>
          ))}
        </ol>
        <div className="lg-demo-foot">
          <span>Charged to Maya</span>
          <output>$0.00</output>
        </div>
      </div>
      <figcaption>Example booking. Amounts follow the hold you pick below.</figcaption>
    </figure>
  );
}

/** Google's "G", drawn (their brand colors), for the sign-in button. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3.1-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
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
