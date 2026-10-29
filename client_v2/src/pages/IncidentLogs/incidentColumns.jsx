import React from 'react';
import { Link } from 'react-router-dom';
import moment from 'moment-timezone';
import { getConfiguredTimezone } from '@/utils/timezone';
import { Activity, AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Clock, Cloud, DoorOpen, Flame, Image, MapPin, Server, ShieldAlert, Users, Video } from 'lucide-react';
import { styles } from './incidentState';
import { boxSplitLabel, directionSplitLabel } from './stockMovement';
import { BOX_PACKING_FIELDS, packingZones, packingSeconds } from './boxPacking';
import ImageWithLoader from '@/pages/AttendanceLogs/components/ImageWithLoader';
import IncidentHygieneDetails from '@/page/user/Incidents/IncidentHygieneDetails';
import { isMobileEmbedded } from '@/utils/mobileEmbed';

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

const severityLabel = (severity) => String(severity || '--').toLowerCase() === 'moderate' ? 'Medium' : severity || '--';

const formatTime = (t) =>
  t ? moment.utc(t).tz(getConfiguredTimezone()).format('DD/MM/YYYY hh:mm A') : '--';

export const formatDoorDuration = (seconds) => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '--';
  const totalMinutes = Math.floor(value / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours) parts.push(`${hours} hr${hours === 1 ? '' : 's'}`);
  if (minutes) parts.push(`${minutes} min${minutes === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' ') : `${Math.floor(value)} sec${Math.floor(value) === 1 ? '' : 's'}`;
};

const doorStatusStyle = (status) => {
  const isOpen = String(status || '').toLowerCase() === 'open';
  const color = isOpen ? 'var(--crit)' : 'var(--ok)';
  return {
    color,
    backgroundColor: isOpen ? 'color-mix(in srgb, var(--crit) 15%, transparent)' : 'color-mix(in srgb, var(--ok) 15%, transparent)',
    border: 'none',
    borderRadius: 999,
    padding: '4px 10px',
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    marginLeft: 'auto',
  };
};

export const StockPlaybackLink = ({ incidentId, imageUrl, onPreview }) => isMobileEmbedded() ? (
  imageUrl && onPreview ? <button
    type="button"
    onClick={event => { event.stopPropagation(); onPreview(imageUrl); }}
    className="text-xs font-semibold text-[var(--blue)] underline underline-offset-2 hover:opacity-80"
  >View image</button> : <span className={styles.text}>--</span>
) : incidentId ? (
  <Link
    to={`/playback?incidentId=${encodeURIComponent(incidentId)}`}
    onClick={(event) => event.stopPropagation()}
    className="whitespace-nowrap text-xs font-semibold text-[var(--blue)] underline underline-offset-2 hover:opacity-80"
  >
    Click for preview
  </Link>
) : <span className={styles.text}>--</span>;

// Loaded / Unloaded count with its colour split underneath.
const BoxCountCell = ({ count, split }) => (
  <div className="leading-tight">
    <span className={styles.text}>{count ?? 0}</span>
    {split && <div className="mt-0.5 whitespace-nowrap text-[11px] text-[var(--tx3)]">{split}</div>}
  </div>
);

const formatEvidenceScore = (score) => {
  if (score == null || score === '--') return '--';
  const value = Number(score);
  if (Number.isNaN(value)) return String(score);
  return value <= 1 ? `${Math.round(value * 100)}%` : `${Math.round(value)}%`;
};

const IncidentCardRow = ({ icon: Icon, label, value, valueClassName = '', valueStyle }) => (
  <div className="flex items-center gap-2 text-xs min-w-0">
    <Icon className="w-4 h-4 text-[var(--tx2)] shrink-0" />
    <span className="font-semibold text-[var(--tx)] text-[9.5px] uppercase tracking-wider shrink-0">
      {label}
    </span>
    <span
      className={`text-[var(--tx2)] font-medium text-[11.5px] truncate flex-1 text-right min-w-0 ${valueClassName}`}
      style={valueStyle}
    >
      {value}
    </span>
  </div>
);

const LightingCardMetaRow = ({ icon: Icon, label, value }) => (
  <div className="flex min-w-0 items-start gap-2 text-[11px] leading-snug">
    <Icon className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--tx3)]" aria-hidden="true" />
    <span className="w-20 shrink-0 whitespace-nowrap font-semibold uppercase tracking-wide text-[var(--tx2)]">{label}</span>
    <span className="min-w-0 flex-1 break-words text-right font-medium text-[var(--tx)]" title={String(value || '--')}>{value || '--'}</span>
  </div>
);

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

const sortableHeader = (label, field, onSort, sortable, sortField, sortOrder) =>
  sortable
    ? () => {
        const active = sortField === field;
        const SortIcon = active ? (sortOrder === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown;
        return (
        <button
          type="button"
          onClick={() => onSort(field)}
          className="flex items-center gap-1 cursor-pointer uppercase tracking-[0.06em] text-[10px] font-semibold hover:opacity-75 [font-family:var(--mono)]"
          style={{ color: active ? 'var(--blue)' : 'var(--tx)' }}
          aria-label={`Sort by ${label}${active ? `, ${sortOrder === 'desc' ? 'descending' : 'ascending'}` : ''}`}
        >
          {label}
          <SortIcon className={`h-3 w-3 shrink-0 ${active ? '' : 'opacity-60'}`} aria-hidden="true" />
        </button>
      );
      }
    : label;

export const buildColumns = (config, { onSort, onPreview, sortField, sortOrder }) => {
  const sortable = config.sortable !== false;
  const sortHeader = (label, field) => sortableHeader(label, field, onSort, sortable, sortField, sortOrder);
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
  ];

  if (config.showIncidentName !== false) {
    cols.push({
      accessorKey: 'incidentName',
      header: sortHeader('Incident Name', 'incidentName'),
      cell: ({ row }) => <span className={styles.text}>{row.original.incidentName}</span>,
    });
  }

  if (config.showStatus) {
    cols.push({
      accessorKey: 'currentStatus',
      header: sortHeader('Current Status', 'currentStatus'),
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
      header: sortHeader('NVR Name', 'nvrData.nvrName'),
      cell: ({ row }) => <span className={styles.text}>{row.original.nvrName}</span>,
    },
    {
      accessorKey: 'channelName',
      header: sortHeader('Camera Name', 'channelData.name'),
      cell: ({ row }) => <span className={styles.text}>{row.original.channelName}</span>,
    },
  );

  if (config.showSeverity !== false) {
    cols.push({
      accessorKey: 'severity',
      header: sortHeader('Severity', 'severity'),
      cell: ({ row }) => (
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${severityClass(
            row.original.severity
          )}`}
        >
          {config.showLightingFields || config.showHygieneFields || config.showDoorFields ? severityLabel(row.original.severity) : row.original.severity || '--'}
        </span>
      ),
    });
  }

  if (config.showFireSmokeFields) {
    cols.push(
      {
        accessorKey: 'fireCount',
        header: sortHeader('Fire Objects', 'fireCount'),
        cell: ({ row }) => <span className={styles.text}>{row.original.fireCount ?? '--'}</span>,
      },
      {
        accessorKey: 'smokeCount',
        header: sortHeader('Smoke Objects', 'smokeCount'),
        cell: ({ row }) => <span className={styles.text}>{row.original.smokeCount ?? '--'}</span>,
      },
    );
  }

  if (config.showPersonFallSickFields) {
    cols.push(
      {
        accessorKey: 'count',
        header: sortHeader('People Detected', 'count'),
        cell: ({ row }) => <span className={styles.text}>{row.original.count ?? '--'}</span>,
      },
      {
        accessorKey: 'isFallDetected',
        header: sortHeader('Fall Detected', 'isFallDetected'),
        cell: ({ row }) => {
          const isFall = row.original.isFallDetected === true || row.original.isFallDetected === 'true';
          return (
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded ${
                isFall ? 'text-[var(--crit)] bg-[var(--crit)]/15' : 'text-[var(--tx2)] bg-[var(--bg2)]'
              }`}
            >
              {isFall ? 'Yes' : 'No'}
            </span>
          );
        },
      },
      {
        accessorKey: 'evidenceScore',
        header: sortHeader('Evidence Score', 'evidenceScore'),
        cell: ({ row }) => <span className={styles.text}>{formatEvidenceScore(row.original.evidenceScore)}</span>,
      },
    );
  }

  if (config.showBlurredCameraFields) {
    cols.push(
      {
        accessorKey: 'description',
        header: sortHeader('Description', 'description'),
        cell: ({ row }) => <span className={`${styles.text} block min-w-[180px] max-w-[320px] whitespace-normal break-words`}>{row.original.description || '--'}</span>,
      },
    );
  }

  if (config.showIndustrialFields) {
    cols.push(
      {
        accessorKey: 'count',
        header: sortHeader('Objects Detected', 'count'),
        cell: ({ row }) => <span className={styles.text}>{row.original.count ?? '--'}</span>,
      },
    );
  }

  if (config.showDoorFields) {
    cols.push(
      {
        accessorKey: 'zoneName',
        header: sortHeader('Door Name', 'zone'),
        cell: ({ row }) => <span className={styles.text}>{row.original.zoneName || row.original.zone || '--'}</span>,
      },
      {
        accessorKey: 'doorStatus',
        header: sortHeader('Door Status', 'doorStatus'),
        cell: ({ row }) => {
          const status = String(row.original.doorStatus || '').toLowerCase();
          const isOpen = status === 'open';
          return (
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isOpen ? 'bg-[var(--crit)]/15 text-[var(--crit)]' : 'bg-[var(--ok)]/15 text-[var(--ok)]'}`}>
              {status || '--'}
            </span>
          );
        },
      },
      {
        accessorKey: 'durationSec',
        header: sortHeader('Door Open Duration', 'durationSec'),
        cell: ({ row }) => <span className={styles.text}>{formatDoorDuration(row.original.durationSec)}</span>,
      },
    );
  }

  if (config.showLightingFields || config.showHygieneFields) {
    cols.push({ id: 'issuesDetected', header: sortHeader('Issues Detected', 'violationCount'),
      cell: ({ row }) => <span className={styles.text}>{Number.isInteger(row.original.violationCount) && row.original.violationCount >= 0 ? row.original.violationCount : Array.isArray(row.original.violations) ? row.original.violations.length : 0}</span> });
    cols.push({ accessorKey: 'zone', header: sortHeader('Zone Name', 'zone'),
      cell: ({ row }) => <span className={styles.text}>{row.original.zone || '--'}</span> });
  }

  if (config.showLightingFields) {
    cols.push({ id: 'lightingDetails', header: sortHeader('Lighting / Site condition violations', 'violationDetails'),
      cell: ({ row }) => <div className="w-[340px] max-w-[340px] whitespace-normal break-words"><IncidentHygieneDetails item={row.original} showIssueCount={false} showViolationSeverity={false} showViolationSeparator={false} showViolationNumber={false} showConfidence={false} showZone={false} /></div> });
  }

  if (config.showHygieneFields) {
    cols.push({ id: 'hygieneDetails', header: sortHeader('Hygiene violations', 'violationDetails'),
      cell: ({ row }) => <div className="w-[340px] max-w-[340px] whitespace-normal break-words"><IncidentHygieneDetails item={row.original} showIssueCount={false} showViolationSeverity={false} showViolationSeparator={false} showViolationNumber={false} showConfidence={false} showZone={false} /></div> });
  }

  if (config.showBoxPackingFields) {
    cols.push(...BOX_PACKING_FIELDS.map(field => ({
      id: field.key,
      accessorFn: field.value,
      header: sortHeader(field.label, field.key),
      cell: ({ row }) => <span className={`${styles.text} block whitespace-pre-line min-w-[90px] max-w-[260px] break-words`}>{field.value(row.original)}</span>,
    })));
  }

  if (config.showStockCountingFields) {
    cols.push(
      {
        accessorKey: 'vehicleNumber',
        header: sortHeader('Vehicle Number', 'vehicleNumber'),
        cell: ({ row }) => (
          <span className="inline-flex rounded-md border border-[var(--bd2)] bg-[var(--bg2)] px-2.5 py-1 text-xs font-bold uppercase tracking-[0.04em] text-[var(--tx)]">
            {row.original.vehicleNumber || 'Unknown'}
          </span>
        ),
      },
      {
        accessorKey: 'direction',
        header: sortHeader('Movement', 'direction'),
        cell: ({ row }) => <span className={`${styles.text} capitalize`}>{row.original.direction || '--'}</span>,
      },
      {
        accessorKey: 'boxTypes',
        header: 'Box Type',
        cell: ({ row }) => <span className={`${styles.text} capitalize`}>{boxSplitLabel(row.original)}</span>,
      },
      {
        accessorKey: 'loadedBoxCount',
        header: sortHeader('Loaded', 'loadedBoxCount'),
        cell: ({ row }) => <BoxCountCell count={row.original.loadedBoxCount} split={directionSplitLabel(row.original, 'loading')} />,
      },
      {
        accessorKey: 'unloadedBoxCount',
        header: sortHeader('Unloaded', 'unloadedBoxCount'),
        cell: ({ row }) => <BoxCountCell count={row.original.unloadedBoxCount} split={directionSplitLabel(row.original, 'unloading')} />,
      },
      {
        accessorKey: 'boxCount',
        header: sortHeader('Total Boxes', 'boxCount'),
        cell: ({ row }) => <span className={`${styles.text} font-semibold`}>{row.original.boxCount ?? 0}</span>,
      },
    );
  }

  cols.push(
    {
      accessorKey: 'createdAt',
      header: sortHeader('Time of Incident', 'timeOfIncident'),
      cell: ({ row }) => <span className={styles.text}>{formatTime(row.original.createdAt)}</span>,
    }
  );

  if (config.showStockCountingFields) {
    cols.push({
      id: 'preview',
      header: 'Preview',
      cell: ({ row }) => {
        const item = row.original;
        const events = Array.isArray(item.events) ? item.events : [];
        // The group image can belong to an older event on a different camera.
        const imageEvent = events.find((event) => item.Image && event.Image === item.Image);
        const incidentId = item.incidentImageUrl
          ? (events.length ? imageEvent?._id : item._id)
          : null;
        return <StockPlaybackLink incidentId={incidentId} imageUrl={item.incidentImageUrl} onPreview={onPreview} />;
      },
    });
  }

  return cols;
};

