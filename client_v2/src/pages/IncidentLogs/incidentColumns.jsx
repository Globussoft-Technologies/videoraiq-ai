import React from 'react';
import moment from 'moment-timezone';
import { Image } from 'lucide-react';
import { styles } from './incidentState';
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

// Solid overlay colour for the on-image severity chip.
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

// Conveyor maps raw ON/OFF to human labels; crusher shows the raw status.
export const formatStatus = (value, config) => {
  if (!value || value === '--') return '--';
  if (config?.formatStatus) {
    const v = String(value).toUpperCase();
    if (v === 'ON') return 'Loaded';
    if (v === 'OFF') return 'Not-Loaded';
  }
  return value;
};

const statusClass = (value, config) => {
  const label = formatStatus(value, config);
  const on = /loaded|on|active|true/i.test(label) && !/not-?loaded/i.test(label);
  return on
    ? 'text-[var(--ok)] bg-[var(--ok)]/15'
    : 'text-[var(--tx2)] bg-[var(--bg2)]';
};

const sortableHeader = (label, field, onSort, sortable) =>
  sortable
    ? () => (
        <button
          onClick={() => onSort(field)}
          className="flex items-center gap-1 cursor-pointer uppercase tracking-[0.06em] text-[10px] text-[var(--tx3)] hover:text-[var(--tx2)] [font-family:var(--mono)]"
        >
          {label}
        </button>
      )
    : label;

/**
 * Build the incident-log table columns from a page `config`.
 *  - config.showStatus  → render a "Current Status" column
 *  - config.formatStatus → map ON/OFF to Loaded/Not-Loaded
 *  - config.sortable     → enable header sorting (line-crossing disables it)
 * `onSort(field)` toggles sort; `onPreview(url)` opens the image modal.
 * These logs are read-only — editing lives on the ANPR page only.
 */
export const buildColumns = (config, { onSort, onPreview }) => {
  const sortable = config.sortable !== false;
  const cols = [
    {
      accessorKey: 'snap',
      header: 'Image',
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
              alt={row.original.incidentName}
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
      accessorKey: 'incidentName',
      header: sortableHeader('Incident Name', 'incidentName', onSort, sortable),
      cell: ({ row }) => <span className={styles.text}>{row.original.incidentName}</span>,
    },
  ];

  if (config.showStatus) {
    cols.push({
      accessorKey: 'currentStatus',
      header: 'Current Status',
      cell: ({ row }) => (
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusClass(
            row.original.currentStatus,
            config
          )}`}
        >
          {formatStatus(row.original.currentStatus, config)}
        </span>
      ),
    });
  }

  cols.push(
    {
      accessorKey: 'nvrName',
      header: sortableHeader('NVR Name', 'nvrData.nvrName', onSort, sortable),
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
      accessorKey: 'createdAt',
      header: sortableHeader('Time of Incident', 'createdAt', onSort, sortable),
      cell: ({ row }) => <span className={styles.text}>{formatTime(row.original.createdAt)}</span>,
    }
  );

  return cols;
};

/**
 * Grid-view card for a single incident row — image-forward layout consistent
 * with the ANPR grid cards. Clicking the snapshot opens the preview modal.
 */
export const renderIncidentCard = (row, config, { onPreview }) => (
  <div className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[13px] overflow-hidden hover:border-[var(--bd2)] transition-colors h-full w-full min-w-0">
    <div
      className="relative bg-[#0a0e15] flex items-center justify-center"
      style={{ aspectRatio: '4 / 3' }}
    >
      {row.incidentImageUrl ? (
        <ImageWithLoader
          src={row.incidentImageUrl}
          alt={row.incidentName}
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

      {/* Status badge top-left (when the log type has one) */}
      {config.showStatus && (
        <div className="absolute top-2 left-2 z-20 text-[9px] font-semibold px-[7px] py-[3px] rounded-[5px] text-white shadow-sm bg-[rgba(6,8,13,.82)]">
          {formatStatus(row.currentStatus, config)}
        </div>
      )}
    </div>

    <div className="p-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-[var(--tx)] truncate">
          {row.incidentName}
        </span>
        <span
          className="text-[11px] text-[var(--tx3)] whitespace-nowrap"
          style={{ fontFamily: 'var(--mono)' }}
        >
          {formatTime(row.createdAt)}
        </span>
      </div>
      <div
        className="text-[12px] font-semibold mt-[5px] capitalize truncate"
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
