import { useEffect, useMemo, useRef, useState } from 'react';
import moment from 'moment-timezone';
import { Boxes, ChevronDown, ChevronUp, Clock, Users } from 'lucide-react';
import PackingStationSummary from './PackingStationSummary';
import PackingMetricCard from './PackingMetricCard';
import { mono, label, Panel, Chip, KpiGrid, NoPeriodData } from '@/pages/SolderLine/ui';
import SnapshotCell from '@/pages/SolderLine/SnapshotCell';
import SolderPagination, { useSolderPagination } from '@/pages/SolderLine/SolderPagination';
import { mediaUrl } from '@/lib/format';
import { downloadBoxPackingPdf, downloadBoxPackingXlsx } from './boxPackingExport';
import { formatPackingTotalTime, packingEndTimestamp, packingStats, packingWorkerActivity, packingWorkerCountByStation, packingWorkerStationStats } from './boxPackingData';
import { buildPackingReportRecords, buildPackingReportStations, REPORT_COLUMNS } from './packingReportData';
import { usePackingSort } from './PackingSort';
import BoxPackingAutoEmailReports from './BoxPackingAutoEmailReports';
import { formatTime, generateHourOptions, generateMinuteOptions, generatePeriodOptions, parseTime } from '@/pages/AttendanceLogs/components/timeUtils';

const TYPES = [
  ['comparison', 'Worker Comparison', 'Packed boxes and total packing time by camera and worker'],
  ['hourly', 'Hourly activity', 'Packed boxes, total packing time and active workers per hour'],
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

const timeToMinutes = (value) => {
  if (!value) return null;
  const { hour, minute, period } = parseTime(value);
  if (!hour || !minute || !period) return null;
  let normalizedHour = Number(hour) % 12;
  if (period === 'PM') normalizedHour += 12;
  return normalizedHour * 60 + Number(minute);
};

const timeRangeError = (fromTime, toTime) => {
  if (fromTime && !toTime) return 'Select a "To" time to apply the time range.';
  if (!fromTime && toTime) return 'Select a "From" time to apply the time range.';
  if (!fromTime || !toTime) return '';
  const from = timeToMinutes(fromTime);
  const to = timeToMinutes(toTime);
  return from != null && to != null && from > to
    ? '"To" must be the same time as or later than "From".'
    : '';
};

function CompactTimeField({ label: fieldLabel, value, onChange, bound, boundMode }) {
  const [parts, setParts] = useState(() => parseTime(value));
  useEffect(() => {
    const current = formatTime(parts.hour, parts.minute, parts.period);
    if (value !== current) setParts(parseTime(value));
  }, [value]);

  const update = (part, next) => {
    const merged = { ...parts, [part]: next };
    setParts(merged);
    onChange(formatTime(merged.hour, merged.minute, merged.period));
  };

  const boundMinutes = timeToMinutes(bound);
  const isDisabled = (part, optionValue) => {
    if (boundMinutes == null) return false;
    const candidate = { ...parts, [part]: optionValue };
    const candidateMinutes = timeToMinutes(formatTime(candidate.hour, candidate.minute, candidate.period));
    if (candidateMinutes == null) return false;
    return boundMode === 'min' ? candidateMinutes < boundMinutes : candidateMinutes > boundMinutes;
  };

  const selectStyle = {
    width: '100%', height: 36, padding: '0 8px', borderRadius: 7,
    border: '1px solid var(--bd2)', background: 'var(--bg1)', color: 'var(--tx2)',
    fontSize: 11.5, outline: 'none', cursor: 'pointer',
  };

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx3)' }}>{fieldLabel}</span>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 74px', gap: 6 }}>
      <select aria-label={`${fieldLabel} hour`} value={parts.hour} onChange={(event) => update('hour', event.target.value)} style={selectStyle}>
        <option value="">HH</option>{generateHourOptions().map((option) => <option key={option} value={option} disabled={isDisabled('hour', option)}>{option}</option>)}
      </select>
      <select aria-label={`${fieldLabel} minute`} value={parts.minute} onChange={(event) => update('minute', event.target.value)} style={selectStyle}>
        <option value="">MM</option>{generateMinuteOptions().map((option) => <option key={option} value={option} disabled={isDisabled('minute', option)}>{option}</option>)}
      </select>
      <select aria-label={`${fieldLabel} period`} value={parts.period} onChange={(event) => update('period', event.target.value)} style={selectStyle}>
        <option value="">--</option>{generatePeriodOptions().map((option) => <option key={option} value={option} disabled={isDisabled('period', option)}>{option}</option>)}
      </select>
    </div>
  </div>;
}

