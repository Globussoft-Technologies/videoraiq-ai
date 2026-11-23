import React, { useState } from 'react';
import moment from 'moment-timezone';
import { Activity, ArrowDown, ArrowUp, ArrowUpDown, Clock, MapPin, Server, UserRound, Video } from 'lucide-react';
import usePagedLogImagePreview from '@/hooks/usePagedLogImagePreview';
import { getConfiguredTimezone } from '@/utils/timezone';
import ReusableTablePage from '@/pages/AttendanceLogs/components/ReusableTablePage';
import ExportButton, { PdfViewExportButton } from '@/pages/AttendanceLogs/components/ExportButton';
import ImageWithLoader from '@/pages/AttendanceLogs/components/ImageWithLoader';
import ImagePreviewModal from '@/pages/ANPRLogs/components/ImagePreviewModal';
import { handleDeskAbsenceExport } from './deskAbsenceExport';
import { getDeskAbsenceLogs } from './Api';

const imageOf = (row) => row.imageUrl;
const fields = [
  ['severity', 'Severity'],
  ['status', 'Status'],
  ['nvrName', 'NVR Name'],
  ['channelName', 'Camera Name'],
  ['description', 'Description'],
  ['zoneName', 'Zone'],
  ['incidentTime', 'Time of Incident'],
];
const cardFields = [
  ['status', 'Status', UserRound],
  ['description', 'Description', Activity],
  ['nvrName', 'NVR', Server],
  ['channelName', 'Camera', Video],
  ['zoneName', 'Zone', MapPin],
  ['incidentTime', 'Time of Incident', Clock],
];
const severityClasses = new Map([
  ['High', 'bg-red-100 text-red-800'],
  ['Moderate', 'bg-amber-100 text-amber-900'],
  ['Low', 'bg-emerald-100 text-emerald-800'],
  ['Info', 'bg-blue-100 text-blue-800'],
]);