export const renderIncidentCard = (row, config, { onPreview }) => (
  <div className={`bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[13px] overflow-hidden hover:border-[var(--bd2)] transition-colors h-full w-full min-w-0 ${(config.showLightingFields || config.showHygieneFields) ? 'flex flex-col' : ''}`}>
    <div
      className={`relative shrink-0 overflow-hidden bg-[#0a0e15] flex items-center justify-center ${config.showBoxPackingFields ? 'h-[190px]' : ''}`}
      style={config.showBoxPackingFields ? undefined : { aspectRatio: config.gridVariant === 'details' ? '6 / 3' : '4 / 3' }}
    >
      {row.incidentImageUrl ? (
        <ImageWithLoader
          src={row.incidentImageUrl}
          alt={row.incidentName}
          className="h-full w-full cursor-pointer"
          imgClassName="w-full h-full object-cover"
          onClick={() => onPreview(row.incidentImageUrl)}
          title="Click to enlarge"
        />
      ) : (
        <Image className="w-10 h-10 text-[var(--tx3)]" />
      )}

      {(config.showHygieneFields || config.showLightingFields) ? (
        <>
          <span className="absolute bottom-2 right-2 z-20 rounded-[5px] bg-[rgba(6,8,13,.82)] px-[7px] py-[3px] text-[10px] font-semibold text-white shadow-sm">
            Issues detected: {Number.isInteger(row.violationCount) && row.violationCount >= 0 ? row.violationCount : Array.isArray(row.violations) ? row.violations.length : 0}
          </span>
          {config.showSeverity !== false && <span
            className="absolute top-2 right-2 z-20 rounded-[5px] px-[7px] py-[3px] text-[10px] font-semibold capitalize text-white shadow-sm"
            style={{ background: severityBg(row.severity) }}
          >
            {severityLabel(row.severity)}
          </span>}
        </>
      ) : config.showBlurredCameraFields ? (
        <>
          {config.showSeverity !== false && (
            <span
              className="absolute top-2 right-2 z-20 rounded-[5px] px-[7px] py-[3px] text-[10px] font-semibold capitalize text-white shadow-sm"
              style={{ background: severityBg(row.severity) }}
            >
              {row.severity || '--'}
            </span>
          )}
        </>
      ) : config.showSeverity !== false && (
        <div
          className="absolute top-2 right-2 z-20 text-[9px] font-semibold px-[7px] py-[3px] rounded-[5px] capitalize text-white shadow-sm"
          style={{ background: severityBg(row.severity) }}
        >
          {config.showDoorFields ? severityLabel(row.severity) : row.severity || '--'}
        </div>
      )}

      {config.showStatus && (
        <div className="absolute top-2 left-2 z-20 text-[9px] font-semibold px-[7px] py-[3px] rounded-[5px] text-white shadow-sm bg-[rgba(6,8,13,.82)]">
          {formatStatus(row.currentStatus, config)}
        </div>
      )}
    </div>

    {config.showLightingFields ? (
      <div className="flex flex-1 flex-col gap-3 p-3.5">
        {config.showIncidentName !== false && <div className="flex items-start gap-2.5 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--blue)]/10 text-[var(--blue)]">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tx3)]">Incident</div>
            <div className="mt-0.5 text-[12px] font-semibold leading-snug text-[var(--tx)] break-words">{row.incidentName || '--'}</div>
          </div>
        </div>}
        <div className="min-w-0 rounded-[10px] border border-teal-200/80 bg-teal-50/80 px-3 py-2.5 dark:border-teal-800/50 dark:bg-teal-950/30">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            Site condition violation
          </div>
          <IncidentHygieneDetails item={row} showIssueCount={false} showViolationSeverity={false} showViolationSeparator={false} showViolationNumber={false} showViolationMarker showConfidence={false} showZone={false} />
        </div>
        <div className="mt-auto space-y-2 border-t border-[var(--bd)] pt-2.5">
          <LightingCardMetaRow icon={Server} label="NVR" value={row.nvrName} />
          <LightingCardMetaRow icon={Video} label="Camera" value={row.channelName} />
          <LightingCardMetaRow icon={MapPin} label="Zone Name" value={row.zone} />
          <LightingCardMetaRow icon={Clock} label="Time" value={formatTime(row.createdAt)} />
        </div>
      </div>
    ) : config.showHygieneFields ? (
      <div className="flex flex-1 flex-col gap-3 p-3.5">
        {config.showIncidentName !== false && <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--blue)]/10 text-[var(--blue)]">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tx3)]">Incident</div>
            <div className="mt-0.5 break-words text-[12px] font-semibold leading-snug text-[var(--tx)]">{row.incidentName || '--'}</div>
          </div>
        </div>}
        <div className="min-w-0 rounded-[10px] border border-teal-200/80 bg-teal-50/80 px-3 py-2.5 dark:border-teal-800/50 dark:bg-teal-950/30">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            Hygiene violations
          </div>
          <IncidentHygieneDetails item={row} showIssueCount={false} showViolationSeverity={false} showViolationSeparator={false} showViolationNumber={false} showViolationMarker showConfidence={false} showZone={false} />
        </div>
        <div className="mt-auto space-y-2 border-t border-[var(--bd)] pt-2.5">
          <LightingCardMetaRow icon={Server} label="NVR" value={row.nvrName} />
          <LightingCardMetaRow icon={Video} label="Camera" value={row.channelName} />
          <LightingCardMetaRow icon={MapPin} label="Zone Name" value={row.zone} />
          <LightingCardMetaRow icon={Clock} label="Time" value={formatTime(row.createdAt)} />
        </div>
      </div>
    ) : config.gridVariant === 'details' ? (
      <div className="p-[11px] space-y-[9px]">
        {config.showIncidentName !== false && (
          <IncidentCardRow icon={ShieldAlert} label="Incident" value={row.incidentName} />
        )}
        {config.showSeverity !== false && !config.showHygieneFields && !config.showLightingFields && !config.showBlurredCameraFields && !config.showDoorFields && (
          <IncidentCardRow
            icon={AlertTriangle}
            label="Severity"
            value={config.showDoorFields ? severityLabel(row.severity) : row.severity || '--'}
            valueClassName="capitalize"
            valueStyle={{ color: severityBg(row.severity) }}
          />
        )}
        {config.showFireSmokeFields && (
          <>
            <IncidentCardRow icon={Flame} label="Fire Objects" value={row.fireCount ?? '--'} />
            <IncidentCardRow icon={Cloud} label="Smoke Objects" value={row.smokeCount ?? '--'} />
          </>
        )}
        {config.showPersonFallSickFields && (
          <>
            <IncidentCardRow icon={Users} label="People Detected" value={row.count ?? '--'} />
            <IncidentCardRow
              icon={AlertTriangle}
              label="Fall Detected"
              value={row.isFallDetected === true || row.isFallDetected === 'true' ? 'Yes' : 'No'}
            />
            <IncidentCardRow
              icon={Activity}
              label="Evidence Score"
              value={formatEvidenceScore(row.evidenceScore)}
            />
          </>
        )}
        {config.showBlurredCameraFields && (
          <>
            {row.description && (
              <div className="flex items-start gap-2 text-xs min-w-0">
                <Activity className="w-4 h-4 text-[var(--tx2)] shrink-0" />
                <span className="font-semibold text-[var(--tx)] text-[9.5px] uppercase tracking-wider shrink-0">Description</span>
                <span className="text-[var(--tx2)] font-medium text-[11.5px] break-words min-w-0 text-right flex-1">{row.description}</span>
              </div>
            )}
          </>
        )}
        {config.showIndustrialFields && (
          <>
            <IncidentCardRow icon={Activity} label="Objects Detected" value={row.count ?? '--'} />
          </>
        )}
        {config.showDoorFields && (
          <>
            <IncidentCardRow icon={DoorOpen} label="Door Name" value={row.zoneName || row.zone || '--'} />
            <IncidentCardRow
              icon={DoorOpen}
              label="Door Status"
              value={row.doorStatus || '--'}
              valueClassName="capitalize"
              valueStyle={doorStatusStyle(row.doorStatus)}
            />
            <IncidentCardRow icon={Clock} label="Door Open Duration" value={formatDoorDuration(row.durationSec)} />
          </>
        )}
        {(config.showHygieneFields || config.showLightingFields) && <IncidentHygieneDetails item={row} showIssueCount={false} showViolationSeverity={false} showConfidence={false} />}
        {config.showStockCountingFields && (
          <>
            <IncidentCardRow icon={Activity} label="Vehicle" value={row.vehicleNumber || 'Unknown'} />
            <IncidentCardRow icon={Activity} label="Movement" value={row.direction || '--'} />
            <IncidentCardRow icon={Activity} label="Box Type" value={boxSplitLabel(row)} />
            {[['Loaded', row.loadedBoxCount, 'loading'], ['Unloaded', row.unloadedBoxCount, 'unloading']].map(([label, count, direction]) => {
              const split = directionSplitLabel(row, direction);
              return <IncidentCardRow key={label} icon={Activity} label={label} value={split ? `${count ?? 0} (${split})` : count ?? 0} />;
            })}
            <IncidentCardRow icon={Activity} label="Total Boxes" value={row.boxCount ?? 0} />
            <IncidentCardRow icon={Activity} label="Events" value={row.eventCount ?? 0} />
          </>
        )}
        {config.showBoxPackingFields && (
          <>
            <IncidentCardRow icon={Activity} label="Box ID" value={row.boxId ?? '--'} />
            <IncidentCardRow icon={Users} label="Completed by" value={row.completedBy ?? '--'} />
            <div className="space-y-1.5 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] p-2.5">
              {packingZones(row.zones).length ? packingZones(row.zones).map((zone, index) => (
                <div key={`${zone.zone}-${index}`} className="flex flex-wrap items-center justify-between gap-1 text-xs">
                  <span className="min-w-0 break-words text-[var(--tx)]">{zone.zone ?? '--'}</span>
                  <span className="text-[var(--tx2)]">{packingSeconds(zone.timeTakenSec)}</span>
                </div>
              )) : <span className="text-xs text-[var(--tx3)]">No zone details</span>}
            </div>
            <IncidentCardRow icon={Activity} label="End time source" value={row.endTimeSource ?? '--'} />
            <IncidentCardRow icon={Activity} label="Detected via" value={row.detectedVia ?? '--'} />
            <div className="text-xs leading-relaxed text-[var(--tx2)]"><span className="text-[var(--tx3)]">Confirmation: </span>{row.confirmationReason ?? '--'}</div>
          </>
        )}
        <IncidentCardRow icon={Server} label="NVR" value={row.nvrName} />
        <IncidentCardRow icon={Video} label="Camera" value={row.channelName} />
        <IncidentCardRow icon={Clock} label={config.timeLabel || (config.showDoorFields ? 'Time of Incident' : 'Time')} value={formatTime(row.createdAt)} />
      </div>
    ) : (
      <div className="p-[11px]">
        <div className="flex items-center justify-between gap-2">
          {config.showIncidentName !== false && (
            <span className="text-[12.5px] font-semibold text-[var(--tx)] truncate">
              {row.incidentName}
            </span>
          )}
          <span
            className="text-[11px] text-[var(--tx3)] whitespace-nowrap"
            style={{ fontFamily: 'var(--mono)' }}
          >
            {formatTime(row.createdAt)}
          </span>
        </div>
        {config.showSeverity !== false && (
          <div
            className="text-[12px] font-semibold mt-[5px] capitalize truncate"
            style={{ color: severityBg(row.severity) }}
          >
            {row.severity || '--'}
          </div>
        )}
        <div className="text-[10px] text-[var(--tx3)] mt-[2px] truncate">
          {row.nvrName} - {row.channelName}
        </div>
      </div>
    )}
  </div>
);
