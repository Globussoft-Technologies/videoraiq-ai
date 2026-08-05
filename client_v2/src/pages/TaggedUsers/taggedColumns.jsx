import React, { useState } from 'react';
import moment from 'moment-timezone';
import {
  ArrowDownUp,
  ArrowUp,
  ArrowDown,
  Play,
  Calendar,
  MapPin,
  Clock,
  Video,
  Tag,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Switch } from '@/pages/AttendanceLogs/components/Switch';
import { avatarColor, initials } from '@/pages/AttendanceLogs/components/avatarUtils';
import ImageWithLoader from '@/pages/AttendanceLogs/components/ImageWithLoader';

const styles = {
  text: 'text-[var(--tx)] text-xs font-normal',
};

const mono = { fontFamily: 'var(--mono)' };

const formatStamp = (value, region) => {
  if (!value) return '--';
  const m = moment.utc(value).tz(region);
  return m.isValid() ? m.format('DD/MM/YYYY hh:mm A') : '--';
};

const TimelineCell = ({ item, region }) => {
  const rows = [
    { label: 'det:', value: formatStamp(item.detectedAt, region) },
    { label: 'tag:', value: formatStamp(item.taggedAt, region) },
  ];

  return (
    <div className="flex flex-col gap-1">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start gap-1.5 min-w-0">
          <span className="uppercase tracking-[0.08em] text-[10px] text-[var(--tx3)] shrink-0" style={mono}>
            {row.label}
          </span>
          <span className="text-[11px] text-[var(--tx)] min-w-0 break-words">{row.value}</span>
        </div>
      ))}
    </div>
  );
};

/** Format an access time range as "in - out (duration)". */
export const formatAccessTime = (enteredIn, exitTiming, region) => {
  const inMoment = enteredIn ? moment.utc(enteredIn).tz(region) : null;
  const outMoment = exitTiming ? moment.utc(exitTiming).tz(region) : null;

  if (!inMoment) return '--';

  let diffText = '';
  if (inMoment && outMoment) {
    const diffMs = outMoment.diff(inMoment);
    const duration = moment.duration(diffMs);
    const totalMinutes = Math.floor(duration.asMinutes());
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0 && minutes === 0) diffText = '';
    else if (hours === 0) diffText = ` (${minutes}Mins)`;
    else if (minutes === 0) diffText = ` (${hours}Hrs)`;
    else diffText = ` (${hours} Hrs ${minutes} Mins)`;
  }

  return outMoment
    ? `${inMoment.format('hh:mm A')} - ${outMoment.format('hh:mm A')}${diffText}`
    : inMoment.format('hh:mm A');
};

/** Sortable column header button — mono / uppercase / muted to match the header row. */
const SortHeader = ({ label, field, sortField, sortOrder, dispatch }) => (
  <button
    onClick={() => {
      dispatch({ type: 'SET_SORT_FIELD', value: field });
      dispatch({ type: 'SET_SORT_ORDER', value: sortOrder === 'asc' ? 'desc' : 'asc' });
    }}
    className="flex items-center gap-1 cursor-pointer uppercase tracking-[0.06em] text-[10px] text-[var(--tx3)] hover:text-[var(--tx2)]"
    style={mono}
  >
    {label}
    {sortField === field ? (
      sortOrder === 'asc' ? (
        <ArrowUp className="w-3 h-3" />
      ) : (
        <ArrowDown className="w-3 h-3" />
      )
    ) : (
      <ArrowDownUp className="w-3 h-3 text-[var(--tx3)]" />
    )}
  </button>
);

// Full-bleed image area for a grid card. When a log has multiple session
// images, shows left/right arrows + a counter to flip through them.
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
    <div className="relative w-full h-32 sm:h-36 md:h-44 lg:h-48 overflow-hidden">
      <ImageWithLoader
        src={list[safeIndex] || fallback}
        alt={alt}
        className="w-full h-full"
        imgClassName="w-full h-full object-cover object-top"
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
 * Build TanStack column definitions for the tagged-users table.
 * `ctx` = { dispatch, sortField, sortOrder, region, untaggingId, handleUntag }.
 */
