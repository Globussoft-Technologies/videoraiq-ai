import { useEffect, useMemo, useRef, useState } from 'react';
import moment from 'moment-timezone';
import { PackingSortHeader, usePackingSort } from './PackingSort';
import { ImageOff } from 'lucide-react';
import { mediaUrl } from '@/lib/format';
import ImagePreviewModal from '@/pages/ANPRLogs/components/ImagePreviewModal';
import ReusableTablePage, { DEFAULT_LOG_PAGE_SIZE } from '@/pages/AttendanceLogs/components/ReusableTablePage';
import { paginateRows } from '@/pages/SolderLine/pagination';
import MultiSelect from '@/pages/AttendanceLogs/components/MultiSelect';
import DownloadButton from '@/pages/SolderLine/DownloadButton';
import { mono } from '@/pages/SolderLine/ui';
import { downloadBoxPackingPdf, downloadBoxPackingXlsx } from './boxPackingExport';
import { downloadBoxPackingSnapshot, downloadBoxPackingSnapshotsZip } from './boxPackingSnapshots';
import { formatPackingDuration, packingWorkerCount } from './boxPackingData';

const cameraLabel = (row) => row.cameraName || row.camera || row.channelData?.customName || row.channelData?.name || row.channelName || 'Packing Camera';
const nvrLabel = (row) => row.nvrName || row.nvrData?.nvrName || row.nvrData?.name || row.nvr || 'NVR';
const hasImage = (row) => Boolean(row.Image || row.image || row.imageUrl || row.incidentImageUrl);
const packingDateTime = (value, timezone) => value && moment(value).isValid() ? moment.tz(value, timezone).format('DD MMM YYYY, hh:mm A') : '—';
const Filter = () => null;
const RotateCcw = () => null;

function ImageDownload({ row }) {
  return <DownloadButton disabled={!hasImage(row)} action={() => downloadBoxPackingSnapshot(row)} description="image" style={{ ...mono, height: 32, padding: '0 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--tx2)', background: 'var(--bg2)', border: '1px solid var(--bd2)' }}>Image</DownloadButton>;
}

