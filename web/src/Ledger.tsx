import {
  CellStyleModule,
  ClientSideRowModelModule,
  type ColDef,
  type ColGroupDef,
  CsvExportModule,
  type GridApi,
  ModuleRegistry,
  NumberFilterModule,
  PinnedRowModule,
  QuickFilterModule,
  RowStyleModule,
  TextFilterModule,
  themeQuartz,
} from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Api, type AuditEntry, type BookingView, type Snapshot, fmtDay, fmtTime, usd } from './api';
import { MONEY_TEXT, bookingStateLabel, ledgerAmounts } from './money';

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  TextFilterModule,
  NumberFilterModule,
  QuickFilterModule,
  CsvExportModule,
  PinnedRowModule,
  CellStyleModule,
  RowStyleModule,
]);

const theme = themeQuartz.withParams({
  accentColor: '#6b3fa0',
  backgroundColor: '#fffdf9',
  foregroundColor: '#1f1b24',
  borderColor: '#e6dfd5',
  headerBackgroundColor: '#f6f3ee',
  fontFamily: 'inherit',
  fontSize: 13,
  rowHeight: 38,
  headerHeight: 38,
});

interface Row {
  id: string;
  start: number;
  client: string;
  service: string;
  state: string;
  money: string;
  heldCents: number;
  chargedCents: number;
  refundedCents: number;
  keptCents: number;
  authorizationId: string;
  captureId: string;
  refundId: string;
  policy: string;
  refill: string;
}

function toRow(b: BookingView, s: Snapshot): Row {
  const name = (id?: string) => (id ? (s.bookings.find((x) => x.id === id)?.clientName ?? id) : '');
  return {
    id: b.id,
    start: b.start,
    client: b.clientName,
    service: b.serviceName,
    state: bookingStateLabel(b),
    money: b.money,
    ...ledgerAmounts(b),
    authorizationId: b.authorizationId ?? '',
    captureId: b.captureId ?? '',
    refundId: b.refundId ?? '',
    policy: `v${b.policyVersion} · ${b.policyHash.slice(0, 6)}`,
    refill: b.refilledByBookingId ? `refilled by ${name(b.refilledByBookingId)}` : b.refillOfBookingId ? `refill of ${name(b.refillOfBookingId)}` : '',
  };
}

const money = (p: { value: number | null | undefined }) => (p.value ? usd(p.value) : '–');

