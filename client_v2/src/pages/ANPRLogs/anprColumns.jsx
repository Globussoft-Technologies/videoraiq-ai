import React from 'react';
import moment from 'moment-timezone';
import { Image, Pencil, UserPlus, UserCheck, UserMinus } from 'lucide-react';
import { styles } from './anprState';
import ImageWithLoader from '@/pages/AttendanceLogs/components/ImageWithLoader';
import { taggedUserName, hasReadablePlate } from '@/helpers/vehicleTagging';

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
  t && t !== '--' ? moment.utc(t).tz(moment.tz.guess()).format('DD/MM/YYYY hh:mm A') : '--';

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
 * Tagged-user badge for the grid card. A plate that already belongs to a
 * registered user shows their name beside an Untag button; one that doesn't
 * offers Tag User, so an admin can link it at any time. Both controls are
 * labelled pills of the same size, so the card reads as one pair of opposite
 * actions. Rows where the detector read no plate at all get neither — there
 * is nothing to tag a user to.
 *
 * The list view deliberately uses the read-only TaggedUserText below instead:
 * its Tagged User column shows who a plate resolves to and nothing more.
 */
const TaggedUserCell = ({ row, onTagUser, onUntagUser, onViewUser }) => {
  if (row.taggedUser) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--tx)] max-w-[230px] min-w-0">
        <UserCheck className="w-3.5 h-3.5 text-[var(--ok)] shrink-0" />
        {/* The name opens the registered user's full details without leaving
            the log. Falls back to plain text where viewing isn't wired up. */}
        {typeof onViewUser === 'function' ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewUser(row.taggedUser);
            }}
            className="truncate text-left underline decoration-dotted underline-offset-2 hover:text-[var(--brand)] cursor-pointer"
            title={`View ${taggedUserName(row.taggedUser)}'s details`}
          >
            {taggedUserName(row.taggedUser)}
          </button>
        ) : (
          <span className="truncate">{taggedUserName(row.taggedUser)}</span>
        )}
        {typeof onUntagUser === 'function' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUntagUser(row);
            }}
            className="shrink-0 inline-flex items-center gap-1 text-[11.5px] font-medium px-2 py-1 rounded-[6px] border border-[var(--crit-ink)]/40 bg-[var(--crit-ink)]/12 text-[var(--crit-ink)] hover:bg-[var(--crit-ink)]/22 hover:border-[var(--crit-ink)] transition-colors cursor-pointer"
            title={`Untag ${taggedUserName(row.taggedUser)} from this vehicle`}
          >
            <UserMinus className="w-3.5 h-3.5" />
            Untag
          </button>
        )}
      </span>
    );
  }

  if (!hasReadablePlate(row.vehicleNumber) || typeof onTagUser !== 'function') {
    return <span className={styles.text}>--</span>;
  }

  return (
    <button
      onClick={() => onTagUser(row)}
      className="inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1 rounded-[6px] border border-[var(--ok-ink)]/40 bg-[var(--ok-ink)]/12 text-[var(--ok-ink)] hover:bg-[var(--ok-ink)]/22 hover:border-[var(--ok-ink)] transition-colors cursor-pointer"
      title="Tag this vehicle number to a registered user"
    >
      <UserPlus className="w-3.5 h-3.5" />
      Tag User
    </button>
  );
};

/**
 * Tagged-user cell for the list view — read-only. Its tag and untag controls
 * moved to the Actions column, so the column states who a plate resolves to
 * and nothing more: a name when it belongs to someone, "--" when it doesn't.
 * The name still opens that user's details, which reads rather than edits.
 */
const TaggedUserText = ({ row, onViewUser }) => {
  if (!row.taggedUser) return <span className={styles.text}>--</span>;

  const name = taggedUserName(row.taggedUser);

  if (typeof onViewUser !== 'function') {
    return <span className={`${styles.text} block max-w-[200px] truncate`}>{name}</span>;
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onViewUser(row.taggedUser);
      }}
      className="block max-w-[200px] truncate text-left text-[12px] text-[var(--tx)] underline decoration-dotted underline-offset-2 hover:text-[var(--brand)] cursor-pointer"
      title={`View ${name}'s details`}
    >
      {name}
    </button>
  );
};

// Action buttons in the list's Actions column share the Edit pencil's
// square-icon shape. Edit keeps the neutral fill; tag and untag are tinted
// green and red, because person-plus and person-minus are near-identical
// glyphs at 16px and colour is what tells a tagged row from an untagged one
// when you scan the column. The inks are per-theme tokens, so both stay
// legible on a white row and on a near-black one.
const actionBtn =
  'w-8 h-8 flex items-center justify-center rounded-lg border transition-colors cursor-pointer';

const editBtn = `${actionBtn} border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] hover:text-[var(--brand)] hover:border-[var(--brand)]`;

