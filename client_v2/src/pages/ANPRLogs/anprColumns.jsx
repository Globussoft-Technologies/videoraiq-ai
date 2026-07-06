import React from 'react';
import moment from 'moment-timezone';
import { Image } from 'lucide-react';
import { styles } from './anprState';
import ImageWithLoader from '@/pages/AttendanceLogs/components/ImageWithLoader';

const severityClass = (severity) => {
  const s = (severity || '--').toLowerCase();
  return s === 'low'
    ? 'text-[var(--ok)] bg-[var(--ok)]/15'
    : s === 'moderate'
      ? 'text-[var(--warn)] bg-[var(--warn)]/15'
      : s === 'high'
        ? 'text-[var(--crit)] bg-[var(--crit)]/15'
        : 'text-[var(--tx3)] bg-[var(--bg2)]';
};

// Solid overlay colour for the on-image severity chip (vivid, like the
// prototype's ENTRY/EXIT badges).
const severityBg = (severity) => {
  const s = (severity || '--').toLowerCase();
  return s === 'low'
    ? '#22c55e'
    : s === 'moderate'
      ? '#f59e0b'
      : s === 'high'
        ? '#ff4d4d'
        : 'rgba(6,8,13,.7)';
};

const formatTime = (t) =>
  t ? moment.utc(t).tz(moment.tz.guess()).format('DD/MM/YYYY hh:mm A') : '--';

// Formats a raw plate value into the standard "SS DD LL NNNN" display style
// (e.g. "ka02mp9657" -> "KA02 MP9657"). Falls back to a plain uppercase of
// the raw value when it doesn't match the plate pattern (e.g. test data).
const formatPlate = (value) => {
  if (!value) return '--';
  const clean = value.trim().toUpperCase().replace(/\s+/g, '');
  const match = clean.match(/^([A-Z]{2}\d{1,2})([A-Z]{1,3}\d{1,4})$/);
  return match ? `${match[1]} ${match[2]}` : clean;
};

/**
 * Build the ANPR log table columns. `onSort(field)` toggles sort for the
 * sortable headers, `onPreview(url)` opens the incident image modal.
 */
