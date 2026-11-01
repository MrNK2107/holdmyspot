import { useState } from 'react';
import { type AgentRun, type Snapshot, type TraceStep, fmtDay, fmtTime } from './api';

const ACCESS_LABEL: Record<string, string> = {
  read: 'read only',
  model: 'model · label only',
  propose: 'proposal only, no money',
  end: 'end turn',
};

const GATE_LABEL: Record<AgentRun['gate']['kind'], string> = {
  owner_approval: 'Needs owner tap',
  auto_release: 'Released, $0 charged',
  refill: 'Refill first',
  code: 'Handled by code',
  none: 'No money moved',
};

function stepTag(s: TraceStep): { cls: string; text: string } {
  if (s.kind === 'tool' && s.source === 'paypal-agent-toolkit') return { cls: 'acc-read', text: 'read only · PayPal Agent Toolkit' };
  if (s.kind === 'tool') return { cls: `acc-${s.access ?? 'read'}`, text: ACCESS_LABEL[s.access ?? 'read'] };
  if (s.kind === 'denied') return { cls: 'acc-denied', text: 'denied · not in toolset' };
  if (s.kind === 'gate') return { cls: 'acc-gate', text: 'money gate' };
  if (s.kind === 'owner') return { cls: 'acc-owner', text: 'owner tap' };
  if (s.kind === 'code') return { cls: 'acc-code', text: 'deterministic code' };
  return { cls: s.name.startsWith('PayPal') ? 'acc-paypal' : 'acc-engine', text: s.name.startsWith('PayPal') ? 'engine → PayPal' : 'engine' };
}

