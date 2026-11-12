import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { fmtDay, fmtTime, relDay, setZone, usd, wsPath } from './api';
import { Icon } from './Icon';

interface PortalVisit {
  id: string;
  serviceName: string;
  start: number;
  end: number;
  state: string;
  holdCents: number;
  held: boolean;
  captured: boolean;
  refunded: boolean;
  capturedCents?: number;
  approvalLink?: string;
}
interface PortalData {
  name: string;
  business: string;
  owner: string;
  timeZone: string;
  now: number;
  bookings: PortalVisit[];
  messages: Array<{ id: string; at: number; from: 'client' | 'frontdesk'; text: string }>;
}

const key = (ws: string) => `hms-client:${ws}`;

/** Remember this browser's client link, so PayPal's redirect back (a fresh page load) can still find it. */
export function rememberClient(ws: string, token: string, name: string) {
  try {
    localStorage.setItem(key(ws), JSON.stringify({ token, name }));
  } catch {
    /* private window: the link in the confirmation still works */
  }
}
export function recallClient(ws: string): { token: string; name: string } | undefined {
  try {
    return JSON.parse(localStorage.getItem(key(ws)) ?? 'null') ?? undefined;
  } catch {
    return undefined;
  }
}
export const portalLink = (ws: string, token: string) => `/me?ws=${encodeURIComponent(ws)}#t=${encodeURIComponent(token)}`;

/** A visit in plain words: what is true now, and what happens next. */
function describe(v: PortalVisit): { tone: 'ok' | 'wait' | 'bad' | 'done'; title: string; text: string } {
  const fee = usd(v.capturedCents ?? v.holdCents);
  if (v.state === 'HOLD_FAILED') return { tone: 'bad', title: 'Your hold did not go through', text: 'PayPal declined it. Approve it again to keep your spot.' };
  if (v.state === 'BOOKED' && v.approvalLink) return { tone: 'wait', title: 'One step left: approve the hold', text: `Approve a ${usd(v.holdCents)} hold on PayPal to confirm your spot. It is not a charge.` };
  if (v.captured && v.refunded) return { tone: 'done', title: 'Fee refunded', text: `The ${fee} fee was refunded to your PayPal.` };
  if (v.captured) return { tone: 'done', title: `A ${fee} fee was charged`, text: 'It was taken from the hold you approved, as the cancellation policy says. Message the studio if something happened.' };
  if (['EXCUSED', 'CANCELLED_EARLY', 'REFILLED'].includes(v.state)) return { tone: 'done', title: 'Cancelled, nothing charged', text: 'Your hold was released. You paid $0.' };
  if (v.held) return { tone: 'ok', title: 'Your spot is confirmed', text: `PayPal is holding ${usd(v.holdCents)}. It is not a charge, and it is released if you cancel in time.` };
  return { tone: 'wait', title: 'Booked', text: 'The studio will confirm the hold with PayPal before your visit.' };
}

/** `/me?ws=…`: a client's own page. The private link (or this browser's memory of it) is the only key. */
export function Portal({ ws }: { ws: string }) {
  const token = (() => {
    const h = new URLSearchParams(location.hash.slice(1)).get('t');
    if (h) return h;
    return recallClient(ws)?.token;
  })();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(wsPath(ws, `/me/${encodeURIComponent(token)}`));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      setZone(j.timeZone);
      setData(j);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [ws, token]);

  useEffect(() => {
    if (token) rememberClient(ws, token, recallClient(ws)?.name ?? '');
    // the link carries the token in the fragment: keep it in this browser, then tidy the address bar
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    load();
    const t = setInterval(load, 4000);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ws, token, load]);
  useEffect(() => {
    // braces: an effect must not return scrollIntoView's value, React would call it as a cleanup
    end.current?.scrollIntoView({ block: 'end' });
  }, [data?.messages.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !token) return;
    setSending(true);
    try {
      const r = await fetch(wsPath(ws, `/me/${encodeURIComponent(token)}/messages`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      setData(j.result);
      setText('');
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (!token || (error && !data)) {
    return (
      <main className="book">
        <section className="book-card" role="alert">
          <h1 className="book-title">This link is not working</h1>
          <p className="muted">{token ? error : 'Open the link from your booking confirmation, on the device you booked with.'}</p>
          <a className="button" href={`/book?ws=${encodeURIComponent(ws)}`}>
            Book a visit
          </a>
        </section>
      </main>
    );
  }
  if (!data) {
    return (
      <div className="loading" role="status" aria-live="polite">
        <span className="spinner" aria-hidden /> Loading your visits…
      </div>
    );
  }

  return (
    <main className="book portal">
      <header className="book-head">
        <div className="book-avatar" aria-hidden>
          {(data.business.trim()[0] ?? '•').toUpperCase()}
        </div>
        <div>
          <h1 className="book-title">{data.business}</h1>
          <p className="muted">Hi {data.name.split(' ')[0]}. This page is just for you.</p>
        </div>
      </header>

      <section className="book-card">
        <h2>Your visits</h2>
        {data.bookings.length === 0 && <p className="muted">No visits yet.</p>}
        <ul className="visit-list">
          {data.bookings.map((v) => {
            const d = describe(v);
            return (
              <li key={v.id} className={`visit ${d.tone}`}>
                <div className="visit-when">
                  <strong>{v.serviceName}</strong>
                  <span>
                    {relDay(v.start, data.now)}, {fmtTime(v.start)}
                  </span>
                  <span className="muted small">{fmtDay(v.start)}</span>
                </div>
                <div className="visit-status">
                  <strong>{d.title}</strong>
                  <span>{d.text}</span>
                  {v.approvalLink && (
                    <a className="paypal" href={v.approvalLink}>
                      {v.state === 'HOLD_FAILED' ? 'Approve again with PayPal' : 'Approve with PayPal'}
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <a className="button" href={`/book?ws=${encodeURIComponent(ws)}`}>
          Book another visit
        </a>
      </section>

      <section className="book-card chat" aria-labelledby="chat-h">
        <h2 id="chat-h">Message {data.business}</h2>
        <div className="msgs" role="log" aria-label="Conversation" tabIndex={0}>
          {data.messages.length === 0 && (
            <p className="muted small">
              <Icon name="chat" size={16} /> Need to cancel, run late or ask something? Write here. {data.owner} sees it right away.
            </p>
          )}
          {data.messages.map((m) => (
            <div key={m.id} className={m.from === 'client' ? 'msg out' : 'msg in'}>
              <span className="who">{m.from === 'client' ? 'You' : data.business}</span>
              {m.text}
              <span className="when">{fmtTime(m.at)}</span>
            </div>
          ))}
          <div ref={end} />
        </div>
        <form onSubmit={send} className="compose">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" aria-label="Message" maxLength={500} />
          <button className="primary" disabled={sending || !text.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </section>
    </main>
  );
}
