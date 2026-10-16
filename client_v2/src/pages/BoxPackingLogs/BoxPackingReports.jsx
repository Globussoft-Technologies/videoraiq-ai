import { useMemo, useState } from 'react';
import moment from 'moment-timezone';
import PackingStationSummary from './PackingStationSummary';
import { mono, label, Panel, Chip, Kpi, KpiGrid, NoPeriodData } from '@/pages/SolderLine/ui';
import SnapshotCell from '@/pages/SolderLine/SnapshotCell';
import SolderPagination, { useSolderPagination } from '@/pages/SolderLine/SolderPagination';
import { mediaUrl } from '@/lib/format';
import { downloadBoxPackingPdf, downloadBoxPackingXlsx } from './boxPackingExport';
import { formatPackingDuration, packingStats, packingWorkerIds } from './boxPackingData';
import PackingZoneKpi from './PackingZoneKpi';
import { buildPackingReportRecords, buildPackingReportStations, REPORT_COLUMNS } from './packingReportData';
import { usePackingSort } from './PackingSort';
import BoxPackingAutoEmailReports from './BoxPackingAutoEmailReports';

const TYPES = [
  ['comparison', 'Worker Comparison', 'Packed boxes and average packing time by camera and worker'],
  ['hourly', 'Hourly activity', 'Packed boxes, average cycle and active workers per hour'],
  ['total', 'Total report', 'Box details and packing times for the selected cameras'],
];
const rangeLabel = (range, timezone) => {
  const start = moment.tz(range.startDate, timezone).format('DD MMM YYYY');
  const end = moment.tz(range.endDate, timezone).format('DD MMM YYYY');
  return start === end ? start : start + ' – ' + end;
};
const presets = (today, timezone) => {
  const end = moment.tz(today, timezone).startOf('day');
  const make = (title, start, finish) => ({ title, startDate: start.format('YYYY-MM-DD'), endDate: finish.format('YYYY-MM-DD') });
  return [make('Today', end.clone(), end.clone()), make('Yesterday', end.clone().subtract(1, 'day'), end.clone().subtract(1, 'day')), make('Last 7 days', end.clone().subtract(6, 'days'), end.clone()), make('This month', end.clone().startOf('month'), end.clone())];
};

function ReportKpis({ rows, scope }) {
  const stats = packingStats(rows);
  return <KpiGrid>
    <PackingZoneKpi stations={buildPackingReportStations(rows)} />
    <Kpi label="Boxes packed" value={stats.boxes} sub={scope} title="Number of packed-box records for the report's camera scope and date range." color="#22c55e" />
    <Kpi label="Average time to complete" value={rows.length ? formatPackingDuration(stats.avgTime) : '—'} sub={scope} title="Average recorded time to complete a box for the report's camera scope and date range." color="#a855f7" />
  </KpiGrid>;
}

