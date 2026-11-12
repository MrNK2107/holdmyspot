import {
  CellStyleModule,
  ClientSideRowModelModule,
  CsvExportModule,
  ModuleRegistry,
  NumberFilterModule,
  PinnedRowModule,
  QuickFilterModule,
  RowStyleModule,
  RowAutoHeightModule,
  TextFilterModule,
  TooltipModule,
  themeQuartz,
} from 'ag-grid-community';

// AG Grid Community modules shared by the ledger and the eval table (lazy-loaded with them).
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  TextFilterModule,
  TooltipModule,
  NumberFilterModule,
  QuickFilterModule,
  CsvExportModule,
  PinnedRowModule,
  CellStyleModule,
  RowStyleModule,
  RowAutoHeightModule,
]);

// AG Grid takes pixels: follow the interface's fluid root size (set once at load)
const k = typeof document === 'undefined' ? 1 : parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;

export const theme = themeQuartz.withParams({
  accentColor: '#6b3fa0',
  backgroundColor: '#fffdf9',
  foregroundColor: '#1f1b24',
  borderColor: '#e6dfd5',
  headerBackgroundColor: '#f6f3ee',
  fontFamily: 'inherit',
  fontSize: Math.round(13 * k),
  rowHeight: Math.round(38 * k),
  headerHeight: Math.round(38 * k),
});
