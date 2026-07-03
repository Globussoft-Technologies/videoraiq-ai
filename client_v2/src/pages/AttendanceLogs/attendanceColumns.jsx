import React from 'react';
import moment from 'moment-timezone';
import { ArrowDownUp, ArrowUp, ArrowDown, Play, Hourglass } from 'lucide-react';
import { avatarColor, initials } from './components/avatarUtils';
import ImageWithLoader from './components/ImageWithLoader';

const cellText = 'text-[var(--tx2)] text-[10px] sm:text-xs font-normal';

/** Sortable column header button — mono / uppercase / muted to match the header row. */
const SortHeader = ({ label, field, sortField, sortOrder, dispatch }) => (
  <button
    onClick={() => {
      dispatch({ type: 'SET_SORT_FIELD', value: field });
      dispatch({ type: 'SET_SORT_ORDER', value: sortOrder === 'asc' ? 'desc' : 'asc' });
    }}
    className="flex items-center gap-1 cursor-pointer uppercase tracking-[0.06em] text-[10px] text-[var(--tx3)] hover:text-[var(--tx2)]"
    style={{ fontFamily: 'var(--mono)' }}
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

const mono = { fontFamily: 'var(--mono)' };

/**
 * Build TanStack column definitions for the attendance table.
 * Clicking the profile snapshot opens the profile details dialog.
 * `ctx` = { dispatch, sortField, sortOrder, region, convertToRegionTime }.
 */
export const buildColumns = ({ dispatch, sortField, sortOrder, region, convertToRegionTime }) => {
  const sortProps = { sortField, sortOrder, dispatch };
  const openProfile = (row) => {
    dispatch({ type: 'SET_SELECTED_PROFILE', value: row });
    dispatch({ type: 'SET_SHOW_PROFILE_DIALOG', value: true });
  };
  return [
    {
      accessorKey: 'Profile',
      header: 'Profile',
      cell: ({ row }) => (
        <button
          onClick={() => openProfile(row.original)}
          className="w-9 h-9 rounded-full overflow-hidden bg-[var(--bg2)] border border-[var(--bd)] flex items-center justify-center cursor-pointer hover:border-[var(--bd2)] transition-colors"
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
      header: () => <SortHeader label="Name" field="fullname" {...sortProps} />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
            style={{ background: avatarColor(row.original.name), ...mono }}
          >
            {initials(row.original.name)}
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-[var(--tx)] truncate">
              {row.original.name}
            </div>
            <div className="text-[11px] text-[var(--tx3)] truncate" style={mono}>
              {row.original.email || row.original.id}
            </div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'department',
      header: () => <SortHeader label="Department" field="department" {...sortProps} />,
      cell: ({ row }) => <span className={cellText}>{row.original.department}</span>,
    },
    {
      accessorKey: 'date',
      header: () => <SortHeader label="Date" field="date" {...sortProps} />,
      cell: ({ row }) => (
        <span className="text-[var(--tx2)] text-xs" style={mono}>
          {moment(row.original.login).isValid()
            ? moment(row.original.login).format('DD/MM/YYYY')
            : moment(row.original.logout).isValid()
              ? moment(row.original.logout).format('DD/MM/YYYY')
              : '-'}
        </span>
      ),
    },
    {
      accessorKey: 'location',
      header: () => <SortHeader label="Location" field="location" {...sortProps} />,
      cell: ({ row }) => <span className={cellText}>{row.original.location}</span>,
    },
    {
      accessorKey: 'Check in',
      header: () => <SortHeader label="Check in" field="checkin" {...sortProps} />,
      cell: ({ row }) => (
        <span className="text-[var(--ok)] text-xs" style={mono}>
          {convertToRegionTime(row.original.login, region)}
        </span>
      ),
    },
    {
      accessorKey: 'Check out',
      header: () => <SortHeader label="Check out" field="checkout" {...sortProps} />,
      cell: ({ row }) => (
        <span className="text-[var(--tx2)] text-xs" style={mono}>
          {row.original.logout === '--' ? '--' : convertToRegionTime(row.original.logout, region)}
        </span>
      ),
    },
    {
      accessorKey: 'Camera',
      header: 'Camera',
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span className="text-[var(--tx3)] text-[11px]" style={mono}>
            in: {row.original.checkinCam}
          </span>
          <span className="text-[var(--tx3)] text-[11px]" style={mono}>
            out: {row.original.checkoutCam}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'actions',
      header: 'Action',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              dispatch({ type: 'SET_SELECTED_LOG', value: row.original });
              dispatch({ type: 'SET_SHOW_PREVIEW', value: true });
            }}
            className="p-2 rounded-full bg-transparent cursor-pointer hover:bg-[var(--bg2)] transition-colors"
            aria-label={`Play ${row.original.name}`}
          >
            <Play className="w-5 h-5 text-[var(--brand)]" />
          </button>
          <button
            onClick={() => {
              dispatch({ type: 'SET_SELECTED_BREAK_LOG', value: row.original });
              dispatch({ type: 'SET_SHOW_BREAK_LOGS', value: true });
            }}
            className="p-2 rounded-full bg-transparent cursor-pointer hover:bg-[var(--bg2)] transition-colors"
            aria-label={`View break logs for ${row.original.name}`}
            title="Break logs"
          >
            <Hourglass className="w-5 h-5 text-[var(--brand)]" />
          </button>
        </div>
      ),
    },
  ];
};

