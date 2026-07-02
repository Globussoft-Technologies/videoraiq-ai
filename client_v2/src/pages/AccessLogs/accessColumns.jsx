import React, { useState } from 'react';
import moment from 'moment-timezone';
import {
  ArrowDownUp,
  ArrowUp,
  ArrowDown,
  Play,
  Tag,
  Loader2,
  Calendar,
  MapPin,
  Clock,
  Video,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Switch from '@/pages/AttendanceLogs/components/Switch';
import { formatAccessTime } from './accessExport';

const cellText = 'text-[var(--tx)] text-xs font-normal';

/** Sortable column header button. */
const SortHeader = ({ label, field, sortField, sortOrder, dispatch, className = '' }) => (
  <button
    onClick={() => {
      dispatch({ type: 'SET_SORT_FIELD', value: field });
      dispatch({ type: 'SET_SORT_ORDER', value: sortOrder === 'asc' ? 'desc' : 'asc' });
    }}
    className={`flex items-center gap-1 cursor-pointer ${className}`}
  >
    {label}
    {sortField === field ? (
      sortOrder === 'asc' ? (
        <ArrowUp className="w-4 h-4" />
      ) : (
        <ArrowDown className="w-4 h-4" />
      )
    ) : (
      <ArrowDownUp className="w-4 h-4 text-[var(--tx3)]" />
    )}
  </button>
);

/**
 * Full-bleed image area for a grid card. When a log has multiple session
 * images, shows left/right arrows + a counter to flip through them.
 */
export const SessionImageCarousel = ({ images = [], fallback, alt }) => {
  const list = images && images.length > 0 ? images : fallback ? [fallback] : [];
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(list.length - 1, 0));
  const hasMultiple = list.length > 1;

  const go = (e, delta) => {
    e.stopPropagation();
    setIndex((prev) => (prev + delta + list.length) % list.length);
  };

  return (
    <div className="relative w-full h-40 sm:h-44 md:h-48 lg:h-52 overflow-hidden">
      <img
        src={list[safeIndex] || fallback}
        alt={alt}
        className="w-full h-full object-cover object-top"
      />

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={(e) => go(e, -1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors cursor-pointer"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => go(e, 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors cursor-pointer"
            aria-label="Next image"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="absolute bottom-2 right-2 z-20 bg-black/50 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full">
            {safeIndex + 1}/{list.length}
          </span>
        </>
      )}
    </div>
  );
};

/**
 * Build TanStack column definitions for the access-logs table.
 * `ctx` = { dispatch, sortField, sortOrder, region, isTagged, taggingId,
 *           pickedNames, handleToggle }.
 */