function ReportTable({ records, type, sorting, resetKey }) {
  const pagination = useSolderPagination(records, resetKey);
  const columns = REPORT_COLUMNS[type];
  return <Panel pad={false} style={{ borderRadius: 12 }}>
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: type === 'total' ? 1000 : 640, borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
        <thead style={{ background: 'var(--bg2)', color: 'var(--tx3)', fontSize: 10 }}>
          <tr>{columns.map((column) => <th key={column} aria-sort={sorting.sort.key === column ? sorting.sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'} style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 600 }}>
            {column === 'Snapshot' ? column : sorting.header(column, column.toUpperCase())}
          </th>)}</tr>
        </thead>
        <tbody>{pagination.pageRows.map((record, index) => <tr key={pagination.start + index} style={{ borderTop: '1px solid var(--bd)' }}>
          {columns.map((column) => <td key={column} style={{ padding: '11px 14px', color: 'var(--tx)', ...(column === 'Box ID' || column === 'Boxes packed' ? { fontWeight: 700 } : {}), ...(/time|cycle|Recorded at/i.test(column) ? mono : {}) }}>
            {column === 'Snapshot' ? <SnapshotCell value={record.Snapshot ? mediaUrl(record.Snapshot) : ''} label={'Open snapshot for ' + record['Box ID']} /> : column === 'Active workers' ? <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}><span style={{ ...mono, fontWeight: 600 }}>{String(record[column]).split(' · ')[0]}</span><span style={{ color: 'var(--tx3)', fontSize: 11 }}>{String(record[column]).split(' · ').slice(1).join(' · ')}</span></div> : record[column]}
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <div style={{ padding: '0 14px' }}><SolderPagination pagination={pagination} label="Box Packing report" /></div>
  </Panel>;
}

export default function BoxPackingReports({ rows = [], channels = [], range, onRangeChange, today, timezone = 'Asia/Kolkata' }) {
  const [type, setType] = useState('comparison');
  const [selectedId, setSelectedId] = useState('all');
  const stations = useMemo(() => buildPackingReportStations(rows, channels), [rows, channels]);
  const viewingStations = useMemo(() => [{ id: 'all', name: 'All cameras', nvrName: `${stations.length} camera stations`, workers: packingWorkerIds(rows) }, ...stations], [stations, rows]);
  const selectedIndex = Math.max(0, viewingStations.findIndex((station) => station.id === selectedId));
  const selectedStation = viewingStations[selectedIndex];
  const selected = selectedStation?.id === 'all' ? null : selectedStation;
  const scope = selected ? selected.name + ' · ' + selected.nvrName : 'All cameras';
  const reportRows = useMemo(() => (selected ? selected.rows : rows).slice().sort((a, b) => new Date(b.time) - new Date(a.time)), [selected, rows]);
  const stats = packingStats(reportRows);
  const records = useMemo(() => buildPackingReportRecords(reportRows, type, timezone), [reportRows, type, timezone]);
  const sorting = usePackingSort(records, { key: null, direction: 'asc' }, (record, key) => key === 'Date & time' ? (record[key] === '—' ? null : moment.tz(record[key], 'DD MMM YYYY, hh:mm A', timezone).valueOf()) : record[key]);
  const meta = TYPES.find(([value]) => value === type);
  const periodLabel = rangeLabel(range, timezone);
  const exportOptions = {
    title: 'Box Packing Report · ' + meta[1], periodLabel: periodLabel + ' · ' + scope,
    timezone, filenamePrefix: 'box-packing-' + type + '-report', reportType: type,
    columns: REPORT_COLUMNS[type], records: sorting.rows,
  };
  const resetKey = JSON.stringify([type, selectedId, range.startDate, range.endDate, sorting.sort]);
  return <>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 20 }}>Box Packing Reports</span>
      <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Choose cameras, report and date range, then download the report</span>
    </div>
    <ReportKpis rows={rows} scope="Across all cameras" />
    <PackingStationSummary stations={viewingStations} selected={selectedIndex} onSelect={(index) => setSelectedId(viewingStations[index]?.id || 'all')} />
    {selected && <ReportKpis rows={reportRows} scope="Selected camera" />}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 250px', maxWidth: 310, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Panel style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14 }}>
          <div style={label}>Report</div>
          {TYPES.map(([value, title, description]) => <button key={value} type="button" onClick={() => setType(value)} aria-pressed={type === value}
            style={{ padding: 12, borderRadius: 11, cursor: 'pointer', textAlign: 'left', color: 'var(--tx)', background: type === value ? 'linear-gradient(135deg, rgba(59,130,246,.16), rgba(168,85,247,.08))' : 'transparent', border: '1px solid ' + (type === value ? 'var(--blue)' : 'var(--bd)') }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{title}</span>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--tx3)', marginTop: 4 }}>{description}</span>
          </button>)}
        </Panel>
        <Panel style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
          <div style={label}>Period</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>{presets(today, timezone).map((preset) => <Chip key={preset.title} on={range.startDate === preset.startDate && range.endDate === preset.endDate} color="var(--blue)" onClick={() => onRangeChange(preset)}>{preset.title}</Chip>)}</div>
          <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{periodLabel} · {timezone}</div>
          <div style={{ ...label, marginTop: 4 }}>Download</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button type="button" disabled={!reportRows.length} onClick={() => downloadBoxPackingPdf(reportRows, stats, exportOptions)} style={{ height: 40, border: 0, borderRadius: 10, color: '#fff', background: 'linear-gradient(135deg, #3b82f6, #a855f7)', cursor: 'pointer' }}>PDF</button>
            <button type="button" disabled={!reportRows.length} onClick={() => downloadBoxPackingXlsx(reportRows, exportOptions)} style={{ height: 40, border: '1px solid var(--bd2)', borderRadius: 10, color: 'var(--tx)', background: 'var(--bg2)', cursor: 'pointer' }}>Excel</button>
          </div>
          <BoxPackingAutoEmailReports previewRows={reportRows} periodLabel={periodLabel + ' · ' + timezone} reportType={type} />
        </Panel>
      </div>
      <Panel pad={false} style={{ flex: '999 1 560px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 22px', borderBottom: '1px solid var(--bd)', background: 'linear-gradient(135deg, rgba(59,130,246,.1), rgba(168,85,247,.06))', flexWrap: 'wrap' }}>
          <div><div style={label}>Preview · Box packing</div><div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 22, marginTop: 4 }}>{meta[1]}</div><div style={{ ...mono, fontSize: 11, color: 'var(--tx3)', marginTop: 3 }}>{periodLabel} · {scope}</div></div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)' }}>{reportRows.length} boxes</span>
        </div>
        <div style={{ padding: '18px 22px' }}>{reportRows.length ? <ReportTable records={sorting.rows} type={type} sorting={sorting} resetKey={resetKey} /> : <NoPeriodData minH={220} />}</div>
      </Panel>
    </div>
  </>;
}
