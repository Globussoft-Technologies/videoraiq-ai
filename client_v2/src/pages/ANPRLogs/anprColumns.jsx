import React from 'react';
import moment from 'moment-timezone';
import { Image } from 'lucide-react';
import { styles } from './anprState';

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

const formatTime = (t) =>
  t ? moment.utc(t).tz(moment.tz.guess()).format('DD/MM/YYYY hh:mm A') : '--';

/**
 * Build the ANPR log table columns. `onSort(field)` toggles sort for the
 * sortable headers, `onPreview(url)` opens the incident image modal.
 */
export const buildColumns = ({ onSort, onPreview }) => [
  {
    accessorKey: 'incidentName',
    header: () => (
      <button
        onClick={() => onSort('incidentName')}
        className="flex items-center gap-1 cursor-pointer"
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
        className="flex items-center gap-1 cursor-pointer"
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
    accessorKey: 'vehicleNumber',
    header: 'Vehicle Number',
    cell: ({ row }) => <span className={styles.text}>{row.original.vehicleNumber}</span>,
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
        className="flex items-center gap-1 cursor-pointer"
      >
        Time of Incident
      </button>
    ),
    cell: ({ row }) => <span className={styles.text}>{formatTime(row.original.createdAt)}</span>,
  },
  {
    accessorKey: 'action',
    header: 'Image',
    cell: ({ row }) => {
      const incidentUrl = row.original.incidentImageUrl;
      return (
        <button
          disabled={!incidentUrl}
          onClick={() => {
            if (incidentUrl) onPreview(incidentUrl);
          }}
          className={`p-2 rounded-full bg-transparent cursor-pointer ${
            !incidentUrl ? 'opacity-30 cursor-not-allowed' : 'hover:bg-[var(--bg2)]'
          }`}
          title="View incident image"
        >
          <Image className="w-5 h-5 text-[var(--brand)]" />
        </button>
      );
    },
  },
];

/**
 * Grid-view card for a single ANPR log row. Matches the V1 card layout exactly.
 */
export const renderANPRCard = (row, { onPreview }) => (
  <div className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[12px] overflow-hidden shadow-sm hover:shadow-md transition-shadow">
    {/* Image area */}
    <div className="relative w-full h-40 bg-[var(--bg2)] flex items-center justify-center">
      {row.incidentImageUrl ? (
        <img
          src={row.incidentImageUrl}
          alt="incident"
          className="w-full h-full object-cover cursor-pointer"
          onClick={() => onPreview(row.incidentImageUrl)}
        />
      ) : (
        <Image className="w-10 h-10 text-[var(--tx3)]" />
      )}
    </div>

    {/* Details */}
    <div className="p-3 space-y-2">
      <div>
        <p className="text-[10px] font-medium text-[var(--tx3)] uppercase tracking-wide">Incident Name</p>
        <p className="text-xs font-semibold text-[var(--brand)] truncate">{row.incidentName}</p>
      </div>
      <div>
        <p className="text-[10px] font-medium text-[var(--tx3)] uppercase tracking-wide">NVR Name</p>
        <p className="text-xs text-[var(--tx)] truncate">{row.nvrName}</p>
      </div>
      <div>
        <p className="text-[10px] font-medium text-[var(--tx3)] uppercase tracking-wide">Camera Name</p>
        <p className="text-xs text-[var(--tx)] truncate">{row.channelName}</p>
      </div>
      <div>
        <p className="text-[10px] font-medium text-[var(--tx3)] uppercase tracking-wide">
          Vehicle Number:{' '}
          <span className="text-xs text-[var(--tx)] truncate">{row.vehicleNumber}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-medium text-[var(--tx3)] uppercase tracking-wide leading-none">
          Severity
        </p>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${severityClass(
            row.severity
          )}`}
        >
          {row.severity || '--'}
        </span>
      </div>
      <div>
        <p className="text-[10px] font-medium text-[var(--tx3)] uppercase tracking-wide">Time of Incident</p>
        <p className="text-xs text-[var(--tx)]">{formatTime(row.createdAt)}</p>
      </div>
    </div>
  </div>
);