const SeverityBadge = ({ severity }) => (
  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${severityClasses.get(severity) || 'bg-slate-100 text-slate-700'}`}>
    {severity}
  </span>
);

export const mapDeskAbsenceImage = (item) => {
  const path = item.Image.trim();
  const severity = typeof item.severity === 'string' ? item.severity.trim().toLowerCase() : '';
  return {
    id: item._id,
    imageUrl: /^https?:\/\//i.test(path) ? path : `${import.meta.env.VITE_INCIDENT_URL || ''}${path}`,
    severity: severity ? severity[0].toUpperCase() + severity.slice(1) : 'Unspecified',
    status: item.personPresent === true ? 'Present' : item.personPresent === false ? 'Absent' : 'Unspecified',
    description: typeof item.description === 'string' ? item.description.trim() : '',
    nvrName: item.nvrData?.nvrName || '--',
    channelName: item.channelData?.customName || item.channelData?.name || '--',
    zoneName: item.zoneNames?.join(', ') || '--',
    incidentTime: item.timeOfIncident
      ? moment.utc(item.timeOfIncident).tz(getConfiguredTimezone()).format('DD/MM/YYYY hh:mm A')
      : '--',
  };
};

const fetchExportRows = async (params) => {
  const rows = [];
  const limit = 100;
  for (let skip = 0; ; skip += limit) {
    const res = await getDeskAbsenceLogs({ ...params, mode: 'images', skip, limit });
    const body = res?.data?.body?.data;
    if (body?.mode !== 'images') throw new Error('Could not load desk absence image logs');
    rows.push(...body.data.map(mapDeskAbsenceImage));
    if (body.data.length < limit || rows.length >= body.totalCount) return rows;
  }
};

export default function DeskAbsenceImageLogs({
  rows, loading, currentPage, totalCount, limit, setCurrentPage, onLimitChange,
  viewMode, setViewMode, stats, filterActions, filters, sort, onSort, logSearchControls,
}) {
  const [exporting, setExporting] = useState('');
  const preview = usePagedLogImagePreview({
    rows, currentPage, limit, totalCount, loading, setPage: setCurrentPage, imageOf,
  });
  const picture = (row, grid = false) => (
    <button
      type="button"
      aria-label="View incident image"
      className={`block cursor-pointer overflow-hidden ${grid ? 'aspect-[2/1] w-full focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--violet)]' : 'w-12 h-9 rounded-md border border-[var(--bd)]'}`}
      onClick={() => preview.openPreview(row.imageUrl, row.id)}
    >
      <ImageWithLoader
        src={row.imageUrl}
        alt="Desk absence detection"
        className="w-full h-full"
        imgClassName="w-full h-full object-cover"
      />
    </button>
  );

  const columns = [
    { id: 'image', header: 'Image', cell: ({ row }) => picture(row.original) },
    ...fields.map(([accessorKey, label]) => {
      if (accessorKey === 'description') {
        return {
          accessorKey,
          header: label,
          cell: ({ row }) => (
            <p className="min-w-40 max-w-80 whitespace-pre-line break-words">{row.original.description || '--'}</p>
          ),
        };
      }
      const direction = sort.sortField === accessorKey ? sort.sortOrder : null;
      const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;
      const action = direction === 'asc' ? 'descending' : 'ascending';
      return {
        accessorKey,
        ...(accessorKey === 'severity' && {
          cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
        }),
        header: () => (
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1.5 uppercase tracking-wider"
            aria-label={`${label}${direction ? `, sorted ${direction === 'asc' ? 'ascending' : 'descending'}` : ''}. Sort ${action}`}
            onClick={() => onSort(accessorKey)}
          >
            {label}
            <Icon className={`h-3.5 w-3.5 ${direction ? 'text-[var(--violet)]' : 'text-[var(--tx3)]'}`} aria-hidden="true" />
          </button>
        ),
      };
    }),
  ];
  const gridCard = (row) => (
    <div className="h-full w-full min-w-0 overflow-hidden rounded-[13px] border border-[var(--bd)] bg-[var(--bg1solid)] transition-colors hover:border-[var(--bd2)]">
      <div className="relative bg-[var(--bg2)]">
        {picture(row, true)}
        <div className="pointer-events-none absolute right-2 top-2">
          <SeverityBadge severity={row.severity} />
        </div>
      </div>
      <dl className="space-y-[9px] p-[11px]">
        {cardFields.map(([key, label, Icon]) => (
          <div key={key} className="flex min-w-0 items-start gap-2">
            <dt className="flex shrink-0 items-center gap-2 text-[9.5px] font-semibold uppercase tracking-wider text-[var(--tx)]">
              <Icon className="h-4 w-4 shrink-0 text-[var(--tx2)]" aria-hidden="true" />
              {label}
            </dt>
            <dd className="min-w-0 flex-1 whitespace-pre-line break-words text-right text-[11.5px] font-medium leading-4 text-[var(--tx2)]">
              {row[key] || '--'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );

  const runExport = async (format) => {
    if (loading || exporting) return;
    setExporting(format);
    try {
      await handleDeskAbsenceExport(format, {
        ...filters,
        fetchRows: fetchExportRows,
      });
    } finally {
      setExporting('');
    }
  };

  return (
    <>
      <ImagePreviewModal
        previewImage={preview.previewImage}
        loading={preview.previewImageLoading}
        setLoading={preview.setPreviewImageLoading}
        hasPrevious={preview.previewIndex > 0 || currentPage > 1}
        hasNext={preview.previewIndex >= 0 && (preview.previewIndex < preview.previewRows.length - 1 || currentPage < preview.pageCount)}
        onPrevious={() => preview.movePreview(-1)}
        onNext={() => preview.movePreview(1)}
        position={preview.previewIndex >= 0 ? preview.recentlyViewedIndex + 1 : 0}
        total={totalCount}
        onClose={preview.closePreview}
      />
      <ReusableTablePage
        data={rows}
        columns={columns}
        gridCard={gridCard}
        loading={loading}
        attendanceLogsCount={totalCount}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onPageChange={setCurrentPage}
        limit={limit}
        onLimitChange={onLimitChange}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        recentlyViewedId={preview.previewImage ? null : preview.recentlyViewedId}
        recentlyViewedIndex={preview.recentlyViewedIndex}
        recentlyViewedPulse={preview.recentlyViewedPulse}
        showSearch={false}
        showDateRange={false}
        dateFilterActions={logSearchControls}
        stats={stats}
      >
        <ExportButton disabled={!!exporting || loading} onClick={() => runExport('excel')}>
          {exporting === 'excel' ? 'Exporting…' : 'Excel'}
        </ExportButton>
        {loading || exporting === 'excel'
          ? <ExportButton disabled>PDF</ExportButton>
          : <PdfViewExportButton onSelect={runExport} />}
        {filterActions}
      </ReusableTablePage>
    </>
  );
}