/** One request as the real PayPal REST adapter builds it (server/src/paypal/preview.ts). */
interface RestRequest {
  seq: number;
  at: number;
  op: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

const OP_LABEL: Record<string, string> = {
  placeHold: 'Create AUTHORIZE order',
  authorizeApprovedOrder: 'Authorize approved order',
  capture: 'Capture authorization',
  void: 'Void authorization',
  reauthorize: 'Reauthorize',
  refund: 'Refund capture',
  createVaultSetup: 'Vault setup token',
  completeVaultSetup: 'Vault payment token',
};

/** AG Grid ledger: one row per booking with the PayPal ids behind each money state, plus every PayPal call. */
export function Ledger({ s, api, onSelect }: { s: Snapshot; api: Api; onSelect: (id: string) => void }) {
  const [view, setView] = useState<'bookings' | 'calls' | 'rest'>('bookings');
  const [rest, setRest] = useState<RestRequest[]>([]);
  const [picked, setPicked] = useState<RestRequest | null>(null);
  const [filter, setFilter] = useState('');
  const [calls, setCalls] = useState<AuditEntry[]>([]);
  const gridRef = useRef<GridApi | null>(null);

  useEffect(() => {
    if (view !== 'calls') return;
    api
      .audit()
      .then((all) => setCalls(all.filter((e) => e.kind === 'paypal' || e.kind === 'webhook').reverse()))
      .catch(() => setCalls([]));
  }, [view, api, s.now, s.bookings]);

  useEffect(() => {
    if (view !== 'rest') return;
    api
      .paypalRequests<RestRequest>()
      .then((x) => {
        setRest(Array.isArray(x) ? x : []);
        setPicked((p) => p ?? (Array.isArray(x) ? (x.find((r) => r.op === 'capture') ?? x[0] ?? null) : null));
      })
      .catch(() => setRest([]));
  }, [view, api, s.workspace, s.now, s.bookings]);

  const restCols = useMemo<ColDef<RestRequest>[]>(
    () => [
      { field: 'at', headerName: 'When', minWidth: 150, valueFormatter: (p) => `${fmtDay(p.value)} ${fmtTime(p.value)}` },
      { field: 'op', headerName: 'Operation', minWidth: 190, valueFormatter: (p) => OP_LABEL[p.value] ?? p.value },
      { field: 'method', headerName: 'Method', minWidth: 90 },
      { field: 'url', headerName: 'Endpoint', flex: 1, minWidth: 320, cellClass: 'mono', valueFormatter: (p) => String(p.value).replace(/^https:\/\/[^/]+/, '') },
      { headerName: 'PayPal-Request-Id', minWidth: 220, cellClass: 'mono', valueGetter: (p) => p.data?.headers?.['PayPal-Request-Id'] ?? '' },
    ],
    [],
  );

  const rows = useMemo(() => s.bookings.map((b) => toRow(b, s)), [s]);
  const totals = useMemo(
    () => [
      {
        id: 'total',
        start: 0,
        client: `Total (${rows.length})`,
        service: '',
        state: '',
        money: '',
        heldCents: rows.reduce((a, r) => a + r.heldCents, 0),
        chargedCents: rows.reduce((a, r) => a + r.chargedCents, 0),
        refundedCents: rows.reduce((a, r) => a + r.refundedCents, 0),
        keptCents: rows.reduce((a, r) => a + r.keptCents, 0),
        authorizationId: '',
        captureId: '',
        refundId: '',
        policy: '',
        refill: '',
      } satisfies Row,
    ],
    [rows],
  );

  const cols = useMemo<(ColDef<Row> | ColGroupDef<Row>)[]>(
    () => [
      { field: 'client', headerName: 'Client', width: 140, pinned: 'left' },
      { field: 'start', headerName: 'When', width: 160, sort: 'asc', valueFormatter: (p) => (p.value ? `${fmtDay(p.value)} ${fmtTime(p.value)}` : ''), filter: false },
      { field: 'service', headerName: 'Service', width: 124 },
      {
        headerName: 'Money',
        children: [
          {
            field: 'money',
            headerName: 'State',
            minWidth: 106, flex: 1,
            cellRenderer: (p: { value: string }) => (p.value ? <span className={`chip m-${p.value}`}>{MONEY_TEXT[p.value] ?? p.value}</span> : null),
            filterValueGetter: (p) => MONEY_TEXT[p.data?.money ?? ''] ?? '',
            getQuickFilterText: (p) => MONEY_TEXT[p.value] ?? p.value,
          },
          { field: 'heldCents', headerName: 'Held', minWidth: 80, flex: 1, type: 'rightAligned', valueFormatter: money, filter: 'agNumberColumnFilter' },
          { field: 'chargedCents', headerName: 'Charged', minWidth: 108, flex: 1, type: 'rightAligned', valueFormatter: money, filter: 'agNumberColumnFilter', cellClassRules: { 'cell-charged': (p) => !!p.value } },
          { field: 'refundedCents', headerName: 'Refunded', minWidth: 112, flex: 1, type: 'rightAligned', valueFormatter: money, filter: 'agNumberColumnFilter' },
          { field: 'keptCents', headerName: 'Kept (net)', headerTooltip: 'Charged minus refunded: what the owner actually keeps', minWidth: 112, flex: 1, type: 'rightAligned', valueFormatter: (p) => (p.data?.id === 'total' ? usd(p.value ?? 0) : money(p)), filter: 'agNumberColumnFilter' },
        ],
      },
      { field: 'state', headerName: 'Booking state', width: 168 },
      { field: 'refill', headerName: 'Refill', width: 162, tooltipField: 'refill' },
      {
        headerName: 'PayPal objects behind it',
        children: [
          { field: 'authorizationId', headerName: 'Authorization', minWidth: 172, flex: 1, cellClass: 'mono' },
          { field: 'captureId', headerName: 'Capture', minWidth: 172, flex: 1, cellClass: 'mono' },
          { field: 'refundId', headerName: 'Refund', minWidth: 172, flex: 1, cellClass: 'mono' },
        ],
      },
      { field: 'policy', headerName: 'Policy', minWidth: 112, flex: 1, cellClass: 'mono' },
    ],
    [],
  );

  const callCols = useMemo<ColDef<AuditEntry>[]>(
    () => [
      { field: 'at', headerName: 'When', width: 150, valueFormatter: (p) => `${fmtDay(p.value)} ${fmtTime(p.value)}` },
      { field: 'kind', headerName: 'Source', width: 110, valueFormatter: (p) => (p.value === 'paypal' ? 'API call' : 'webhook') },
      { field: 'bookingId', headerName: 'Client', width: 140, valueFormatter: (p) => s.bookings.find((b) => b.id === p.value)?.clientName ?? '' },
      { field: 'summary', headerName: 'What happened', flex: 1, minWidth: 320, cellClass: 'mono' },
    ],
    [s.bookings],
  );

  const defaultColDef = useMemo<ColDef>(() => ({ filter: true, resizable: true, sortable: true }), []);

  return (
    <main className="ledger">
      <section className="card ledger-card">
        <div className="ledger-head">
          <div>
            <h2>Money ledger</h2>
            <p className="muted">Every booking and the PayPal object behind its money state. Filter, sort, export for your bookkeeping.</p>
          </div>
          <div className="ledger-tools">
            <div className="seg" role="group" aria-label="Ledger view">
              <button className={view === 'bookings' ? 'on' : ''} aria-pressed={view === 'bookings'} onClick={() => setView('bookings')}>
                Bookings
              </button>
              <button className={view === 'calls' ? 'on' : ''} aria-pressed={view === 'calls'} onClick={() => setView('calls')}>
                PayPal calls
              </button>
              {s.paymentsMode === 'mock' && (
                <button className={view === 'rest' ? 'on' : ''} aria-pressed={view === 'rest'} onClick={() => setView('rest')}>
                  REST requests
                </button>
              )}
            </div>
            <label className="ledger-search">
              <span className="sr-only">Search the ledger</span>
              <input type="search" placeholder="Search: client, state, id…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </label>
            <button onClick={() => gridRef.current?.exportDataAsCsv({ fileName: `holdmyspot-${view}.csv` })}>Export CSV</button>
          </div>
        </div>
        <div className={`ledger-grid${view === 'rest' ? ' short' : ''}`}>
          {view === 'bookings' ? (
            <AgGridReact<Row>
              key="bookings"
              theme={theme}
              rowData={rows}
              columnDefs={cols}
              defaultColDef={defaultColDef}
              pinnedBottomRowData={totals}
              quickFilterText={filter}
              getRowId={(p) => p.data.id}
              onGridReady={(e) => (gridRef.current = e.api)}
              onRowClicked={(e) => e.data && e.data.id !== 'total' && onSelect(e.data.id)}
              rowClassRules={{ 'row-total': (p) => p.data?.id === 'total' }}
            />
          ) : view === 'rest' ? (
            <AgGridReact<RestRequest>
              key="rest"
              theme={theme}
              rowData={rest}
              columnDefs={restCols}
              defaultColDef={defaultColDef}
              quickFilterText={filter}
              getRowId={(p) => String(p.data.seq)}
              onGridReady={(e) => (gridRef.current = e.api as unknown as GridApi)}
              onRowClicked={(e) => e.data && setPicked(e.data)}
              overlayNoRowsTemplate="No requests yet."
            />
          ) : (
            <AgGridReact<AuditEntry>
              key="calls"
              theme={theme}
              rowData={calls}
              columnDefs={callCols}
              defaultColDef={defaultColDef}
              quickFilterText={filter}
              getRowId={(p) => String(p.data.seq)}
              onGridReady={(e) => (gridRef.current = e.api as unknown as GridApi)}
              overlayNoRowsTemplate="No PayPal calls yet."
            />
          )}
        </div>
        {view === 'rest' && (
          <div className="rest-detail">
            <p className="muted">
              The simulator answers these calls, but each request is built by the real PayPal REST adapter (<code>server/src/paypal/rest.ts</code>) exactly as it would go to the
              sandbox, minus the bearer token. Click a row to see it.
            </p>
            {picked && (
              <pre className="rest-json" tabIndex={0} aria-label="Selected PayPal request">
                {`${picked.method} ${picked.url}\n${Object.entries(picked.headers)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join('\n')}\n\n${picked.body === undefined ? '' : JSON.stringify(picked.body, null, 2)}`}
              </pre>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
