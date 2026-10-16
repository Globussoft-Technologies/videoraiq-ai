import { useMemo, useState } from 'react';
import moment from 'moment-timezone';
import { Download, FileSpreadsheet, ArrowDown, ArrowUp } from 'lucide-react';
import { Panel, SectionHead } from '@/pages/SolderLine/ui';
import { downloadPdf, downloadXlsx } from '@/pages/SolderLine/exports';
import SolderPagination, { useSolderPagination } from '@/pages/SolderLine/SolderPagination';
import { buildHygieneReportRows, HYGIENE_REPORT_TYPES } from './hygieneReportRows';

export default function HygieneReports({ data, trend, cameraName, filters, today, onRangeChange, updated, type, onTypeChange }) {
  const setType = onTypeChange;
  const [sort, setSort] = useState({ column: '', direction: 1 });
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState('');
  const meta = HYGIENE_REPORT_TYPES.find(r => r.id === type);
  const rows = useMemo(() => buildHygieneReportRows(type, data, trend, cameraName), [type, data, trend, cameraName]);
  const sorted = useMemo(() => !sort.column ? rows : [...rows].sort((a, b) => {
    const left = a[sort.column], right = b[sort.column];
    return sort.direction * (typeof left === 'number' && typeof right === 'number' ? left - right : String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true }));
  }), [rows, sort]);
  const scope = JSON.stringify([type, filters, sort]);
  const pagination = useSolderPagination(sorted, scope);
  const headers = Object.keys(rows[0] || {});
  const period = `${filters.startDate} - ${filters.endDate}`;
  const filename = `hygiene-${type}-${filters.startDate}-${filters.endDate}`;
  const periods = [
    ['Today', today, today],
    ['Yesterday', moment(today).subtract(1, 'day').format('YYYY-MM-DD'), moment(today).subtract(1, 'day').format('YYYY-MM-DD')],
    ['Last 7 days', moment(today).subtract(6, 'days').format('YYYY-MM-DD'), today],
    ['This month', moment(today).startOf('month').format('YYYY-MM-DD'), today],
  ];
  const download = async format => {
    setDownloading(true); setExportError('');
    try {
      if (format === 'pdf') await downloadPdf({ title: `Hygiene & Food Safety - ${meta.title}`, subtitle: `${period} | ${data.timezone} | Current camera, zone, category, severity and status filters apply`, rows: sorted, filename });
      else downloadXlsx(sorted, filename);
    } catch { setExportError('Could not generate the report. Please try again.'); }
    finally { setDownloading(false); }
  };
  return <>
    <SectionHead n="" color="#6366f1" title="Hygiene reports" sub="Choose a report and period, preview it, then download it" />
    <div className="hy-reports-layout"><aside className="hy-report-controls">
      <Panel><div className="hy-report-label">REPORT</div><div role="radiogroup" aria-label="Report type">{HYGIENE_REPORT_TYPES.map(r => <button key={r.id} type="button" role="radio" aria-checked={type === r.id} className={`hy-report-choice ${type === r.id ? 'active' : ''}`} onClick={() => { setType(r.id); setSort({ column: '', direction: 1 }); }}><i /><span><strong>{r.title}</strong><small>{r.description}</small></span></button>)}</div></Panel>
      <Panel><div className="hy-report-label">PERIOD</div><div className="hy-period-buttons">{periods.map(([label, startDate, endDate]) => <button key={label} type="button" className={filters.startDate === startDate && filters.endDate === endDate ? 'active' : ''} onClick={() => onRangeChange({ startDate, endDate })}>{label}</button>)}</div><div className="hy-report-label">DOWNLOAD</div><div className="hy-report-downloads"><button type="button" className="hy-button primary" disabled={downloading || !rows.length} onClick={() => download('pdf')}><Download size={14} />{downloading ? 'Preparing…' : 'PDF'}</button><button type="button" className="hy-button" disabled={downloading || !rows.length} onClick={() => download('xlsx')}><FileSpreadsheet size={14} />Excel</button></div><p className="hy-chart-note">Downloads include every matching row, including rows beyond the preview page.</p>{exportError && <p role="alert" className="hy-count-high">{exportError}</p>}</Panel>
    </aside><Panel pad={false} style={{ minWidth: 0 }}><header className="hy-report-preview-head"><div className="hy-report-label">PREVIEW · HYGIENE & FOOD SAFETY</div><h2>{meta.title}</h2><p>{period} · {data.timezone}</p><span>{updated ? `Updated ${moment(updated).tz(data.timezone).format('HH:mm')}` : ''} · {rows.length} rows</span></header>
      <div className="hy-report-summary"><span>Incident alerts <b>{data.summary.incidents || 0}</b></span><span>Reported violations <b>{data.summary.violations || 0}</b></span><span>High severity incidents <b>{data.summary.high || 0}</b></span></div>
      <div className="hy-report-preview-body"><div className="hy-table-wrap"><table className="hy-table"><thead><tr>{headers.map(column => <th key={column} aria-sort={sort.column === column ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}><button type="button" className="hy-sort-button" onClick={() => setSort(current => ({ column, direction: current.column === column ? -current.direction : 1 }))}>{column}{sort.column === column && (sort.direction === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}</button></th>)}</tr></thead><tbody>{pagination.pageRows.map((row, index) => <tr key={index}>{headers.map(column => <td key={column}>{row[column]}</td>)}</tr>)}</tbody></table>{!rows.length && <div className="hy-inline-empty">No matching records for this report and period.</div>}</div><SolderPagination pagination={pagination} label="Hygiene report" /><p className="hy-chart-note">Category totals count violations; location and daily totals also count incident records. Repeated alerts do not establish separate real-world events. Confidence is a model score, not a compliance rate.</p></div>
    </Panel></div>
  </>;
}
