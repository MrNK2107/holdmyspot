import {
  CellStyleModule,
  ClientSideRowModelModule,
  type ColDef,
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

const MONEY_TEXT: Record<string, string> = {
  none: 'no hold',
  vaulted: 'wallet saved',
  held: 'held',
  'pending-refill': 'refilling',
  voided: 'released',
  captured: 'charged',
  failed: 'hold failed',
  refunded: 'refunded',
};

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
  authorizationId: string;
  captureId: string;
  refundId: string;
  policy: string;
  refill: string;
}

function toRow(b: BookingView, s: Snapshot): Row {
  const name = (id?: string) => (id ? (s.bookings.find((x) => x.id === id)?.clientName ?? id) : '');
  const charged = b.captureId ? (b.capturedCents ?? b.holdCents) : 0;
  return {
    id: b.id,
    start: b.start,
    client: b.clientName,
    service: b.serviceName,
    state: b.state.replace(/_/g, ' ').toLowerCase(),
    money: b.money,
    heldCents: b.money === 'held' || b.money === 'pending-refill' ? b.holdCents : 0,
    chargedCents: charged,
    refundedCents: b.refundId ? charged : 0,
    authorizationId: b.authorizationId ?? '',
    captureId: b.captureId ?? '',
    refundId: b.refundId ?? '',
    policy: `v${b.policyVersion} · ${b.policyHash.slice(0, 8)}`,
    refill: b.refilledByBookingId ? `refilled by ${name(b.refilledByBookingId)}` : b.refillOfBookingId ? `refill of ${name(b.refillOfBookingId)}` : '',
  };
}

const money = (p: { value: number | null | undefined }) => (p.value ? usd(p.value) : '–');

/** AG Grid ledger: one row per booking with the PayPal ids behind each money state, plus every PayPal call. */
export function Ledger({ s, api, onSelect }: { s: Snapshot; api: Api; onSelect: (id: string) => void }) {
  const [view, setView] = useState<'bookings' | 'calls'>('bookings');
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
        authorizationId: '',
        captureId: '',
        refundId: '',
        policy: '',
        refill: '',
      } satisfies Row,
    ],
    [rows],
  );

  const cols = useMemo<ColDef<Row>[]>(
    () => [
      { field: 'start', headerName: 'When', width: 175, sort: 'asc', valueFormatter: (p) => (p.value ? `${fmtDay(p.value)} ${fmtTime(p.value)}` : ''), filter: false },
      { field: 'client', headerName: 'Client', width: 150, pinned: 'left' },
      { field: 'service', headerName: 'Service', width: 130 },
      {
        field: 'money',
        headerName: 'Money',
        width: 130,
        cellRenderer: (p: { value: string }) => (p.value ? <span className={`chip m-${p.value}`}>{MONEY_TEXT[p.value] ?? p.value}</span> : null),
        filterValueGetter: (p) => MONEY_TEXT[p.data?.money ?? ''] ?? '',
        getQuickFilterText: (p) => MONEY_TEXT[p.value] ?? p.value,
      },
      { field: 'heldCents', headerName: 'Held', width: 90, type: 'rightAligned', valueFormatter: money, filter: 'agNumberColumnFilter' },
      { field: 'chargedCents', headerName: 'Charged', width: 100, type: 'rightAligned', valueFormatter: money, filter: 'agNumberColumnFilter', cellClassRules: { 'cell-charged': (p) => !!p.value } },
      { field: 'refundedCents', headerName: 'Refunded', width: 105, type: 'rightAligned', valueFormatter: money, filter: 'agNumberColumnFilter' },
      { field: 'state', headerName: 'Booking state', width: 150 },
      { field: 'refill', headerName: 'Refill', width: 160 },
      { field: 'authorizationId', headerName: 'PayPal authorization', width: 190, cellClass: 'mono' },
      { field: 'captureId', headerName: 'Capture', width: 150, cellClass: 'mono' },
      { field: 'refundId', headerName: 'Refund', width: 150, cellClass: 'mono' },
      { field: 'policy', headerName: 'Policy', width: 130, cellClass: 'mono' },
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
            </div>
            <label className="ledger-search">
              <span className="sr-only">Search the ledger</span>
              <input type="search" placeholder="Search: client, charged, AUTH-…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </label>
            <button onClick={() => gridRef.current?.exportDataAsCsv({ fileName: `holdmyspot-${view}.csv` })}>Export CSV</button>
          </div>
        </div>
        <div className="ledger-grid">
          {view === 'bookings' ? (
            <AgGridReact<Row>
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
          ) : (
            <AgGridReact<AuditEntry>
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
      </section>
    </main>
  );
}