const tagBtn = `${actionBtn} border-[var(--ok-ink)]/40 bg-[var(--ok-ink)]/12 text-[var(--ok-ink)] hover:bg-[var(--ok-ink)]/22 hover:border-[var(--ok-ink)]`;

const untagBtn = `${actionBtn} border-[var(--crit-ink)]/40 bg-[var(--crit-ink)]/12 text-[var(--crit-ink)] hover:bg-[var(--crit-ink)]/22 hover:border-[var(--crit-ink)]`;

/**
 * Tag / untag control for the list's Actions column. It sits beside Edit
 * rather than inside the Tagged User column, which stays read-only text — a
 * tagged plate offers Untag, an untagged one offers Tag, and a row the
 * detector read no plate from offers neither, since there is nothing to tag.
 */
const TagAction = ({ row, onTagUser, onUntagUser }) => {
  if (row.taggedUser) {
    if (typeof onUntagUser !== 'function') return null;
    return (
      <button
        onClick={() => onUntagUser(row)}
        className={untagBtn}
        title={`Untag ${taggedUserName(row.taggedUser)} from this vehicle`}
        aria-label="Untag user"
      >
        <UserMinus className="w-4 h-4" />
      </button>
    );
  }

  if (typeof onTagUser !== 'function' || !hasReadablePlate(row.vehicleNumber)) return null;

  return (
    <button
      onClick={() => onTagUser(row)}
      className={tagBtn}
      title="Tag this vehicle number to a registered user"
      aria-label="Tag user"
    >
      <UserPlus className="w-4 h-4" />
    </button>
  );
};

/**
 * Build the ANPR log table columns. `onSort(field)` toggles sort for the
 * sortable headers, `onPreview(url)` opens the incident image modal, and
 * `onViewUser(user)` opens a tagged user's details. `onTagUser(row)` /
 * `onUntagUser(row)` back the Actions column's tag and untag buttons.
 */
export const buildColumns = ({
  onSort,
  onPreview,
  onEdit,
  onTagUser,
  onUntagUser,
  onViewUser,
}) => [
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
    accessorKey: 'taggedUser',
    header: 'Tagged User',
    cell: ({ row }) => <TaggedUserText row={row.original} onViewUser={onViewUser} />,
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
    cell: ({ row }) => <span className={styles.text}>{formatTime(row.original.timeOfIncident)}</span>,
  },
  ...(typeof onEdit === 'function' ||
  typeof onTagUser === 'function' ||
  typeof onUntagUser === 'function'
    ? [
        {
          accessorKey: 'actions',
          header: 'Actions',
          cell: ({ row }) => (
            <div className="flex items-center gap-1.5">
              {typeof onEdit === 'function' && (
                <button
                  onClick={() => onEdit(row.original)}
                  className={editBtn}
                  title="Edit incident"
                  aria-label="Edit incident"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              <TagAction
                row={row.original}
                onTagUser={onTagUser}
                onUntagUser={onUntagUser}
              />
            </div>
          ),
        },
      ]
    : []),
];

/**
 * Grid-view card for a single ANPR log row — image-forward "plate overlay"
 * layout ported from the VideoraIQ prototype. Clicking the snapshot opens the
 * full-size image preview modal (ANPR's existing "big mode").
 * `ctx` = { onPreview, onEdit, onTagUser, onUntagUser, onViewUser }.
 */
export const renderANPRCard = (row, { onPreview, onEdit, onTagUser, onUntagUser, onViewUser }) => (
  <div className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[13px] overflow-hidden hover:border-[var(--bd2)] transition-colors h-full w-full min-w-0">
    {/* Snapshot fills the top of the card */}
    <div
      className="relative bg-[#0a0e15] flex items-center justify-center"
      style={{ aspectRatio: '4 / 3' }}
    >
      {typeof onEdit === 'function' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(row);
          }}
          className="absolute top-2 left-2 z-30 w-8 h-8 flex items-center justify-center rounded-lg bg-[rgba(6,8,13,.72)] text-white hover:bg-[rgba(6,8,13,.9)] cursor-pointer shadow-sm"
          title="Edit incident"
          aria-label="Edit incident"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
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
      {/* Tagged user sits directly under the plate overlay — the plate and who
          it belongs to are the two things this card exists to show. The
          timestamp shares this row rather than the one below, which left it
          stranded low against an empty gap beside the tag control. */}
      <div className="flex items-center justify-between gap-2 min-h-[24px]">
        <TaggedUserCell
          row={row}
          onTagUser={onTagUser}
          onUntagUser={onUntagUser}
          onViewUser={onViewUser}
        />
        <span
          className="text-[11px] text-[var(--tx3)] whitespace-nowrap shrink-0"
          style={{ fontFamily: 'var(--mono)' }}
        >
          {formatTime(row.timeOfIncident)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-[5px]">
        <span className="text-[12px] text-[var(--tx2)] truncate">{row.incidentName}</span>
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
