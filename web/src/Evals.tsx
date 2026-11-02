import type { ColDef, GridApi } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { theme } from './grid';

interface EvalCase {
  suite: 'message reader' | 'prompt injection' | 'waitlist matcher';
  split: string;
  text: string;
  expected: string;
  got: string;
  pass: boolean;
  effect: string;
}

interface Split {
  n: number;
  intentMacroF1: number;
  reasonMacroF1: number;
  wrongfulCharges: number;
  wrongfulWaivers: number;
}

interface EvalReport {
  provider: string;
  messageReader: { dev: Split; heldout: Split };
  injections: { n: number; moneyEffects: number; deniedToolCalls: number };
  waitlist: { n: number; accuracy: number };
  cases: EvalCase[];
}

const SUITES = ['all', 'message reader', 'prompt injection', 'waitlist matcher'] as const;
type Suite = (typeof SUITES)[number];
const SUITE_LABEL: Record<Suite, string> = { all: 'All', 'message reader': 'Messages', 'prompt injection': 'Injections', 'waitlist matcher': 'Waitlist' };
const SET_LABEL: Record<string, string> = { dev: 'tuning set', heldout: 'held out' };
// narrow screens keep the columns that carry the verdict; suite and set stay reachable through the filter
const narrow = () => typeof window !== 'undefined' && window.innerWidth < 720;

/** Every eval case behind the numbers, in AG Grid: what the AI was given, what it should do, what it did. */
export function Evals() {
  const [r, setR] = useState<EvalReport | null>(null);
  const [err, setErr] = useState(false);
  const [suite, setSuite] = useState<Suite>('all');
  const [missesOnly, setMissesOnly] = useState(false);
  const [filter, setFilter] = useState('');
  const gridRef = useRef<GridApi | null>(null);

  useEffect(() => {
    fetch('/api/evals')
      .then((x) => (x.ok ? x.json() : Promise.reject(new Error(String(x.status)))))
      .then(setR)
      .catch(() => setErr(true));
  }, []);

  // misses first: they are what a reviewer should read (the sort is stable, so each suite keeps its order)
  const rows = useMemo(
    () => (r?.cases ?? []).filter((c) => (suite === 'all' || c.suite === suite) && (!missesOnly || !c.pass)).sort((a, b) => Number(a.pass) - Number(b.pass)),
    [r, suite, missesOnly],
  );

  const cols = useMemo<ColDef<EvalCase>[]>(
    () => [
      {
        field: 'pass',
        headerName: 'Result',
        width: 96,
        cellRenderer: (p: { value: boolean }) =>
          p.value ? (
            <span className="e-pass">
              <span className="e-dot" aria-hidden />
              pass
            </span>
          ) : (
            <span className="chip e-miss">miss</span>
          ),
        getQuickFilterText: (p) => (p.value ? 'pass' : 'miss'),
        filter: false,
      },
      { field: 'text', headerName: 'Client text', flex: 2, minWidth: 220, wrapText: true, autoHeight: true },
      { field: 'expected', headerName: 'Expected', flex: 1, minWidth: 170, cellClass: 'mono', wrapText: true, autoHeight: true },
      { field: 'got', headerName: 'Got', flex: 1, minWidth: 180, cellClass: 'mono', wrapText: true, autoHeight: true },
      { field: 'effect', headerName: 'What it means for money', flex: 1.4, minWidth: 220, wrapText: true, autoHeight: true },
      { field: 'suite', headerName: 'Suite', width: 150, hide: narrow() },
      { field: 'split', headerName: 'Set', width: 170, wrapText: true, autoHeight: true, hide: narrow(), valueFormatter: (p) => SET_LABEL[p.value] ?? p.value },
    ],
    [],
  );
  const defaultColDef = useMemo<ColDef>(() => ({ filter: true, resizable: true, sortable: true }), []);

  if (err) return <p className="muted">The eval run could not be loaded. Run <code>npm run eval</code> locally for the same numbers.</p>;
  if (!r)
    return (
      <div className="loading" role="status">
        <span className="spinner" aria-hidden /> Running the eval suite…
      </div>
    );

  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const misses = r.cases.filter((c) => !c.pass).length;
  return (
    <>
      <div className="strip eval-strip" aria-label="Eval results">
        <div>
          <span className="strip-n">{r.messageReader.heldout.intentMacroF1.toFixed(2)}</span>
          <span className="strip-l">intent F1, held-out texts ({r.messageReader.heldout.n})</span>
        </div>
        <div>
          <span className="strip-n">{r.messageReader.heldout.reasonMacroF1.toFixed(2)}</span>
          <span className="strip-l">reason F1, held-out texts</span>
        </div>
        <div className={r.injections.moneyEffects ? 'warn' : ''}>
          <span className="strip-n">{r.injections.moneyEffects}</span>
          <span className="strip-l">
            money moves from {r.injections.n} prompt injections × 2 modes ({r.injections.deniedToolCalls} tool calls denied)
          </span>
        </div>
        <div>
          <span className="strip-n">{pct(r.waitlist.accuracy)}</span>
          <span className="strip-l">waitlist matches correct ({r.waitlist.n})</span>
        </div>
      </div>
      <div className="ledger-head eval-tools">
        <div className="seg" role="group" aria-label="Eval suite">
          {SUITES.map((x) => (
            <button key={x} className={suite === x ? 'on' : ''} aria-pressed={suite === x} onClick={() => setSuite(x)}>
              {SUITE_LABEL[x]} <span className="seg-n">{x === 'all' ? r.cases.length : r.cases.filter((c) => c.suite === x).length}</span>
            </button>
          ))}
        </div>
        <div className="ledger-tools">
          <label className="eval-check">
            <input type="checkbox" checked={missesOnly} onChange={(e) => setMissesOnly(e.target.checked)} /> Misses only{' '}
            <span className="muted">
              ({misses} of {r.cases.length})
            </span>
          </label>
          <label className="ledger-search">
            <span className="sr-only">Search the eval cases</span>
            <input type="search" placeholder="Search texts, labels…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
          <button onClick={() => gridRef.current?.exportDataAsCsv({ fileName: 'holdmyspot-evals.csv' })}>Export CSV</button>
        </div>
      </div>
      <div className="ledger-grid eval-grid">
        <AgGridReact<EvalCase>
          theme={theme}
          rowData={rows}
          columnDefs={cols}
          defaultColDef={defaultColDef}
          quickFilterText={filter}
          onGridReady={(e) => (gridRef.current = e.api)}
          rowClassRules={{ 'row-miss': (p) => p.data?.pass === false }}
          overlayNoRowsTemplate="No cases match."
        />
      </div>
      <p className="muted small eval-note">
        Run on the {r.provider === 'fake' ? 'deterministic offline provider (the keyless demo’s stand-in for Claude)' : r.provider}, once per server start. The same cases run
        against Claude with <code>AI=anthropic npm run eval</code>. Injection cases go through a real engine and the PayPal simulator and count every capture, void,
        reauthorize and refund call. A message-reader miss never charges by itself: every fee still waits for the owner’s tap.
      </p>
    </>
  );
}
