import React from 'react';
import { Link } from 'react-router-dom';
import moment from 'moment-timezone';
import { getConfiguredTimezone } from '@/utils/timezone';
import { Activity, AlertTriangle, Clock, Cloud, DoorOpen, Flame, Image, Server, ShieldAlert, Users, Video } from 'lucide-react';
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

const formatTime = (t) =>
  t ? moment.utc(t).tz(getConfiguredTimezone()).format('DD/MM/YYYY hh:mm A') : '--';

export const formatDoorDuration = (seconds) => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '--';

  const formatValue = (amount) => Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

  if (value >= 86400) return `${formatValue(value / 86400)} day${value / 86400 === 1 ? '' : 's'}`;
  if (value >= 3600) return `${formatValue(value / 3600)} hr${value / 3600 === 1 ? '' : 's'}`;
  if (value >= 60) return `${formatValue(value / 60)} min${value / 60 === 1 ? '' : 's'}`;
  return `${formatValue(value)} sec${value === 1 ? '' : 's'}`;
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
  ];

  if (config.showIncidentName !== false) {
    cols.push({
      accessorKey: 'incidentName',
      header: sortableHeader('Incident Name', 'incidentName', onSort, sortable),
      cell: ({ row }) => <span className={styles.text}>{row.original.incidentName}</span>,
    });
  }

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
  );

  if (config.showSeverity !== false) {
    cols.push({
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
    });
  }

  if (config.showFireSmokeFields) {
    cols.push(
      {
        accessorKey: 'fireCount',
        header: 'Fire Objects',
        cell: ({ row }) => <span className={styles.text}>{row.original.fireCount ?? '--'}</span>,
      },
      {
        accessorKey: 'smokeCount',
        header: 'Smoke Objects',
        cell: ({ row }) => <span className={styles.text}>{row.original.smokeCount ?? '--'}</span>,
      },
    );
  }

  if (config.showPersonFallSickFields) {
    cols.push(
      {
        accessorKey: 'count',
        header: 'People Detected',
        cell: ({ row }) => <span className={styles.text}>{row.original.count ?? '--'}</span>,
      },
      {
        accessorKey: 'isFallDetected',
        header: 'Fall Detected',
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
        header: 'Evidence Score',
        cell: ({ row }) => <span className={styles.text}>{formatEvidenceScore(row.original.evidenceScore)}</span>,
      },
    );
  }

  if (config.showBlurredCameraFields) {
    cols.push({
      accessorKey: 'isBlurred',
      header: 'Is Blurred',
      cell: ({ row }) => {
        const value = row.original.isBlurred;
        if (typeof value !== 'boolean') return <span className={styles.text}>--</span>;
        return (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              value
                ? 'bg-[var(--crit)]/15 text-[var(--crit)]'
                : 'bg-[var(--ok)]/15 text-[var(--ok)]'
            }`}
          >
            {value ? 'True' : 'False'}
          </span>
        );
      },
    });
  }

  if (config.showIndustrialFields) {
    cols.push(
      {
        accessorKey: 'count',
        header: 'Objects Detected',
        cell: ({ row }) => <span className={styles.text}>{row.original.count ?? '--'}</span>,
      },
    );
  }

  if (config.showDoorFields) {
    cols.push(
      {
        accessorKey: 'zoneName',
        header: sortableHeader('Door', 'zone', onSort, sortable),
        cell: ({ row }) => <span className={styles.text}>{row.original.zoneName || row.original.zone || '--'}</span>,
      },
      {
        accessorKey: 'doorStatus',
        header: 'Door Status',
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
        header: sortableHeader('Door Open Duration', 'durationSec', onSort, sortable),
        cell: ({ row }) => <span className={styles.text}>{formatDoorDuration(row.original.durationSec)}</span>,
      },
    );
  }

  if (config.showLightingFields) {
    cols.push({ id: 'lightingDetails', header: 'Lighting / Site condition violations', enableSorting: false,
      cell: ({ row }) => <IncidentHygieneDetails item={row.original} /> });
  }

  if (config.showHygieneFields) {
    cols.push({ id: 'hygieneDetails', header: 'Hygiene violations', enableSorting: false,
      cell: ({ row }) => <IncidentHygieneDetails item={row.original} /> });
  }

  if (config.showBoxPackingFields) {
    cols.push(...BOX_PACKING_FIELDS.map(field => ({
      id: field.key,
      accessorFn: field.value,
      header: sortableHeader(field.label, field.key, onSort, sortable),
      cell: ({ row }) => <span className={`${styles.text} block whitespace-pre-line min-w-[90px] max-w-[260px] break-words`}>{field.value(row.original)}</span>,
    })));
  }

  if (config.showStockCountingFields) {
    cols.push(
      {
        accessorKey: 'vehicleNumber',
        header: sortableHeader('Vehicle Number', 'vehicleNumber', onSort, sortable),
        cell: ({ row }) => (
          <span className="inline-flex rounded-md border border-[var(--bd2)] bg-[var(--bg2)] px-2.5 py-1 text-xs font-bold uppercase tracking-[0.04em] text-[var(--tx)]">
            {row.original.vehicleNumber || 'Unknown'}
          </span>
        ),
      },
      {
        accessorKey: 'direction',
        header: 'Movement',
        cell: ({ row }) => <span className={`${styles.text} capitalize`}>{row.original.direction || '--'}</span>,
      },
      {
        accessorKey: 'boxTypes',
        header: 'Box Type',
        cell: ({ row }) => <span className={`${styles.text} capitalize`}>{boxSplitLabel(row.original)}</span>,
      },
      {
        accessorKey: 'loadedBoxCount',
        header: 'Loaded',
        cell: ({ row }) => <BoxCountCell count={row.original.loadedBoxCount} split={directionSplitLabel(row.original, 'loading')} />,
      },
      {
        accessorKey: 'unloadedBoxCount',
        header: 'Unloaded',
        cell: ({ row }) => <BoxCountCell count={row.original.unloadedBoxCount} split={directionSplitLabel(row.original, 'unloading')} />,
      },
      {
        accessorKey: 'boxCount',
        header: sortableHeader('Total Boxes', 'boxCount', onSort, sortable),
        cell: ({ row }) => <span className={`${styles.text} font-semibold`}>{row.original.boxCount ?? 0}</span>,
      },
    );
  }

  cols.push(
    {
      accessorKey: 'createdAt',
      header: sortableHeader('Time of Incident', 'createdAt', onSort, sortable),
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
  <div className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[13px] overflow-hidden hover:border-[var(--bd2)] transition-colors h-full w-full min-w-0">
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

      {config.showSeverity !== false && (
        <div
          className="absolute top-2 right-2 z-20 text-[9px] font-semibold px-[7px] py-[3px] rounded-[5px] capitalize text-white shadow-sm"
          style={{ background: severityBg(row.severity) }}
        >
          {row.severity || '--'}
        </div>
      )}

      {config.showStatus && (
        <div className="absolute top-2 left-2 z-20 text-[9px] font-semibold px-[7px] py-[3px] rounded-[5px] text-white shadow-sm bg-[rgba(6,8,13,.82)]">
          {formatStatus(row.currentStatus, config)}
        </div>
      )}
    </div>

    {config.gridVariant === 'details' ? (
      <div className="p-[11px] space-y-[9px]">
        {config.showIncidentName !== false && (
          <IncidentCardRow icon={ShieldAlert} label="Incident" value={row.incidentName} />
        )}
        {config.showSeverity !== false && (
          <IncidentCardRow
            icon={AlertTriangle}
            label="Severity"
            value={row.severity || '--'}
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
          <IncidentCardRow
            icon={Activity}
            label="Is Blurred"
            value={typeof row.isBlurred === 'boolean' ? (row.isBlurred ? 'True' : 'False') : '--'}
          />
        )}
        {config.showIndustrialFields && (
          <>
            <IncidentCardRow icon={Activity} label="Objects Detected" value={row.count ?? '--'} />
          </>
        )}
        {config.showDoorFields && (
          <>
            <IncidentCardRow icon={DoorOpen} label="Door" value={row.zoneName || row.zone || '--'} />
            <IncidentCardRow
              icon={DoorOpen}
              label="Status"
              value={row.doorStatus || '--'}
              valueClassName="capitalize"
              valueStyle={doorStatusStyle(row.doorStatus)}
            />
            <IncidentCardRow icon={Clock} label="Door Open Duration" value={formatDoorDuration(row.durationSec)} />
          </>
        )}
        {(config.showHygieneFields || config.showLightingFields) && <IncidentHygieneDetails item={row} />}
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
        <IncidentCardRow icon={Clock} label="Time" value={formatTime(row.createdAt)} />
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