export const buildColumns = ({
  dispatch,
  sortField,
  sortOrder,
  region,
  isTagged,
  taggingId,
  pickedNames,
  handleToggle,
}) => {
  const sortProps = { sortField, sortOrder, dispatch };
  return [
    {
      accessorKey: 'Profile',
      header: 'Profile',
      cell: ({ row }) => (
        <div
          className="w-8 h-8 rounded-full overflow-hidden bg-[var(--bg1solid)] border border-[var(--bd)] cursor-pointer"
          onClick={() => {
            dispatch({ type: 'SET_SELECTED_LOG', value: row.original });
            dispatch({ type: 'SET_SHOW_PROFILE', value: true });
          }}
        >
          <img
            src={row.original.image}
            alt={row.original.name}
            className="w-8 h-8 object-cover"
          />
        </div>
      ),
    },
    {
      accessorKey: 'name',
      header: () => (
        <SortHeader label="Name" field="userInfo.userName" {...sortProps} className="ml-4" />
      ),
      cell: ({ row }) => <span className={cellText}>{row.original.name}</span>,
    },
    {
      accessorKey: 'department',
      header: () => (
        <SortHeader label="Department" field="department.departmentName" {...sortProps} />
      ),
      cell: ({ row }) => <span className={cellText}>{row.original.department}</span>,
    },
    {
      accessorKey: 'date',
      header: () => <SortHeader label="Date" field="date" {...sortProps} className="ml-1" />,
      cell: ({ row }) => (
        <span className={cellText}>
          {row.original.date
            ? moment.utc(row.original.date).tz(region).format('DD/MM/YYYY')
            : '--/--/----'}
        </span>
      ),
    },
    {
      accessorKey: 'location',
      header: () => <SortHeader label="Location" field="userInfo.location" {...sortProps} />,
      cell: ({ row }) => <span className={cellText}>{row.original.location}</span>,
    },
    {
      accessorKey: 'Access time',
      header: () => (
        <SortHeader label="Access time" field="lastCreatedAt" {...sortProps} className="ml-1" />
      ),
      cell: ({ row }) => {
        const enteredIn = row.original.enteredIn;
        const exitTiming = row.original.exitTiming;

        const enteredMoment = enteredIn ? moment.utc(enteredIn).tz(region) : null;
        const exitMoment = exitTiming ? moment.utc(exitTiming).tz(region) : null;

        const hyphen = enteredMoment && exitMoment ? '-' : ' ';

        let diffText = ' ';
        if (enteredMoment && exitMoment) {
          const diffMs = exitMoment.diff(enteredMoment);
          const duration = moment.duration(diffMs);
          const totalMinutes = Math.floor(duration.asMinutes());
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;

          if (hours === 0 && minutes === 0) diffText = '';
          else if (hours === 0) diffText = `(${minutes}Mins)`;
          else if (minutes === 0) diffText = `(${hours}Hrs)`;
          else diffText = `(${hours} Hrs ${minutes} Mins)`;
        }

        return (
          <div>
            <span className={enteredMoment && !exitMoment ? cellText + ' ml-5' : cellText}>
              {enteredMoment ? enteredMoment.format('hh:mm A') : ' '}
            </span>
            {hyphen}
            <span className={cellText}>{exitMoment ? exitMoment.format('hh:mm A') : ' '}</span>
            <div className="text-[var(--tx)] text-xs font-normal ml-7">{diffText}</div>
          </div>
        );
      },
    },
    {
      accessorKey: 'cameraName',
      header: 'Camera',
      cell: ({ row }) => (
        <span className={cellText + (row.original.cameraName === '--' ? ' ml-5' : ' ')}>
          {row.original.cameraName}
        </span>
      ),
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: ({ row }) => {
        const tagged = isTagged(row.original);
        const busy = taggingId === row.original.accessLogId;
        const pickedName = pickedNames[row.original.accessLogId];
        const disabled = !row.original.accessLogId || busy;
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                dispatch({ type: 'SET_SELECTED_LOG', value: row.original });
                dispatch({ type: 'SET_SHOW_PREVIEW', value: true });
              }}
              className="p-2 rounded-full bg-transparent cursor-pointer"
              title="Play preview"
            >
              <Play className="w-5 h-5 text-[var(--brand)]" />
            </button>

            {/* Tag toggle + status pill */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => handleToggle(row.original, e)}
                className="disabled:opacity-50 disabled:cursor-not-allowed"
                title={tagged ? 'Untag user' : 'Tag user'}
              >
                <Switch checked={tagged} className="pointer-events-none" />
              </button>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap max-w-[140px] ${
                  tagged
                    ? 'bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/20'
                    : 'bg-[var(--bg2)] text-[var(--tx3)] border-[var(--bd)]'
                }`}
                title={pickedName || (tagged ? 'Tagged' : 'Untagged')}
              >
                {busy ? (
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                ) : (
                  <Tag className="w-3 h-3 shrink-0" fill={tagged ? 'currentColor' : 'none'} />
                )}
                <span className="truncate">{tagged ? pickedName || 'Tagged' : 'Untagged'}</span>
              </span>
            </div>
          </div>
        );
      },
    },
  ];
};

/**
 * Grid-view card renderer.
 * `ctx` = { dispatch, region, isTagged, taggingId, pickedNames, handleToggle }.
 */
export const renderAccessCard = (
  item,
  { dispatch, region, isTagged, taggingId, pickedNames, handleToggle }
) => {
  const dateStr = item.date
    ? moment.utc(item.date).tz(region).format('DD/MM/YYYY')
    : '--/--/----';
  const accessTimeStr = formatAccessTime(item.enteredIn, item.exitTiming, region);

  return (
    <div
      onClick={() => {
        dispatch({ type: 'SET_SELECTED_LOG', value: item });
        dispatch({ type: 'SET_SHOW_PROFILE', value: true });
      }}
      className="bg-[var(--bg1solid)] rounded-2xl overflow-hidden shadow-sm border border-[var(--bd)] flex flex-col relative group hover:shadow-md transition-shadow cursor-pointer h-full w-full min-w-0"
    >
      {/* Department badge top-left (hidden when no department) */}
      {item.department && item.department !== '--' && (
        <div className="absolute top-2 left-2 md:top-3 md:left-3 z-20 max-w-[55%]">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-semibold bg-[var(--brand)]/10 text-[var(--brand)] border border-[var(--brand)]/20 shadow-sm truncate max-w-full">
            {item.department}
          </span>
        </div>
      )}

      {/* Action button top-right */}
      <div className="absolute top-2 right-2 flex flex-row flex-nowrap items-center gap-0.5 sm:gap-1 z-30">
        <button
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'SET_SELECTED_LOG', value: item });
            dispatch({ type: 'SET_SHOW_PREVIEW', value: true });
          }}
          className="text-[var(--brand)] hover:bg-[var(--bg2)] p-1 md:p-1.5 rounded-full transition-colors cursor-pointer"
          aria-label={`Play ${item.name}`}
          title="Play preview"
        >
          <Play className="w-4 h-4 md:w-5 md:h-5" />
        </button>
      </div>

      {/* Avatar — full-bleed across the top, with arrows for multiple session images */}
      <SessionImageCarousel images={item.personImages} fallback={item.image} alt={item.name} />

      {/* Content below the image */}
      <div className="flex flex-col p-3 sm:p-4 md:p-5">
        {/* Name */}
        <div className="w-full text-center mb-2 md:mb-3 px-2">
          <div className="text-[var(--brand)] text-sm md:text-base font-semibold truncate">
            {item.name}
          </div>
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-[var(--bd)] mb-3 md:mb-5"></div>

        {/* Info */}
        <div className="w-full space-y-2.5 md:space-y-3.5">
          <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm min-w-0">
            <Calendar className="w-4 h-4 md:w-5 md:h-5 text-[var(--tx3)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] w-16 md:w-24 shrink-0 text-[10px] md:text-[11px] uppercase tracking-wider">
              Date
            </span>
            <span className="text-[var(--tx2)] truncate flex-1 text-right min-w-0">{dateStr}</span>
          </div>
          <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm min-w-0">
            <MapPin className="w-4 h-4 md:w-5 md:h-5 text-[var(--tx3)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] w-16 md:w-24 shrink-0 text-[10px] md:text-[11px] uppercase tracking-wider">
              Location
            </span>
            <span
              className="text-[var(--tx2)] truncate flex-1 text-right min-w-0"
              title={item.location}
            >
              {item.location}
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm min-w-0">
            <Clock className="w-4 h-4 md:w-5 md:h-5 text-[var(--tx3)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] w-16 md:w-24 shrink-0 text-[10px] md:text-[11px] uppercase tracking-wider">
              Access
            </span>
            <span
              className="text-[var(--tx2)] truncate flex-1 text-right min-w-0"
              title={accessTimeStr}
            >
              {accessTimeStr}
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm min-w-0">
            <Video className="w-4 h-4 md:w-5 md:h-5 text-[var(--tx3)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] w-16 md:w-24 shrink-0 text-[10px] md:text-[11px] uppercase tracking-wider">
              Camera
            </span>
            <span
              className="text-[var(--tx2)] truncate flex-1 text-right min-w-0"
              title={item.cameraName}
            >
              {item.cameraName}
            </span>
          </div>
        </div>

        {/* Tag toggle + status pill */}
        <div
          className="w-full mt-3 md:mt-4 pt-3 border-t border-[var(--bd)] flex items-center justify-between gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] md:text-xs font-semibold border whitespace-nowrap max-w-[70%] ${
              isTagged(item)
                ? 'bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/20'
                : 'bg-[var(--bg2)] text-[var(--tx3)] border-[var(--bd)]'
            }`}
            title={pickedNames[item.accessLogId] || (isTagged(item) ? 'Tagged' : 'Untagged')}
          >
            {taggingId === item.accessLogId ? (
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            ) : (
              <Tag className="w-3 h-3 shrink-0" fill={isTagged(item) ? 'currentColor' : 'none'} />
            )}
            <span className="truncate">
              {isTagged(item) ? pickedNames[item.accessLogId] || 'Tagged' : 'Untagged'}
            </span>
          </span>
          <button
            type="button"
            disabled={!item.accessLogId || taggingId === item.accessLogId}
            onClick={(e) => handleToggle(item, e)}
            className="disabled:opacity-50 disabled:cursor-not-allowed"
            title={isTagged(item) ? 'Untag user' : 'Tag user'}
          >
            <Switch checked={isTagged(item)} className="pointer-events-none" />
          </button>
        </div>
      </div>
    </div>
  );
};
