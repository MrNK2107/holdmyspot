import { type ReactNode, useMemo, useState } from 'react';
import { type Api, type BookingView, type Snapshot, type StudioHours, fmtTime, relDay, usd } from './api';
import { Icon } from './Icon';
import { ShareLink } from './Onboarding';

const flag = (k: string) => {
  try {
    return localStorage.getItem(k) === '1';
  } catch {
    return false;
  }
};
const setFlag = (k: string) => {
  try {
    localStorage.setItem(k, '1');
  } catch {
    /* private window: the guide just shows again */
  }
};

/** A blank screen that says what will be here, why, and the one thing to do. */
export function EmptyState({ icon, title, children, action }: { icon: string; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

const hourLabel = (h: number) => (h === 0 || h === 24 ? '12:00 AM' : h === 12 ? '12:00 PM' : h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PRESETS = [
  { name: 'Haircut', min: 45, price: 35 },
  { name: 'Consultation', min: 30, price: 25 },
  { name: 'Full session', min: 90, price: 80 },
];

/** What the studio offers: each service is a name, a length and a price. Clients pick from this list when they book. */
export function ServicesEditor({ s, api, onState }: { s: Snapshot; api: Api; onState: (s: Snapshot) => void }) {
  const [name, setName] = useState('');
  const [min, setMin] = useState(60);
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<{ state: Snapshot }>) => {
    setBusy(true);
    setError(null);
    try {
      onState((await fn()).state);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(Number(price) * 100);
    if (!Number.isFinite(cents) || cents < 0) return setError('Enter the price in dollars, like 45');
    if (await run(() => api.addService(name, min, cents))) {
      setName('');
      setPrice('');
    }
  };
  return (
    <div className="editor">
      {s.services.length === 0 ? (
        <p className="hint-line">
          <Icon name="info" size={16} /> Clients choose from this list when they book. Add at least one service.
        </p>
      ) : (
        <ul className="svc-rows" aria-label="Your services">
          {s.services.map((x) => (
            <li key={x.id}>
              <span className="svc-name">{x.name}</span>
              <span className="muted">
                {x.durationMin} min · {usd(x.priceCents)}
              </span>
              <button className="ghost" disabled={busy} onClick={() => run(() => api.removeService(x.id))} aria-label={`Remove ${x.name}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="svc-form">
        <label className="field grow">
          <span>Service name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Haircut" maxLength={40} required />
        </label>
        <label className="field">
          <span>Length</span>
          <select value={min} onChange={(e) => setMin(Number(e.target.value))}>
            {[15, 30, 45, 60, 75, 90, 120, 150, 180, 240].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Price (USD)</span>
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="45" required />
        </label>
        <button className="primary" type="submit" disabled={busy || !name.trim() || !price}>
          Add service
        </button>
      </form>
      {s.services.length === 0 && (
        <div className="presets" aria-label="Start from an example">
          <span className="muted small">Start from an example:</span>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              className="chip-btn"
              onClick={() => {
                setName(p.name);
                setMin(p.min);
                setPrice(String(p.price));
              }}
            >
              {p.name} · {p.min} min · ${p.price}
            </button>
          ))}
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

/** When the studio takes visits, in the studio's own time zone. */
export function HoursEditor({ s, api, onState }: { s: Snapshot; api: Api; onState: (s: Snapshot) => void }) {
  const [h, setH] = useState<StudioHours>(s.hours);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // every change is saved as it is made: there is no separate Save step to forget
  const update = async (next: StudioHours) => {
    setH(next);
    setBusy(true);
    setError(null);
    try {
      onState((await api.setHours(next)).state);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (d: number) => update({ ...h, closedDays: h.closedDays.includes(d) ? h.closedDays.filter((x) => x !== d) : [...h.closedDays, d] });
  return (
    <div className="editor">
      <div className="hours-grid">
        <label className="field">
          <span>Opens</span>
          <select value={h.openHour} onChange={(e) => update({ ...h, openHour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>
                {hourLabel(i)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Closes</span>
          <select value={h.closeHour} onChange={(e) => update({ ...h, closeHour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, i) => i + 1).map((i) => (
              <option key={i} value={i}>
                {hourLabel(i)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>A slot every</span>
          <select value={h.stepMinutes} onChange={(e) => update({ ...h, stepMinutes: Number(e.target.value) })}>
            {[30, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Booking notice</span>
          <select value={h.leadMinutes} onChange={(e) => update({ ...h, leadMinutes: Number(e.target.value) })}>
            {[0, 30, 60, 120, 240, 720, 1440].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'none' : m < 60 ? `${m} min` : `${m / 60} h`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="days">
        <legend>Open on</legend>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <button key={d} type="button" className={h.closedDays.includes(d) ? 'day' : 'day on'} aria-pressed={!h.closedDays.includes(d)} onClick={() => toggle(d)}>
            {DAYS[d]}
          </button>
        ))}
      </fieldset>
      <p className="muted small">Times are in {s.timeZone.replace('_', ' ')}, the time zone of this browser when you created the studio.</p>
      <p className="save-state" role="status" aria-live="polite">
        {busy ? 'Saving…' : saved ? 'Saved' : 'Changes save automatically.'}
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

/** The Studio tab: everything about the business itself, in one place. */
export function StudioTab({ s, ws, api, onState }: { s: Snapshot; ws: string; api: Api; onState: (s: Snapshot) => void }) {
  return (
    <main className="studio-tab">
      <section className="card">
        <h2>Services</h2>
        <p className="page-intro">What clients can book. Each visit holds the fee on the client's PayPal.</p>
        <ServicesEditor s={s} api={api} onState={onState} />
      </section>
      <section className="card">
        <h2>Opening hours</h2>
        <p className="page-intro">Clients only see times inside these hours.</p>
        <HoursEditor s={s} api={api} onState={onState} />
      </section>
      <section className="card">
        <h2>Your booking link</h2>
        <p className="page-intro">Share it in your bio or send it to a client.</p>
        <ShareLink ws={ws} onUse={() => setFlag(`hms-shared:${ws}`)} />
      </section>
    </main>
  );
}

const SETTLED = ['captured', 'voided', 'refunded', 'part-refunded', 'reversed'];
const HAS_HOLD = ['held', 'pending-refill', ...SETTLED];

/** The guide at the top of an owner's first days: four steps, the current one explained, and how to read the screen. */
export function GettingStarted({ s, ws, onGo }: { s: Snapshot; ws: string; onGo: (tab: 'studio' | 'policy') => void }) {
  const dismissKey = `hms-guide-done:${ws}`;
  const [dismissed, setDismissed] = useState(() => flag(dismissKey));
  const shared = flag(`hms-shared:${ws}`) || s.bookings.length > 0;
  const steps = useMemo(
    () => [
      { id: 'svc', icon: 'store', title: 'Add what you offer', done: s.services.length > 0, body: 'A service is a name, a length and a price. Clients pick from this list.' },
      { id: 'share', icon: 'link', title: 'Share your booking link', done: shared, body: 'Put it in your bio or text it to a client. This is the only page clients need.' },
      { id: 'book', icon: 'calendar', title: 'Get your first booking', done: s.bookings.length > 0, body: 'A client picks a time and approves a PayPal hold. The visit lands on your schedule.' },
      { id: 'hold', icon: 'wallet', title: 'See your first hold', done: s.bookings.some((b) => HAS_HOLD.includes(b.money)), body: 'The hold only reserves the money. You decide later whether to charge it.' },
    ],
    [s.services.length, shared, s.bookings],
  );
  const done = steps.filter((x) => x.done).length;
  const current = steps.find((x) => !x.done);
  if (dismissed) return null;
  if (!current) {
    return (
      <section className="card guide guide-done" role="status">
        <Icon name="check" size={20} />
        <span>
          <strong>You are set up.</strong> Holds, texts and anything that needs you will show up on this screen.
        </span>
        <button
          className="ghost"
          onClick={() => {
            setFlag(dismissKey);
            setDismissed(true);
          }}
        >
          Hide guide
        </button>
      </section>
    );
  }
  return (
    <section className="card guide" aria-labelledby="guide-h">
      <div className="guide-head">
        <h2 id="guide-h">Getting started</h2>
        <span className="guide-count">
          {done} of {steps.length} done
        </span>
      </div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Setup progress">
        <span style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="guide-steps">
        {steps.map((st) => (
          <li key={st.id} className={st.done ? 'done' : st.id === current.id ? 'now' : ''}>
            <span className="gs-mark">{st.done ? <Icon name="check" size={16} /> : <Icon name={st.icon} size={16} />}</span>
            <span className="gs-text">
              <strong>{st.title}</strong>
              {st.id === current.id && <span className="gs-body">{st.body}</span>}
            </span>
          </li>
        ))}
      </ol>
      {current.id === 'svc' && (
        <div className="actions">
          <button className="primary" onClick={() => onGo('studio')}>
            Add your first service
          </button>
        </div>
      )}
      {current.id === 'share' && <ShareLink ws={ws} onUse={() => setFlag(`hms-shared:${ws}`)} />}
      {current.id === 'book' && <ShareLink ws={ws} onUse={() => setFlag(`hms-shared:${ws}`)} />}
      {current.id === 'book' && <p className="muted small">Want to see what clients see? Open the booking page and book a test visit yourself.</p>}
    </section>
  );
}

/** How to read the schedule: three pointers that disappear once understood. */
export function ScreenGuide({ ws }: { ws: string }) {
  const key = `hms-read-guide:${ws}`;
  const [gone, setGone] = useState(() => flag(key));
  if (gone) return null;
  return (
    <aside className="read-guide" aria-label="How to read this screen">
      <div className="rg-item">
        <Icon name="clock" size={18} />
        <span>
          <strong>Needs you</strong> lists the taps only you can make: charge a fee, excuse a cancel, answer attendance.
        </span>
      </div>
      <div className="rg-item">
        <Icon name="wallet" size={18} />
        <span>
          <strong>The colored chip</strong> on each visit is where its money is: held, charged, released, refunded.
        </span>
      </div>
      <div className="rg-item">
        <Icon name="calendar" size={18} />
        <span>
          <strong>Click a visit</strong> to see its timeline and every PayPal step behind it.
        </span>
      </div>
      <button
        className="ghost"
        onClick={() => {
          setFlag(key);
          setGone(true);
        }}
      >
        Got it
      </button>
    </aside>
  );
}

/** One visit's path in four steps, so "where is this?" is answered at a glance. */
export function Journey({ b, now }: { b: BookingView; now: number }) {
  const hold = HAS_HOLD.includes(b.money);
  const failed = b.money === 'failed';
  const settled = SETTLED.includes(b.money) || ['EXCUSED', 'CANCELLED_EARLY', 'REFILLED'].includes(b.state);
  const started = now >= b.start;
  const outcome =
    b.money === 'captured' ? `Charged ${usd(b.capturedCents ?? b.holdCents)}` : b.money === 'refunded' ? 'Refunded' : b.money === 'part-refunded' ? 'Partly refunded' : b.money === 'voided' ? 'Released, $0' : b.money === 'reversed' ? 'Charge reversed' : 'Settled';
  const steps = [
    { label: 'Booked', state: 'done' as const, note: '' },
    { label: failed ? 'Hold declined' : 'Hold on PayPal', state: failed ? ('bad' as const) : hold ? ('done' as const) : ('now' as const), note: failed ? 'Client has a link to re-approve' : hold ? 'Reserved, not charged' : 'Waiting for the client to approve' },
    { label: 'Visit', state: settled || started ? ('done' as const) : hold ? ('now' as const) : ('todo' as const), note: `${relDay(b.start, now)}, ${fmtTime(b.start)}` },
    { label: 'Settled', state: settled ? ('done' as const) : ('todo' as const), note: settled ? outcome : 'You decide after the visit' },
  ];
  return (
    <ol className="journey" aria-label="Where this visit is">
      {steps.map((st) => (
        <li key={st.label} className={st.state}>
          <span className="j-dot" aria-hidden>
            {st.state === 'done' ? <Icon name="check" size={12} /> : st.state === 'bad' ? <Icon name="x" size={12} /> : null}
          </span>
          <span className="j-label">{st.label}</span>
          <span className="j-note">{st.note}</span>
        </li>
      ))}
    </ol>
  );
}

/** Client texts in one place, newest conversation first. */
/** With no AI key, nothing is classified: say so plainly wherever the owner reads client texts. */
export function NoAiNote({ s }: { s: Snapshot }) {
  if (s.aiProvider !== 'none') return null;
  return (
    <p className="hint-line" role="note">
      <Icon name="info" size={16} />
      <span>
        AI is not configured on this server, so texts are not read or sorted for you. Clients get a plain acknowledgement, and you decide what to do. Add a Gemini key to have the front desk propose outcomes.
      </span>
    </p>
  );
}

export function Inbox({ s, onSelect }: { s: Snapshot; onSelect: (bookingId: string) => void }) {
  const threads = useMemo(() => {
    const by = new Map<string, Snapshot['messages']>();
    for (const m of s.messages) by.set(m.clientId, [...(by.get(m.clientId) ?? []), m]);
    return [...by.entries()]
      .map(([clientId, msgs]) => ({ clientId, name: s.clients.find((c) => c.id === clientId)?.name ?? 'Client', msgs, last: msgs[msgs.length - 1].at }))
      .sort((a, b) => b.last - a.last);
  }, [s.messages, s.clients]);
  if (!threads.length) {
    return (
      <main className="inbox">
        <EmptyState icon="chat" title="No messages yet">
          After a client books, they get a private link where they can text you. Their messages show up here as they arrive, and the front desk drafts the reply. Anything that involves money waits for your tap.
        </EmptyState>
      </main>
    );
  }
  return (
    <main className="inbox">
      <p className="page-intro">Messages from clients, newest first. The front desk answers; money moves only when you tap.</p>
      <NoAiNote s={s} />
      {threads.map((t) => {
        const visit = s.bookings.filter((b) => b.clientId === t.clientId).slice(-1)[0];
        return (
          <section key={t.clientId} className="card inbox-thread">
            <header>
              <span className="avatar" aria-hidden>
                {t.name[0]}
              </span>
              <strong>{t.name}</strong>
              <span className="muted small">{relDay(t.last, s.now)}, {fmtTime(t.last)}</span>
              {visit && (
                <button className="ghost" onClick={() => onSelect(visit.id)}>
                  Open visit
                </button>
              )}
            </header>
            <div className="msgs">
              {t.msgs.map((m) => (
                <div key={m.id} className={m.from === 'client' ? 'msg in' : 'msg out'}>
                  <span className="who">{m.from === 'client' ? t.name.split(' ')[0] : 'Front desk'}</span>
                  {m.text}
                  <span className="when">{fmtTime(m.at)}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
