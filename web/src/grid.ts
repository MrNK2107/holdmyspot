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

export const theme = themeQuartz.withParams({
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