function ReportFilters({ fromTime, toTime, setFromTime, setToTime }) {
  const [open, setOpen] = useState(false);
  const [timeExpanded, setTimeExpanded] = useState(false);
  const ref = useRef(null);
  const error = timeRangeError(fromTime, toTime);
  const activeCount = [fromTime, toTime].filter(Boolean).length;

  useEffect(() => {
    if (fromTime || toTime) setTimeExpanded(true);
  }, [fromTime, toTime]);

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', dismiss);
    return () => document.removeEventListener('mousedown', dismiss);
  }, [open]);

  const reset = () => {
    setFromTime('');
    setToTime('');
  };

  return <div ref={ref} style={{ position: 'relative' }}>
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', border: `1px solid ${activeCount ? 'var(--blue)' : 'var(--bd2)'}`, background: activeCount ? 'rgba(59,130,246,.08)' : 'var(--bg2)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: activeCount ? 'var(--blue)' : 'var(--tx2)', boxShadow: open ? '0 0 0 3px rgba(59,130,246,.15)' : 'none' }}>
      Filters
      {activeCount > 0 && <span style={{ minWidth: 18, height: 18, display: 'grid', placeItems: 'center', borderRadius: 99, background: 'var(--blue)', color: '#fff', fontSize: 10 }}>{activeCount}</span>}
    </button>
    {open && <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300, width: 280, maxWidth: 'min(280px, calc(100vw - 24px))', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg1solid)', border: '1px solid var(--bd)', borderRadius: 12, boxShadow: '0 10px 32px rgba(0,0,0,.22)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--bd)', paddingBottom: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tx)' }}>Additional Filters</span>
        {activeCount > 0 && <button type="button" onClick={reset} style={{ fontSize: 11, color: 'var(--crit)', background: 'none', border: 0, cursor: 'pointer', fontWeight: 600 }}>Reset all</button>}
      </div>
      <div style={{ borderRadius: 10, background: 'var(--bg2)', border: `1px solid ${error ? 'var(--crit)' : 'var(--bd)'}`, overflow: 'hidden' }}>
        <button type="button" onClick={() => setTimeExpanded((value) => !value)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 12px', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={13} style={{ color: 'var(--tx3)' }} /><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)' }}>Time Range</span>{activeCount > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', background: 'rgba(59,130,246,.12)', borderRadius: 999, padding: '1px 7px' }}>{activeCount}</span>}</span>
          {timeExpanded ? <ChevronUp size={14} style={{ color: 'var(--tx3)' }} /> : <ChevronDown size={14} style={{ color: 'var(--tx3)' }} />}
        </button>
        {timeExpanded && <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 12px 12px' }}>
          <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>Pick a same-day window (e.g. 9:00 AM to 6:00 PM).</div>
          <CompactTimeField label="From" value={fromTime} onChange={setFromTime} bound={toTime} boundMode="max" />
          <CompactTimeField label="To" value={toTime} onChange={setToTime} bound={fromTime} boundMode="min" />
          {error && <div style={{ fontSize: 11, color: 'var(--crit)', fontWeight: 600 }}>{error}</div>}
        </div>}
      </div>
    </div>}
  </div>;
}