export const buildColumns = ({
  dispatch,
  sortField,
  sortOrder,
  region,
  untaggingId,
  handleUntag,
}) => {
  const sortProps = { sortField, sortOrder, dispatch };
  const openProfile = (row) => {
    dispatch({ type: 'SET_SELECTED_LOG', value: row });
    dispatch({ type: 'SET_SHOW_PROFILE', value: true });
  };
  return [
    {
      accessorKey: 'Profile',
      header: 'Profile',
      cell: ({ row }) => (
        <button
          className="w-9 h-9 rounded-full overflow-hidden bg-[var(--bg2)] border border-[var(--bd)] flex items-center justify-center cursor-pointer hover:border-[var(--bd2)] transition-colors"
          onClick={() => openProfile(row.original)}
          aria-label={`Open profile ${row.original.name}`}
          title="View profile"
        >
          <ImageWithLoader
            src={row.original.image}
            alt={row.original.name}
            className="w-full h-full rounded-full"
            imgClassName="w-full h-full object-cover"
          />
        </button>
      ),
    },
    {
      accessorKey: 'name',
      header: () => <SortHeader label="Name" field="userInfo.userName" {...sortProps} />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
            style={{ background: avatarColor(row.original.name), ...mono }}
          >
            {initials(row.original.name)}
          </span>
          <span className="text-[13px] font-medium text-[var(--tx)] truncate">
            {row.original.name}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'department',
      header: () => (
        <SortHeader label="Department" field="department.departmentName" {...sortProps} />
      ),
      cell: ({ row }) => <span className={styles.text}>{row.original.department}</span>,
    },
    {
      accessorKey: 'date',
      header: () => <SortHeader label="Date" field="date" {...sortProps} className="ml-1" />,
      cell: ({ row }) => (
        <span className={styles.text}>
          {row.original.date
            ? moment.utc(row.original.date).tz(region).format('DD/MM/YYYY')
            : '--/--/----'}
        </span>
      ),
    },
    {
      accessorKey: 'location',
      header: () => <SortHeader label="Location" field="userInfo.location" {...sortProps} />,
      cell: ({ row }) => <span className={styles.text}>{row.original.location}</span>,
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
            <span className={enteredMoment && !exitMoment ? styles.text + ' ml-5' : styles.text}>
              {enteredMoment ? enteredMoment.format('hh:mm A') : ' '}
            </span>
            {hyphen}
            <span className={styles.text}>{exitMoment ? exitMoment.format('hh:mm A') : ' '}</span>

            <div className="text-[var(--tx)] text-xs font-normal ml-7">{diffText}</div>
          </div>
        );
      },
    },
    {
      accessorKey: 'cameraName',
      header: 'Camera',
      cell: ({ row }) => (
        <span className={styles.text + (row.original.cameraName === '--' ? ' ml-5' : ' ')}>
          {row.original.cameraName}
        </span>
      ),
    },
    {
      accessorKey: 'timeline',
      header: 'Detected / Tagged',
      cell: ({ row }) => <TimelineCell item={row.original} region={region} />,
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: ({ row }) => {
        const busy = untaggingId === row.original.accessLogId;
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

            {/* Always-on toggle — can only be turned OFF (untag) */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleUntag(row.original)}
                className="disabled:opacity-50 disabled:cursor-not-allowed"
                title="Untag user"
              >
                <Switch checked={true} className="pointer-events-none" />
              </button>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/20">
                {busy ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Tag className="w-3 h-3" fill="currentColor" />
                )}
                Tagged
              </span>
            </div>
          </div>
        );
      },
    },
  ];
};

/**
 * Grid-view card renderer — image-forward overlay layout. Single-click opens
 * the profile dialog; double-click opens the "big mode" image lightbox.
 * `ctx` = { dispatch, region, untaggingId, handleUntag }.
 */
