import React from 'react';
import moment from 'moment-timezone';
import {
  ArrowDownUp,
  ArrowUp,
  ArrowDown,
  Play,
  Hourglass,
  Calendar,
  MapPin,
  LogIn,
  LogOut,
  Video,
} from 'lucide-react';

const cellText = 'text-[var(--tx2)] text-[10px] sm:text-xs font-normal';

/** Sortable column header button. */
const SortHeader = ({ label, field, sortField, sortOrder, dispatch, className = '' }) => (
  <button
    onClick={() => {
      dispatch({ type: 'SET_SORT_FIELD', value: field });
      dispatch({ type: 'SET_SORT_ORDER', value: sortOrder === 'asc' ? 'desc' : 'asc' });
    }}
    className={`flex items-center gap-1 cursor-pointer text-[var(--tx)] ${className}`}
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
 * Build TanStack column definitions for the attendance table.
 * `ctx` = { dispatch, sortField, sortOrder, region, convertToRegionTime }.
 */
export const buildColumns = ({ dispatch, sortField, sortOrder, region, convertToRegionTime }) => {
  const sortProps = { sortField, sortOrder, dispatch };
  return [
    {
      accessorKey: 'Profile',
      header: 'Profile',
      cell: ({ row }) => (
        <button
          onClick={() => {
            dispatch({ type: 'SET_SELECTED_PROFILE', value: row.original });
            dispatch({ type: 'SET_SHOW_PROFILE_DIALOG', value: true });
          }}
          className="w-10 h-10 rounded-full overflow-hidden bg-[var(--bg2)] border border-[var(--bd)] p-[1px] flex items-center justify-center cursor-pointer"
          aria-label={`Open profile ${row.original.name}`}
        >
          <img src={row.original.image} alt={row.original.name} className="w-10 h-10 object-cover rounded-full" />
        </button>
      ),
    },
    {
      accessorKey: 'name',
      header: () => <SortHeader label="Name" field="fullname" {...sortProps} className="ml-7" />,
      cell: ({ row }) => <span className={cellText}>{row.original.name}</span>,
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
        <span className={cellText}>
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
        <span className={cellText + ' ml-3'}>{convertToRegionTime(row.original.login, region)}</span>
      ),
    },
    {
      accessorKey: 'Check out',
      header: () => <SortHeader label="Check out" field="checkout" {...sortProps} />,
      cell: ({ row }) => (
        <span className={cellText + ' ml-5'}>
          {row.original.logout === '--' ? (
            <span className="ml-4"> -- </span>
          ) : (
            convertToRegionTime(row.original.logout, region)
          )}
        </span>
      ),
    },
    {
      accessorKey: 'Camera',
      header: 'Camera',
      cell: ({ row }) => (
        <div className="flex flex-col gap-2">
          <span className={cellText}>checkin: {row.original.checkinCam}</span>
          <span className={cellText}>checkout: {row.original.checkoutCam}</span>
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

const InfoRow = ({ icon: Icon, label, value, title }) => (
  <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm min-w-0">
    <Icon className="w-4 h-4 md:w-5 md:h-5 text-[var(--tx3)] shrink-0" />
    <span className="font-semibold text-[var(--tx)] w-16 md:w-24 shrink-0 text-[10px] md:text-[11px] uppercase tracking-wider">
      {label}
    </span>
    <span className="text-[var(--tx2)] truncate flex-1 text-right min-w-0" title={title}>
      {value}
    </span>
  </div>
);

/** Grid-view card renderer. `ctx` = { dispatch, region, convertToRegionTime }. */
export const renderAttendanceCard = (item, { dispatch, region, convertToRegionTime }) => {
  const dateStr = moment(item.login).isValid()
    ? moment(item.login).format('DD/MM/YYYY')
    : moment(item.logout).isValid()
      ? moment(item.logout).format('DD/MM/YYYY')
      : '--';
  const checkInStr = convertToRegionTime(item.login, region);
  const checkOutStr = item.logout === '--' ? '--' : convertToRegionTime(item.logout, region);

  return (
    <div
      onClick={() => {
        dispatch({ type: 'SET_SELECTED_PROFILE', value: item });
        dispatch({ type: 'SET_SHOW_PROFILE_DIALOG', value: true });
      }}
      className="bg-[var(--bg1solid)] rounded-2xl p-3 sm:p-4 md:p-5 lg:p-6 shadow-sm border border-[var(--bd)] flex flex-col items-center relative group hover:shadow-md transition-shadow cursor-pointer h-full w-full min-w-0"
    >
      <div className="absolute top-2 left-2 md:top-3 md:left-3 z-20 max-w-[55%]">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-semibold bg-[var(--brand)]/10 text-[var(--brand)] border border-[var(--brand)]/20 shadow-sm truncate max-w-full">
          {item.department}
        </span>
      </div>

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
        <button
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'SET_SELECTED_BREAK_LOG', value: item });
            dispatch({ type: 'SET_SHOW_BREAK_LOGS', value: true });
          }}
          className="text-[var(--brand)] hover:bg-[var(--bg2)] p-1 md:p-1.5 rounded-full transition-colors cursor-pointer"
          aria-label={`View break logs for ${item.name}`}
          title="Break logs"
        >
          <Hourglass className="w-4 h-4 md:w-5 md:h-5" />
        </button>
      </div>

      <div className="relative mb-3 md:mb-5 mt-6 sm:mt-4 flex items-center justify-center w-full">
        <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 rounded-full overflow-hidden shadow-sm shrink-0 ring-4 ring-[var(--bg2)] group-hover:ring-[var(--brand)]/30 transition-all">
          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
        </div>
      </div>

      <div className="w-full text-center mb-2 md:mb-3 px-2">
        <div className="text-[var(--tx)] text-sm md:text-base font-semibold truncate">{item.name}</div>
      </div>

      <div className="w-full h-px bg-[var(--bd)] mb-3 md:mb-5" />

      <div className="w-full space-y-2.5 md:space-y-3.5">
        <InfoRow icon={Calendar} label="Date" value={dateStr} />
        <InfoRow icon={MapPin} label="Location" value={item.location} title={item.location} />
        <InfoRow icon={LogIn} label="Check In" value={checkInStr} />
        <InfoRow icon={LogOut} label="Check Out" value={checkOutStr} />
        <InfoRow icon={Video} label="In Cam" value={item.checkinCam} title={item.checkinCam} />
        <InfoRow icon={Video} label="Out Cam" value={item.checkoutCam} title={item.checkoutCam} />
      </div>
    </div>
  );
};