function ReportKpis({ rows, scope }) {
  const stats = packingStats(rows);
  const workers = packingWorkerActivity(rows);
  const workerStats = packingWorkerStationStats(rows);
  const completedWorkers = workerStats.completed;
  const inactiveWorkers = packingWorkerCountByStation(rows) - completedWorkers;
  const activity = workers.length
    ? `${completedWorkers} completed · ${workers.reduce((total, worker) => total + worker.boxes, 0)} boxes${inactiveWorkers ? ` · ${inactiveWorkers} no activity` : ''}`
    : 'No workers recorded';
  return <KpiGrid>
    <PackingMetricCard label="Total workers" value={workerStats.total} detail={activity} icon={Users} color="#3b82f6" />
    <PackingMetricCard label="Boxes packed" value={stats.boxes} detail={scope} icon={Boxes} color="#22c55e" />
    <PackingMetricCard label="Total packing time" value={formatPackingTotalTime(rows)} detail={scope} icon={Clock} color="#a855f7" />
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

export default function BoxPackingReports({ rows = [], channels = [], range, onRangeChange, today, timezone = 'Asia/Kolkata', timeRange = {}, onTimeRangeChange = () => {} }) {
  const [type, setType] = useState('comparison');
  const [selectedId, setSelectedId] = useState('all');
  const fromTime = timeRange.fromTime || '';
  const toTime = timeRange.toTime || '';
  const timeError = timeRangeError(fromTime, toTime);
  const filteredRows = useMemo(() => {
    if (timeError || !fromTime || !toTime) return rows;
    const from = timeToMinutes(fromTime);
    const to = timeToMinutes(toTime);
    return rows.filter((row) => {
      const timestamp = packingEndTimestamp(row);
      if (!timestamp) return false;
      const value = moment.tz(timestamp, timezone);
      if (!value.isValid()) return false;
      const minutes = value.hours() * 60 + value.minutes();
      return minutes >= from && minutes <= to;
    });
  }, [rows, fromTime, toTime, timeError, timezone]);
  const stations = useMemo(() => buildPackingReportStations(filteredRows, channels), [filteredRows, channels]);
  const viewingStations = useMemo(() => [{ id: 'all', name: 'All cameras', nvrName: `${stations.length} camera stations`, workers: packingWorkerActivity(filteredRows).map((worker) => worker.id) }, ...stations], [stations, filteredRows]);
  const selectedIndex = Math.max(0, viewingStations.findIndex((station) => station.id === selectedId));
  const selectedStation = viewingStations[selectedIndex];
  const selected = selectedStation?.id === 'all' ? null : selectedStation;
  const scope = selected ? selected.name + ' · ' + selected.nvrName : 'All cameras';
  const reportRows = useMemo(() => (selected ? selected.rows : filteredRows).slice().sort((a, b) => new Date(b.time) - new Date(a.time)), [selected, filteredRows]);
  const stats = packingStats(reportRows);
  const records = useMemo(() => buildPackingReportRecords(reportRows, type, timezone), [reportRows, type, timezone]);
  const sorting = usePackingSort(records, { key: null, direction: 'asc' }, (record, key) => key === 'Date' ? (record[key] === '—' ? null : moment.tz(record[key], 'DD MMM YYYY', timezone).valueOf()) : record[key]);
  const meta = TYPES.find(([value]) => value === type);
  const periodLabel = rangeLabel(range, timezone);
  const timeLabel = !timeError && fromTime && toTime ? `${fromTime} – ${toTime}` : '';
  const reportPeriodLabel = timeLabel ? `${periodLabel} · ${timeLabel}` : periodLabel;
  const exportOptions = {
    title: 'Box Packing Report · ' + meta[1], periodLabel: reportPeriodLabel + ' · ' + scope,
    timezone, filenamePrefix: 'box-packing-' + type + '-report', reportType: type,
    columns: REPORT_COLUMNS[type], records: sorting.rows,
  };
  const resetKey = JSON.stringify([type, selectedId, range.startDate, range.endDate, fromTime, toTime, sorting.sort]);
  return <>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 20 }}>Box Packing Reports</span>
      <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Choose cameras, report and date range, then download the report</span>
    </div>
    <ReportKpis rows={filteredRows} scope="Across all cameras" />
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
          <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{reportPeriodLabel} · {timezone}</div>
          <div style={{ ...label, marginTop: 4 }}>Download</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button type="button" disabled={!reportRows.length} onClick={() => downloadBoxPackingPdf(reportRows, stats, exportOptions)} style={{ height: 40, border: 0, borderRadius: 10, color: '#fff', background: 'linear-gradient(135deg, #3b82f6, #a855f7)', cursor: 'pointer' }}>PDF</button>
            <button type="button" disabled={!reportRows.length} onClick={() => downloadBoxPackingXlsx(reportRows, exportOptions)} style={{ height: 40, border: '1px solid var(--bd2)', borderRadius: 10, color: 'var(--tx)', background: 'var(--bg2)', cursor: 'pointer' }}>Excel</button>
          </div>
          <BoxPackingAutoEmailReports previewRows={reportRows} periodLabel={reportPeriodLabel + ' · ' + timezone} reportType={type} />
        </Panel>
      </div>
      <Panel pad={false} style={{ flex: '999 1 560px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 22px', borderBottom: '1px solid var(--bd)', background: 'linear-gradient(135deg, rgba(59,130,246,.1), rgba(168,85,247,.06))', flexWrap: 'wrap' }}>
          <div><div style={label}>Preview · Box packing</div><div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 22, marginTop: 4 }}>{meta[1]}</div><div style={{ ...mono, fontSize: 11, color: 'var(--tx3)', marginTop: 3 }}>{reportPeriodLabel} · {scope}</div></div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)' }}>{reportRows.length} boxes</span>
        </div>
        <div style={{ padding: '18px 22px' }}>{reportRows.length ? <ReportTable records={sorting.rows} type={type} sorting={sorting} resetKey={resetKey} /> : <NoPeriodData minH={220} />}</div>
      </Panel>
    </div>
  </>;
}