function Steps({ run }: { run: AgentRun }) {
  return (
    <ol className="trace-steps">
      {run.steps.map((s) => {
        const tag = stepTag(s);
        return (
          <li key={s.n} className={`trace-step k-${s.kind}`}>
            <div className="trace-row">
              <code className="trace-name">
                {s.kind === 'tool' || s.kind === 'denied' ? `${s.name}(${s.args && Object.keys(s.args).length ? '…' : ''})` : s.name}
              </code>
              <span className={`trace-tag ${tag.cls}`}>{tag.text}</span>
            </div>
            {s.why && <div className="trace-why">{s.why}</div>}
            {s.args && Object.keys(s.args).length > 0 && (
              <div className="trace-io">
                <span>args</span> <code>{JSON.stringify(s.args)}</code>
              </div>
            )}
            {s.result && s.result !== 'done' && (
              <div className="trace-io">
                <span>{s.kind === 'tool' || s.kind === 'denied' ? 'result' : '→'}</span> <code>{s.result}</code>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Gate({ run }: { run: AgentRun }) {
  return (
    <div className={`trace-gate g-${run.gate.kind}${run.gate.resolved ? ' resolved' : ''}`}>
      <strong>{run.gate.resolved ? `Owner chose “${run.gate.resolved.replace(/_/g, ' ')}”` : GATE_LABEL[run.gate.kind]}</strong>
      {run.gate.resolved ? <span> · the engine acted on the tap (see the PayPal step above)</span> : run.gate.summary && <span> · {run.gate.summary}</span>}
    </div>
  );
}

/** One-line label for the compact card: effects say what changed, not just which kind of step it was. */
function miniLabel(x: TraceStep): string {
  if (x.kind !== 'effect' || !x.result) return x.name;
  if (x.name === 'booking state') return x.result.split(':')[0].toLowerCase();
  if (x.name.startsWith('PayPal call')) return `PayPal: ${x.result}`;
  return `${x.name}: ${x.result}`;
}

/** Compact card for the console side column: the latest run for the selected booking (or the latest overall). */
export function AgentTraceCard({ s, selected, onOpen }: { s: Snapshot; selected: string | null; onOpen: () => void }) {
  const runs = s.agentRuns ?? [];
  const run = (selected && runs.find((r) => r.bookingId === selected)) || runs[0];
  if (!run) {
    return (
      <section className="card trace-card" aria-label="Front desk agent">
        <h2>Front desk agent</h2>
        <p className="muted">No client texts yet. Each text runs the agent; its tool calls show here.</p>
      </section>
    );
  }
  const tools = run.steps.filter((x) => x.kind === 'tool' || x.kind === 'denied');
  return (
    <section className="card trace-card" aria-label="Front desk agent">
      <h2>
        Front desk agent <span className="pill">{tools.length ? `${tools.length} tool calls` : "routed by code, no model"}</span>
      </h2>
      <p className="trace-msg">
        <strong>{run.clientName}:</strong> “{run.text}”
      </p>
      <ul className="trace-mini">
        {run.steps.map((x) => {
          const tag = stepTag(x);
          return (
            <li key={x.n} className={`k-${x.kind}`}>
              <code title={x.result ? `${x.name}: ${x.result}` : x.name}>{miniLabel(x)}</code> <span className={`trace-tag ${tag.cls}`}>{tag.text}</span>
            </li>
          );
        })}
      </ul>
      <Gate run={run} />
      <button className="linkish" onClick={onOpen}>
        Open the full agent trace →
      </button>
    </section>
  );
}

/** Full tab: every run with arguments, results, the policy check and the money gate. */
export function AgentTraceView({ s }: { s: Snapshot }) {
  const runs = s.agentRuns ?? [];
  const [open, setOpen] = useState<string | null>(runs[0]?.id ?? null);
  const current = runs.find((r) => r.id === open) ?? runs[0];
  return (
    <main className="trace-view">
      <section className="card trace-explain">
        <h2>How the front desk agent works</h2>
        <p>
          Every client text starts an agent run on <strong>{s.aiProvider === 'fake' ? 'the offline provider (deterministic, no API key)' : s.aiProvider}</strong>. The model picks one tool
          per step; the server runs it and feeds back the result.
        </p>
        <div className="toolsets">
          <div>
            <h3>Tools the agent has</h3>
            <ul>
              <li>
                <code>get_booking</code> <span className="trace-tag acc-read">read only</span>
              </li>
              <li>
                <code>get_policy</code> <span className="trace-tag acc-read">read only</span>
              </li>
              <li>
                <code>classify_message</code> <span className="trace-tag acc-model">model · label only</span>
              </li>
              <li>
                <code>propose_settlement</code> <span className="trace-tag acc-propose">proposal → policy engine</span>
              </li>
            </ul>
          </div>
          <div>
            <h3>When {s.owner} asks it something</h3>
            <ul>
              <li>
                <code>list_transactions</code> <span className="trace-tag acc-read">read only</span>
              </li>
              <li>
                <code>find_booking</code> <span className="trace-tag acc-read">read only</span>
              </li>
              <li>
                <code>propose_refund</code> <span className="trace-tag acc-propose">proposal → owner card</span>
              </li>
              {(s.agentToolkit?.tools ?? []).map((t) => (
                <li key={t}>
                  <code>{t}</code> <span className="trace-tag acc-read">read only · PayPal Agent Toolkit</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Tools it does not have</h3>
            <ul>
              {(s.agentToolsNotGiven ?? []).map((t) => (
                <li key={t}>
                  <code className="struck">{t}</code> <span className="trace-tag acc-denied">engine only</span>
                </li>
              ))}
              {(s.agentToolkit?.notGiven ?? []).map((t) => (
                <li key={t}>
                  <code className="struck">{t}</code> <span className="trace-tag acc-denied">not on allow-list</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="muted">
          {s.agentToolkit && (
            <>
              PayPal reads go through PayPal’s official Agent Toolkit (<code>{s.agentToolkit.package}</code>), limited to five read tools; any other toolkit call, and any non-GET request, is refused before it
              leaves the server.{' '}
            </>
          )}
          Releasing a hold (void) is automatic when the policy says so, because it only returns money. Any charge needs {s.owner}’s tap on a card. Asking for a tool outside the set is
          logged as denied and nothing runs.
        </p>
      </section>
      <div className="trace-split">
        <nav className="card trace-list" aria-label="Agent runs">
          <h2>Runs</h2>
          {runs.length === 0 && <p className="muted">No runs yet. Send a text from the phone on the Schedule tab, or play the guided demo.</p>}
          <ul>
            {runs.map((r) => (
              <li key={r.id}>
                <button className={r.id === current?.id ? 'on' : ''} aria-current={r.id === current?.id} onClick={() => setOpen(r.id)}>
                  <span className="trace-when">
                    {fmtDay(r.at)} {fmtTime(r.at)}
                  </span>
                  <span className="trace-who">{r.clientName}</span>
                  <span className={`trace-gate-mini g-${r.gate.kind}`}>{r.gate.resolved ? `owner: ${r.gate.resolved.replace(/_/g, ' ')}` : GATE_LABEL[r.gate.kind]}</span>
                  {r.steps.some((x) => x.kind === 'denied') && <span className="trace-gate-mini g-denied">denied call</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {current && (
          <section className="card trace-detail" aria-label="Run detail">
            <h2>
              {current.clientName} · {fmtDay(current.at)} {fmtTime(current.at)}
            </h2>
            <p className="trace-msg">“{current.text}”</p>
            <Steps run={current} />
            {current.answer && (
              <p className="trace-answer">
                <strong>Reply to {s.owner}:</strong> {current.answer}
              </p>
            )}
            <Gate run={current} />
            <p className="muted small">Provider: {current.provider === 'fake' ? 'offline (deterministic stand-in for Claude)' : current.provider}. Every step is also in the audit log.</p>
          </section>
        )}
      </div>
    </main>
  );
}

const ASK_EXAMPLES = ['How did this week go?', 'Alex apologised, refund her fee'];

/** The owner talks to the same agent. Anything that would move money comes back as a card to tap. */
export function AskFrontDesk({
  s,
  busy,
  onAsk,
  onState,
}: {
  s: Snapshot;
  busy: boolean;
  onAsk: (text: string) => Promise<{ state: Snapshot; result: { answer: string } }>;
  onState: (s: Snapshot) => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const last = (s.agentRuns ?? []).find((r) => r.clientId === 'owner');
  const send = async (t: string) => {
    if (!t.trim()) return;
    setSending(true);
    setErr(null);
    try {
      const r = await onAsk(t);
      onState(r.state);
      setText('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  return (
    <section className="card ask-card" aria-label="Ask your front desk">
      <h2>Ask your front desk</h2>
      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label className="sr-only" htmlFor="ask-input">
          Ask the front desk agent
        </label>
        <input id="ask-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. refund Alex, or how did this week go?" maxLength={300} />
        <button className="primary" disabled={busy || sending || !text.trim()}>
          {sending ? 'Asking…' : 'Ask'}
        </button>
      </form>
      <div className="ask-examples">
        {ASK_EXAMPLES.map((q) => (
          <button key={q} className="ask-chip" disabled={busy || sending} onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>
      {err && <p className="demo-err">{err}</p>}
      {last?.answer && (
        <p className="trace-answer" aria-live="polite">
          <strong>Front desk:</strong> {last.answer}
          {last.gate.resolved && <em> Done: you chose “{last.gate.resolved}”.</em>}
        </p>
      )}
    </section>
  );
}
