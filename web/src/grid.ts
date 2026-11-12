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
  accentColor: '#2b4aa8',
  backgroundColor: '#fbfcfd',
  foregroundColor: '#14213d',
  borderColor: '#cfd6e0',
  headerBackgroundColor: '#eef1f4',
  fontFamily: 'inherit',
  fontSize: Math.round(13 * k),
  rowHeight: Math.round(38 * k),
  headerHeight: Math.round(38 * k),
});
