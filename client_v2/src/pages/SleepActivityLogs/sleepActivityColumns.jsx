import React from 'react';
import moment from 'moment-timezone';
import { Clock, Image, Moon, Server, Video } from 'lucide-react';
import ImageWithLoader from '@/pages/AttendanceLogs/components/ImageWithLoader';

const textCls = 'text-[var(--tx2)] text-[13px] font-medium whitespace-nowrap';

const formatTime = (t) =>
  t ? moment.utc(t).tz(moment.tz.guess()).format('DD/MM/YYYY hh:mm A') : '--';

/** Is-sleeping badge. `true` → sleeping (critical), `false` → awake (ok). */
export const SleepingBadge = ({ isSleeping }) => {
  const sleeping = isSleeping === true;
  return (
    <span
      className={`text-xs font-medium px-2.5 py-1 rounded-full ${
        sleeping
          ? 'text-[var(--crit)] bg-[var(--crit)]/15'
          : 'text-[var(--ok)] bg-[var(--ok)]/15'
      }`}
    >
      {sleeping ? 'Sleeping' : 'Awake'}
    </span>
  );
};

export const buildColumns = ({ onPreview }) => [
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
            alt="Sleep activity detection"
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
    accessorKey: 'isSleeping',
    header: 'Status',
    cell: ({ row }) => <SleepingBadge isSleeping={row.original.isSleeping} />,
  },
  {
    accessorKey: 'nvrName',
    header: 'NVR Name',
    cell: ({ row }) => <span className={textCls}>{row.original.nvrName}</span>,
  },
  {
    accessorKey: 'channelName',
    header: 'Camera Name',
    cell: ({ row }) => <span className={textCls}>{row.original.channelName}</span>,
  },
  {
    accessorKey: 'timeOfIncident',
    header: 'Time of Incident',
    cell: ({ row }) => <span className={textCls}>{formatTime(row.original.timeOfIncident)}</span>,
  },
];

const CardRow = ({ icon: Icon, label, value, valueNode }) => (
  <div className="flex items-center gap-2 text-xs min-w-0">
    <Icon className="w-4 h-4 text-[var(--tx2)] shrink-0" />
    <span className="font-semibold text-[var(--tx)] text-[9.5px] uppercase tracking-wider shrink-0">
      {label}
    </span>
    <span className="text-[var(--tx2)] font-medium text-[11.5px] truncate flex-1 text-right min-w-0">
      {valueNode ?? value}
    </span>
  </div>
);

export const renderSleepActivityCard = (row, { onPreview }) => (
  <div className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[13px] overflow-hidden hover:border-[var(--bd2)] transition-colors h-full w-full min-w-0">
    <div className="relative bg-[#0a0e15] flex items-center justify-center" style={{ aspectRatio: '4 / 3' }}>
      {row.incidentImageUrl ? (
        <ImageWithLoader
          src={row.incidentImageUrl}
          alt="Sleep activity detection"
          className="absolute inset-0 cursor-pointer"
          imgClassName="w-full h-full object-cover"
          onClick={() => onPreview(row.incidentImageUrl)}
          title="Click to enlarge"
        />
      ) : (
        <Image className="w-10 h-10 text-[var(--tx3)]" />
      )}
      <div className="absolute top-2 right-2 z-20">
        <SleepingBadge isSleeping={row.isSleeping} />
      </div>
    </div>

    <div className="p-[11px] space-y-[9px]">
      <CardRow
        icon={Moon}
        label="Status"
        valueNode={<SleepingBadge isSleeping={row.isSleeping} />}
      />
      <CardRow icon={Clock} label="Time" value={row.timeOfIncidentLabel} />
      <CardRow icon={Server} label="NVR" value={row.nvrName} />
      <CardRow icon={Video} label="Camera" value={row.channelName} />
    </div>
  </div>
);