export const buildColumns = ({ onSort, onPreview }) => [
  {
    accessorKey: 'snap',
    header: 'Snap',
    cell: ({ row }) => {
      const url = row.original.incidentImageUrl;
      return url ? (
        <button
          onClick={() => onPreview(url)}
          className="w-11 h-9 rounded-[6px] overflow-hidden border border-[var(--bd)] cursor-pointer hover:border-[var(--bd2)] transition-colors block"
          title="View image"
          aria-label="View incident image"
        >
          <ImageWithLoader
            src={url}
            alt={row.original.vehicleNumber}
            className="w-full h-full"
            imgClassName="w-full h-full object-cover"
          />
        </button>
      ) : (
        <span className="w-11 h-9 rounded-[6px] bg-[var(--bg2)] border border-[var(--bd)] flex items-center justify-center">
          <Image className="w-4 h-4 text-[var(--tx3)]" />
        </span>
      );
    },
  },
  {
    accessorKey: 'vehicleNumber',
    header: 'Vehicle Number',
    cell: ({ row }) => (
      <span
        className="inline-block text-[11px] font-bold tracking-[0.06em] text-[var(--tx)] bg-[var(--bg2)] border border-[var(--bd)] px-2.5 py-1 rounded-[6px]"
        style={{ fontFamily: 'var(--mono)' }}
      >
        {formatPlate(row.original.vehicleNumber)}
      </span>
    ),
  },
  {
    accessorKey: 'incidentName',
    header: () => (
      <button
        onClick={() => onSort('incidentName')}
        className="flex items-center gap-1 cursor-pointer uppercase tracking-[0.06em] text-[10px] text-[var(--tx3)] hover:text-[var(--tx2)] [font-family:var(--mono)]"
      >
        Incident Name
      </button>
    ),
    cell: ({ row }) => <span className={styles.text}>{row.original.incidentName}</span>,
  },
  {
    accessorKey: 'nvrName',
    header: () => (
      <button
        onClick={() => onSort('nvrData.nvrName')}
        className="flex items-center gap-1 cursor-pointer uppercase tracking-[0.06em] text-[10px] text-[var(--tx3)] hover:text-[var(--tx2)] [font-family:var(--mono)]"
      >
        NVR Name
      </button>
    ),
    cell: ({ row }) => <span className={styles.text}>{row.original.nvrName}</span>,
  },
  {
    accessorKey: 'channelName',
    header: 'Camera Name',
    cell: ({ row }) => <span className={styles.text}>{row.original.channelName}</span>,
  },
  {
    accessorKey: 'severity',
    header: 'Severity',
    cell: ({ row }) => (
      <span
        className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${severityClass(
          row.original.severity
        )}`}
      >
        {row.original.severity || '--'}
      </span>
    ),
  },
  {
    accessorKey: 'timeOfIncident',
    header: () => (
      <button
        onClick={() => onSort('timeOfIncident')}
        className="flex items-center gap-1 cursor-pointer uppercase tracking-[0.06em] text-[10px] text-[var(--tx3)] hover:text-[var(--tx2)] [font-family:var(--mono)]"
      >
        Time of Incident
      </button>
    ),
    cell: ({ row }) => <span className={styles.text}>{formatTime(row.original.createdAt)}</span>,
  },
];

/**
 * Grid-view card for a single ANPR log row — image-forward "plate overlay"
 * layout ported from the VideoraIQ prototype. Clicking the snapshot opens the
 * full-size image preview modal (ANPR's existing "big mode").
 * `ctx` = { onPreview }.
 */
export const renderANPRCard = (row, { onPreview }) => (
  <div className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[13px] overflow-hidden hover:border-[var(--bd2)] transition-colors h-full w-full min-w-0">
    {/* Snapshot fills the top of the card */}
    <div
      className="relative bg-[#0a0e15] flex items-center justify-center"
      style={{ aspectRatio: '4 / 3' }}
    >
      {row.incidentImageUrl ? (
        <ImageWithLoader
          src={row.incidentImageUrl}
          alt={row.vehicleNumber}
          className="absolute inset-0 cursor-pointer"
          imgClassName="w-full h-full object-cover"
          onClick={() => onPreview(row.incidentImageUrl)}
          title="Click to enlarge"
        />
      ) : (
        <Image className="w-10 h-10 text-[var(--tx3)]" />
      )}

      {/* Severity badge top-right */}
      <div
        className="absolute top-2 right-2 z-20 text-[9px] font-semibold px-[7px] py-[3px] rounded-[5px] capitalize text-white shadow-sm"
        style={{ background: severityBg(row.severity) }}
      >
        {row.severity || '--'}
      </div>

      {/* Plate overlay bottom-center */}
      <div
        className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 text-[13px] font-[700] tracking-[0.08em] text-white px-[11px] py-[4px] rounded-[6px] truncate max-w-[85%] text-center"
        style={{
          fontFamily: 'var(--mono)',
          background: 'rgba(6,8,13,.82)',
        }}
      >
        {formatPlate(row.vehicleNumber)}
      </div>
    </div>

    {/* Details */}
    <div className="p-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-[var(--tx2)] truncate">{row.incidentName}</span>
        <span
          className="text-[11px] text-[var(--tx3)] whitespace-nowrap"
          style={{ fontFamily: 'var(--mono)' }}
        >
          {formatTime(row.createdAt)}
        </span>
      </div>
      <div
        className="text-[12.5px] font-semibold mt-[5px] capitalize truncate"
        style={{ color: severityBg(row.severity) }}
      >
        {row.severity || '--'}
      </div>
      <div className="text-[10px] text-[var(--tx3)] mt-[2px] truncate">
        {row.nvrName} · {row.channelName}
      </div>
    </div>
  </div>
);