export const renderAccessCard = (item, { dispatch, region, untaggingId, handleUntag }) => {
  const dateStr = item.date
    ? moment.utc(item.date).tz(region).format('DD/MM/YYYY')
    : '--/--/----';
  const accessTimeStr = formatAccessTime(item.enteredIn, item.exitTiming, region);
  const inTimeStr = item.enteredIn ? moment.utc(item.enteredIn).tz(region).format('hh:mm A') : '--';
  const detectedAtStr = formatStamp(item.detectedAt, region);
  const taggedAtStr = formatStamp(item.taggedAt, region);

  return (
    <div
      onClick={() => {
        dispatch({ type: 'SET_SELECTED_LOG', value: item });
        dispatch({ type: 'SET_SHOW_PROFILE', value: true });
      }}
      className="bg-[var(--bg2)] rounded-[13px] overflow-hidden border border-[var(--bd)] flex flex-col relative group hover:border-[var(--bd2)] transition-colors cursor-pointer h-full w-full min-w-0"
      title="View profile"
    >
      {/* Snapshot — full-bleed carousel with overlay chips */}
      <div className="relative">
        <SessionImageCarousel images={item.personImages} fallback={item.image} alt={item.name} />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'repeating-linear-gradient(135deg,rgba(255,255,255,.0120 12px,transparent 12px 24px)',
          }}
        />

        {/* Department badge top-left (hidden when no department) */}
        {item.department && item.department !== '--' && (
          <div
            className="absolute top-2 left-2 z-30 max-w-[55%] text-[9px] font-semibold text-white px-2 py-[2px] rounded-[5px] truncate"
            style={{ background: 'rgba(6,8,13,.6)', backdropFilter: 'blur(4px)' }}
          >
            {item.department}
          </div>
        )}

        {/* Play action top-right */}
        <div className="absolute top-2 right-2 z-30">
          <button
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'SET_SELECTED_LOG', value: item });
              dispatch({ type: 'SET_SHOW_PREVIEW', value: true });
            }}
            className="text-white hover:text-[var(--brand)] p-1 rounded-[5px] transition-colors cursor-pointer"
            style={{ background: 'rgba(6,8,13,.6)', backdropFilter: 'blur(4px)' }}
            aria-label={`Play ${item.name}`}
            title="Play preview"
          >
            <Play className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Entry time bottom-left */}
        <div
          className="absolute bottom-2 left-2 z-30 text-[9px] px-[7px] py-[2px] rounded-[5px]"
          style={{
            fontFamily: 'var(--mono)',
            color: '#fff',
            background: 'rgba(6,8,13,.6)',
            backdropFilter: 'blur(4px)',
          }}
        >
          {inTimeStr}
        </div>
      </div>

      {/* Content below the image */}
      <div className="flex flex-col p-2.5 sm:p-3 md:p-3.5">
        {/* Identity — avatar + name */}
        <div className="flex items-center gap-2 mb-2 min-w-0">
          <span
            className="w-6.5 h-6.5 shrink-0 rounded-full flex items-center justify-center text-[9px] font-semibold text-white"
            style={{ background: avatarColor(item.name), fontFamily: 'var(--mono)' }}
          >
            {initials(item.name)}
          </span>
          <span className="text-[var(--tx)] text-[12.5px] font-semibold truncate">{item.name}</span>
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-[var(--bd)] mb-2 md:mb-3"></div>

        {/* Info */}
        <div className="w-full space-y-1.5 md:space-y-2">
          <div className="flex items-center gap-2 text-xs min-w-0">
            <Calendar className="w-4 h-4 text-[var(--tx2)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] w-12 md:w-16 shrink-0 text-[9.5px] uppercase tracking-wider">
              Date
            </span>
            <span className="text-[var(--tx2)] text-[11.5px] truncate flex-1 text-right min-w-0">{dateStr}</span>
          </div>
          <div className="flex items-center gap-2 text-xs min-w-0">
            <MapPin className="w-4 h-4 text-[var(--tx2)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] w-12 md:w-16 shrink-0 text-[9.5px] uppercase tracking-wider">
              Location
            </span>
            <span className="text-[var(--tx2)] text-[11.5px] truncate flex-1 text-right min-w-0" title={item.location}>
              {item.location}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs min-w-0">
            <Clock className="w-4 h-4 text-[var(--tx2)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] w-12 md:w-16 shrink-0 text-[9.5px] uppercase tracking-wider">
              Access
            </span>
            <span
              className="text-[var(--tx2)] truncate flex-1 text-right min-w-0"
              title={accessTimeStr}
            >
              {accessTimeStr}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs min-w-0">
            <Video className="w-4 h-4 text-[var(--tx2)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] w-12 md:w-16 shrink-0 text-[9.5px] uppercase tracking-wider">
              Camera
            </span>
            <span
              className="text-[var(--tx2)] truncate flex-1 text-right min-w-0"
              title={item.cameraName}
            >
              {item.cameraName}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs min-w-0">
            <Tag className="w-4 h-4 text-[var(--tx2)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] w-12 md:w-16 shrink-0 text-[9.5px] uppercase tracking-wider">
              Detected
            </span>
            <span className="text-[var(--tx2)] text-[11.5px] truncate flex-1 text-right min-w-0" title={detectedAtStr}>
              {detectedAtStr}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs min-w-0">
            <Tag className="w-4 h-4 text-[var(--tx2)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] w-12 md:w-16 shrink-0 text-[9.5px] uppercase tracking-wider">
              Tagged
            </span>
            <span className="text-[var(--tx2)] text-[11.5px] truncate flex-1 text-right min-w-0" title={taggedAtStr}>
              {taggedAtStr}
            </span>
          </div>
        </div>

        {/* Always-on toggle — can only be turned OFF (untag) */}
        <div
          className="w-full mt-2 md:mt-2.5 pt-2 border-t border-[var(--bd)] flex items-center justify-between gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/20">
            {untaggingId === item.accessLogId ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Tag className="w-3 h-3" fill="currentColor" />
            )}
            Tagged
          </span>
          <button
            type="button"
            disabled={untaggingId === item.accessLogId}
            onClick={() => handleUntag(item)}
            className="disabled:opacity-50 disabled:cursor-not-allowed"
            title="Untag user"
          >
            <Switch checked={true} className="pointer-events-none" />
          </button>
        </div>
      </div>
    </div>
  );
};