function Snapshot({ row, onOpen, width = '100%', timezone = 'Asia/Kolkata' }) {
  const image = hasImage(row) ? mediaUrl(row.Image || row.image || row.imageUrl || row.incidentImageUrl) : null;
  const timestamp = row.time ? new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', timeZone: timezone }).format(new Date(row.time)) : '--';
  return <div style={{ position: 'relative', width, aspectRatio: '16 / 9', borderRadius: 10, overflow: 'hidden', background: '#0a0e15', border: '1px solid var(--bd2)' }}>
    {image ? <button type="button" onClick={() => onOpen(false)} aria-label={`Open snapshot for ${row.boxId}`} title="Open snapshot" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}><img src={image} alt={`Snapshot for ${row.boxId}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} /></button> : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, color: '#94a3b8', fontSize: 11 }}><ImageOff size={20} />No snapshot</div>}
    <span style={{ position: 'absolute', right: 8, bottom: 8, ...mono, fontSize: 10, color: '#fff', background: 'rgba(6,8,13,.76)', borderRadius: 5, padding: '3px 7px', pointerEvents: 'none' }}>{timestamp}</span>
  </div>;
}

export default function BoxPackingAlertLogs({ rows = [], periodLabel = 'Selected period', timezone = 'Asia/Kolkata', startDate, endDate, maxDate, onDateRangeChange }) {
  const [viewMode, setViewMode] = useState('table');
  const [search, setSearch] = useState('');
  const [filters, setFilterState] = useState({ completedBy: 'all', nvr: 'all', camera: 'all' });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterRef = useRef(null);
  useEffect(() => {
    if (!filtersOpen) return undefined;
    const dismissOutside = (event) => {
      if (filterRef.current && !filterRef.current.contains(event.target)) setFiltersOpen(false);
    };
    const dismissEscape = (event) => { if (event.key === 'Escape') setFiltersOpen(false); };
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('keydown', dismissEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('keydown', dismissEscape);
    };
  }, [filtersOpen]);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LOG_PAGE_SIZE);
  const [openSnapshot, setOpenSnapshot] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const setFilters = (next) => setFilterState((current) => { const resolved = typeof next === 'function' ? next(current) : next; return Object.values(resolved).every((value) => value === 'all') ? { completedBy: 'all', nvr: 'all', camera: 'all' } : resolved; });

  const options = useMemo(() => ({ completedBy: [...new Set(rows.map((row) => row.completedBy).filter(Boolean))].map((value) => ({ id: value, label: value })), nvr: [...new Set(rows.map(nvrLabel).filter(Boolean))].map((value) => ({ id: value, label: value })), camera: [...new Set(rows.map(cameraLabel).filter(Boolean))].map((value) => ({ id: value, label: value })) }), [rows]);
  const filteredRows = useMemo(() => rows.filter((row) => (!Array.isArray(filters.completedBy) || !filters.completedBy.length || filters.completedBy.includes(row.completedBy)) && (!Array.isArray(filters.nvr) || !filters.nvr.length || filters.nvr.includes(nvrLabel(row))) && (!Array.isArray(filters.camera) || !filters.camera.length || filters.camera.includes(cameraLabel(row)))), [rows, filters]);
  const sorting = usePackingSort(filteredRows, { key: 'time', direction: 'desc' }, (row, key) => {
    if (key === 'snapshot' || key === 'image') return hasImage(row) ? 1 : 0;
    if (key === 'cameraName') return cameraLabel(row);
    if (key === 'nvr') return nvrLabel(row);
    if (key === 'time') return new Date(row.time).getTime();
    if (key === 'boxNumber' || key === 'timeTakenSec') return Number(row[key]);
    return row[key];
  });
  const changeSort = (key) => { sorting.onSort(key); setCurrentPage(1); };
  // Use the same page calculation as both table layouts. Deriving this during
  // render avoids an export briefly using the previous page's effect state.
  const exportRows = useMemo(() => paginateRows(sorting.rows, currentPage, limit).pageRows, [sorting.rows, currentPage, limit]);

  const filteredStats = useMemo(() => ({ total: filteredRows.length, boxes: filteredRows.length, avgTime: filteredRows.length ? Math.round(filteredRows.reduce((sum, row) => sum + (Number(row.timeTakenSec) || 0), 0) / filteredRows.length) : 0, zones: new Set(filteredRows.map((row) => row.zone).filter(Boolean)).size }), [filteredRows]);
  const exportStats = useMemo(() => ({ total: exportRows.length, boxes: exportRows.length, avgTime: exportRows.length ? Math.round(exportRows.reduce((sum, row) => sum + (Number(row.timeTakenSec) || 0), 0) / exportRows.length) : 0 }), [exportRows]);
  const previewRows = useMemo(() => filteredRows.filter(hasImage), [filteredRows]);
  const previewIndex = openSnapshot ? previewRows.findIndex((row) => row.id === openSnapshot.id) : -1;
  const previewRow = previewIndex >= 0 ? previewRows[previewIndex] : null;
  const openPreview = (row, fullscreen = false) => { setPreviewLoading(true); setOpenSnapshot({ id: row.id, fullscreen }); };
  const movePreview = (offset) => { const next = previewRows[previewIndex + offset]; if (next) openPreview(next, openSnapshot?.fullscreen); };

  const stats = [
    { label: 'Active workers', value: packingWorkerCount(filteredRows), color: '#0891b2', title: "Distinct completedBy worker IDs, counted per camera/NVR across the date range." },
    { label: 'Boxes Packed', value: filteredStats.boxes, color: '#059669', title: 'Number of packed-box records matching the current filters and date range.' },
    { label: 'Average time to complete', value: formatPackingDuration(filteredStats.avgTime), color: '#7c3aed', title: 'Average time taken to complete a box, using records matching the current filters and date range.' },
  ];
  const activeFilterCount = Object.values(filters).filter((value) => Array.isArray(value) && value.length > 0).length;
  const clearFilters = () => { setFilters({ completedBy: 'all', nvr: 'all', camera: 'all' }); setCurrentPage(1); };
  const filterSelect = (key, text) => {
    if (key !== 'zone') return null;
    return <div ref={filterRef} style={{ position: 'relative' }}><button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 14px', borderRadius: 8, border: `1px solid ${activeFilterCount ? 'var(--blue)' : 'var(--bd2)'}`, color: activeFilterCount ? 'var(--blue)' : 'var(--tx2)', background: activeFilterCount ? 'rgba(59,130,246,.08)' : 'var(--bg2)', cursor: 'pointer', fontSize: 12, fontWeight: 600, boxShadow: filtersOpen ? '0 0 0 3px rgba(59,130,246,.15)' : 'none' }}>Filters{activeFilterCount > 0 && <span style={{ minWidth: 18, height: 18, display: 'grid', placeItems: 'center', borderRadius: 99, background: 'var(--blue)', color: '#fff', fontSize: 10 }}>{activeFilterCount}</span>}</button>{filtersOpen && <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300, width: 350, maxWidth: 'min(350px, calc(100vw - 24px))', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg1solid)', border: '1px solid var(--bd)', borderRadius: 12, boxShadow: '0 10px 32px rgba(0,0,0,.22)' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--bd)', paddingBottom: 10 }}><span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tx)' }}>Additional Filters</span>{activeFilterCount > 0 && <button type="button" onClick={clearFilters} style={{ fontSize: 11, color: 'var(--crit)', background: 'none', border: 0, cursor: 'pointer', fontWeight: 600 }}>Clear All</button>}</div><MultiSelect options={options.nvr} value={filters.nvr} onChange={(value) => { setFilters((current) => ({ ...current, nvr: value })); setCurrentPage(1); }} placeholder="Select NVR" searchable className="w-full" maxHeight="max-h-40" msg="No NVR Found" /><MultiSelect options={options.camera} value={filters.camera} onChange={(value) => { setFilters((current) => ({ ...current, camera: value })); setCurrentPage(1); }} placeholder="Select Camera" searchable className="w-full" maxHeight="max-h-40" msg="No Camera Found" /><MultiSelect options={options.completedBy} value={filters.completedBy} onChange={(value) => { setFilters((current) => ({ ...current, completedBy: value })); setCurrentPage(1); }} placeholder="Select worker" searchable className="w-full" maxHeight="max-h-40" msg="No workers found" /></div>}</div>;
  };

  const columns = [
    { accessorKey: 'snapshot', header: 'Snapshot', enableSorting: false, enableColumnFilter: false, cell: ({ row }) => <Snapshot row={row.original} width={150} timezone={timezone} onOpen={(fullscreen) => openPreview(row.original, fullscreen)} /> },
    { accessorKey: 'boxId', header: () => <PackingSortHeader column="boxId" sort={sorting.sort} onSort={changeSort}>Box ID</PackingSortHeader>, cell: ({ row }) => <span style={{ ...mono, fontWeight: 700, color: 'var(--tx)' }}>{row.original.boxId}</span> },
    { accessorKey: 'completedBy', header: () => <PackingSortHeader column="completedBy" sort={sorting.sort} onSort={changeSort}>Completed By</PackingSortHeader>, cell: ({ row }) => <span style={{ fontWeight: 600 }}>{row.original.completedBy}</span> },
    { accessorKey: 'nvr', header: () => <PackingSortHeader column="nvr" sort={sorting.sort} onSort={changeSort}>NVR</PackingSortHeader>, cell: ({ row }) => nvrLabel(row.original) },
    { accessorKey: 'cameraName', header: () => <PackingSortHeader column="cameraName" sort={sorting.sort} onSort={changeSort}>Camera Name</PackingSortHeader>, cell: ({ row }) => cameraLabel(row.original) },
    { accessorKey: 'boxNumber', header: () => <PackingSortHeader column="boxNumber" sort={sorting.sort} onSort={changeSort}>Box Number</PackingSortHeader> },
    { accessorKey: 'timeTakenSec', header: () => <PackingSortHeader column="timeTakenSec" sort={sorting.sort} onSort={changeSort}>Time to complete</PackingSortHeader>, cell: ({ row }) => <span style={mono}>{formatPackingDuration(row.original.timeTakenSec)}</span> },
    { accessorKey: 'time', header: () => <PackingSortHeader column="time" sort={sorting.sort} onSort={changeSort}>Date &amp; time</PackingSortHeader>, cell: ({ row }) => <span title={`Recorded at ${packingDateTime(row.original.time, timezone)} (${timezone})`} style={{ ...mono, whiteSpace: 'nowrap' }}>{packingDateTime(row.original.time, timezone)}</span> },
    { accessorKey: 'image', header: () => <PackingSortHeader column="image" sort={sorting.sort} onSort={changeSort}>Image</PackingSortHeader>, cell: ({ row }) => <ImageDownload row={row.original} /> },
  ];

  const gridCard = (row) => (
    <article key={row.id} className="flex flex-col h-full w-full min-w-0 overflow-hidden rounded-[13px] border bg-[var(--bg1solid)] hover:shadow-md transition-shadow" style={{ borderColor: 'color-mix(in srgb, var(--blue) 25%, var(--bd))' }}>
      <Snapshot row={row} timezone={timezone} onOpen={(fullscreen) => openPreview(row, fullscreen)} />
      <div className="flex flex-1 flex-col gap-2 p-3" style={{ background: 'linear-gradient(145deg, color-mix(in srgb, var(--blue) 6%, var(--bg1solid)), color-mix(in srgb, var(--violet) 4%, var(--bg1solid)))' }}>
        <div className="flex items-center justify-between gap-2">
          <strong className="text-sm text-[var(--blue)]" style={mono}>{row.boxId}</strong>
          <ImageDownload row={row} />
        </div>
        <div className="divide-y divide-[var(--bd)]">
          {[['Completed by', row.completedBy], ['NVR', nvrLabel(row)], ['Camera', cameraLabel(row)], ['Date & time', packingDateTime(row.time, timezone)]].map(([name, value]) => (
            <div key={name} className="flex items-start justify-between gap-3 py-1 text-xs">
              <span className="shrink-0 text-[var(--tx3)]">{name}</span>
              <span className="min-w-0 break-words text-right font-medium text-[var(--tx)]" style={name === 'Completed by' ? { color: 'var(--violet)' } : undefined}>{value || '—'}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-[var(--bd)] pt-2">
          {[['Box number', row.boxNumber, 'var(--blue)'], ['Time to complete', formatPackingDuration(row.timeTakenSec), 'var(--violet)']].map(([name, value, color]) => (
            <div key={name} className="rounded-md px-2 py-1.5" style={{ background: `color-mix(in srgb, ${color} 9%, var(--bg1solid))`, borderLeft: `2px solid ${color}` }}>
              <div className="text-[10px] text-[var(--tx2)]">{name}</div>
              <div className="mt-0.5 text-sm font-semibold" style={{ ...mono, color }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );

  return <div className="box-packing-alert-logs"><ReusableTablePage data={sorting.rows} columns={columns} searchKeys={['boxId', 'completedBy', 'zone', 'cameraName', 'nvr']} searchQuery={search} onSearchChange={(value) => { setSearch(value); setCurrentPage(1); }} startDate={startDate} endDate={endDate} maxDate={maxDate} datePickerVariant="preset" onDateRangeChange={onDateRangeChange} showSearch={false} showDateRange={false} stats={[]} statsVariant="modern" loading={false} currentPage={currentPage} setCurrentPage={setCurrentPage} limit={limit} onLimitChange={setLimit} viewMode={viewMode} onViewModeChange={setViewMode} gridCard={gridCard} tableContainerClassName="max-h-[62vh]"> <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}><Filter size={14} color="var(--tx3)" />{filterSelect('zone', 'Worker')}{filterSelect('nvr', 'NVR')}{filterSelect('camera', 'Camera')}{Object.values(filters).some((value) => value !== 'all') && <button type="button" onClick={() => setFilters({ zone: 'all', nvr: 'all', camera: 'all' })} title="Clear filters" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 34, padding: '0 9px', border: '1px solid var(--bd)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--violet)', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}><RotateCcw size={12} />Reset</button>}{<DownloadButton disabled={!exportRows.some(hasImage)} action={() => downloadBoxPackingSnapshotsZip(exportRows)} description="snapshots ZIP" style={{ ...mono, fontSize: 10.5, fontWeight: 700 }}>SNAPSHOTS .ZIP</DownloadButton>}{<DownloadButton disabled={!exportRows.length} action={() => downloadBoxPackingXlsx(exportRows, { reportType: 'alerts', title: 'Box Packing Alert Logs', periodLabel, timezone, filenamePrefix: 'box-packing-alert-report' })} description="Excel report" style={{ ...mono, fontSize: 10.5, fontWeight: 700 }}>XLSX</DownloadButton>}{<DownloadButton disabled={!exportRows.length} action={() => downloadBoxPackingPdf(exportRows, exportStats, { reportType: 'alerts', layout: viewMode === 'grid' ? 'grid' : 'list', title: 'Box Packing Alert Logs', periodLabel, timezone, filenamePrefix: 'box-packing-alert-report' })} description="PDF report" style={{ ...mono, fontSize: 10.5, fontWeight: 700 }}>PDF</DownloadButton>}</div></ReusableTablePage>{previewRow && <ImagePreviewModal previewImage={mediaUrl(previewRow.Image || previewRow.image || previewRow.imageUrl || previewRow.incidentImageUrl)} imageKey={previewRow.id} loading={previewLoading} setLoading={setPreviewLoading} hasPrevious={previewIndex > 0} hasNext={previewIndex < previewRows.length - 1} onPrevious={() => movePreview(-1)} onNext={() => movePreview(1)} position={previewIndex + 1} total={previewRows.length} onClose={() => setOpenSnapshot(null)} initialFullscreen={openSnapshot.fullscreen} />}</div>;
}