/**
 * Grid-view card renderer — image-forward layout ported from the VideoraIQ
 * prototype. Clicking the card opens the profile details dialog.
 * `ctx` = { dispatch, region, convertToRegionTime }.
 */
export const renderAttendanceCard = (item, { dispatch, region, convertToRegionTime }) => {
  const inM = moment(item.login);
  const outM = item.logout && item.logout !== '--' ? moment(item.logout) : null;
  const checkInStr = item.login ? convertToRegionTime(item.login, region) : '--';

  let hoursStr = '--';
  if (inM.isValid() && outM && outM.isValid()) {
    const mins = Math.max(0, outM.diff(inM, 'minutes'));
    hoursStr = `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }
  const checkedOut = !!(outM && outM.isValid());
  const statusLabel = checkedOut ? 'Checked Out' : inM.isValid() ? 'Present' : '—';
  const statusColor = checkedOut ? '#64748b' : '#22c55e';

  return (
    <div
      onClick={() => {
        dispatch({ type: 'SET_SELECTED_PROFILE', value: item });
        dispatch({ type: 'SET_SHOW_PROFILE_DIALOG', value: true });
      }}
      className="bg-[var(--bg2)] border border-[var(--bd)] rounded-[13px] overflow-hidden cursor-pointer group hover:border-[var(--bd2)] transition-colors h-full w-full min-w-0"
      title="View profile"
    >
      {/* Snapshot */}
      <div className="relative bg-[#0a0e15]" style={{ aspectRatio: '4 / 3' }}>
        <ImageWithLoader
          src={item.image}
          alt={item.name}
          className="absolute inset-0"
          imgClassName="w-full h-full object-cover"
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'repeating-linear-gradient(135deg,rgba(255,255,255,.012) 0 12px,transparent 12px 24px)',
          }}
        />

        {/* Department badge */}
        {item.department && (
          <div
            className="absolute top-2 left-2 max-w-[55%] text-[9px] font-semibold text-white px-2 py-[2px] rounded-[5px] truncate"
            style={{ background: 'rgba(6,8,13,.6)', backdropFilter: 'blur(4px)' }}
          >
            {item.department}
          </div>
        )}

        {/* Action buttons */}
        <div className="absolute top-2 right-2 flex items-center gap-1 z-30">
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'SET_SELECTED_BREAK_LOG', value: item });
              dispatch({ type: 'SET_SHOW_BREAK_LOGS', value: true });
            }}
            className="text-white hover:text-[var(--brand)] p-1 rounded-[5px] transition-colors cursor-pointer"
            style={{ background: 'rgba(6,8,13,.6)', backdropFilter: 'blur(4px)' }}
            aria-label={`View break logs for ${item.name}`}
            title="Break logs"
          >
            <Hourglass className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Status pill */}
        <div
          className="absolute bottom-2 right-2 text-[9px] font-semibold px-[7px] py-[3px] rounded-[5px] text-white"
          style={{ background: statusColor, backdropFilter: 'blur(4px)' }}
        >
          {statusLabel}
        </div>

        {/* Check-in time */}
        <div
          className="absolute bottom-2 left-2 text-[9px] px-[7px] py-[2px] rounded-[5px]"
          style={{
            fontFamily: 'var(--mono)',
            color: 'var(--ok)',
            background: 'rgba(6,8,13,.6)',
            backdropFilter: 'blur(4px)',
          }}
        >
          IN {checkInStr}
        </div>
      </div>

      {/* Footer */}
      <div className="p-[11px] flex items-center gap-[9px]">
        <span
          className="w-[30px] h-[30px] shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold text-white"
          style={{ background: avatarColor(item.name), fontFamily: 'var(--mono)' }}
        >
          {initials(item.name)}
        </span>
        <span className="min-w-0">
          <span className="block text-[12.5px] font-semibold text-[var(--tx)] truncate">
            {item.name}
          </span>
          <span className="block text-[10px] text-[var(--tx3)] truncate">
            {item.department} · {hoursStr}
          </span>
        </span>
      </div>
    </div>
  );
};
