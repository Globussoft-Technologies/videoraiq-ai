import { useState } from 'react';
import {
  Trash,
  Mail,
  Briefcase,
  MapPin,
  PencilLine,
  ChevronLeft,
  ChevronRight,
  Check,
  CircleAlert,
} from 'lucide-react';
import { displayEmail } from './displayEmail';

const nasUrl = import.meta.env.VITE_BACKEND;

export const getInitialsPlaceholder = (firstName, lastName, size = 128) => {
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  const colors = ['#3b82f6', '#22d3ee', '#a855f7'];
  const index = initials.charCodeAt(0) % colors.length;
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="${colors[index]}"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.38}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const StatusBadge = ({ verified }) =>
  verified ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/20 text-white backdrop-blur-sm">
      <Check className="w-3 h-3" strokeWidth={3} />
      Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/15 text-white/90 backdrop-blur-sm">
      <CircleAlert className="w-3 h-3" strokeWidth={2.5} />
      Not Verified
    </span>
  );

/* ─────────────── Card ─────────────── */
export const UserCard = ({ user, handleEdit, handleDelete, setSelectedUser, setIsUserModalOpen, selectedUserIds, toggleUserSelection }) => {
  const [imgIdx, setImgIdx] = useState(0);
  const pics = user.profilePics || [];
  const many = pics.length > 1;
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  const handle = (user.userName || fullName || '').toLowerCase().replace(/\s+/g, '');

  const infoRows = [
    { icon: Mail, label: 'Email', value: displayEmail(user.email) || 'N/A' },
    { icon: Briefcase, label: 'Department', value: user.departmentId?.departmentName || 'Default' },
    { icon: MapPin, label: 'Location', value: user.location || 'Default' },
  ];

  return (
    <div
      onClick={() => {
        setSelectedUser(user);
        setIsUserModalOpen(true);
      }}
      className="bg-[var(--bg1solid)] rounded-2xl border border-[var(--bd)] flex flex-col relative shadow-[0_4px_16px_rgba(15,23,42,0.08)] hover:shadow-[0_10px_28px_rgba(15,23,42,0.14)] hover:-translate-y-0.5 transition-all duration-200 cursor-pointer h-full overflow-hidden"
    >
      {/* Header */}
      <div
        className={`relative h-20 shrink-0 ${
          user.verified
            ? 'bg-gradient-to-r from-[var(--blue)] to-[var(--violet)]'
            : 'bg-gradient-to-r from-[var(--tx3)] to-[var(--tx2)]'
        }`}
      >
        <div className="absolute top-3 left-3 z-20">
          <StatusBadge verified={!!user.verified} />
        </div>

        <div className="absolute top-3 right-3 flex items-center gap-1 z-30">
          <input
            type="checkbox"
            checked={selectedUserIds.includes(user._id)}
            onChange={(e) => {
              e.stopPropagation();
              toggleUserSelection(user._id);
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded accent-[var(--blue)]"
          />
          <button
            title="Edit User"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(user);
            }}
            className="text-white bg-white/15 hover:bg-white/25 p-1.5 rounded-full transition-colors cursor-pointer"
          >
            <PencilLine className="w-4 h-4" />
          </button>
          <button
            title="Delete User"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(user._id);
            }}
            className="text-white bg-white/15 hover:bg-[var(--crit)] p-1.5 rounded-full transition-colors cursor-pointer"
          >
            <Trash className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Avatar — overlaps header/body boundary */}
      <div className="relative -mt-10 flex items-center justify-center gap-2 px-2">
        {many && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((p) => (p - 1 + pics.length) % pics.length);
            }}
            className="relative top-4 p-1 cursor-pointer rounded-full bg-[var(--bg1solid)] shadow-sm text-[var(--tx3)] hover:text-[var(--tx)] z-30"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div className="w-20 h-20 rounded-full overflow-hidden shrink-0 ring-4 ring-[var(--bg1solid)] shadow-md">
          <img
            src={pics.length > 0 ? `${nasUrl}/uploads/${pics[imgIdx]}` : getInitialsPlaceholder(user.firstName, user.lastName)}
            alt={fullName}
            className="w-full h-full object-cover object-top"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = getInitialsPlaceholder(user.firstName, user.lastName);
            }}
          />
        </div>
        {many && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((p) => (p + 1) % pics.length);
            }}
            className="relative top-4 p-1 cursor-pointer rounded-full bg-[var(--bg1solid)] shadow-sm text-[var(--tx3)] hover:text-[var(--tx)] z-30"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Name / handle */}
      <div className="text-center px-4 mt-2">
        <h3 className="text-[15px] font-semibold text-[var(--tx)] truncate" title={fullName}>
          {fullName || 'Unnamed User'}
        </h3>
        <p className="text-xs text-[var(--tx3)] truncate mt-0.5">
          {handle && <span>@{handle}</span>}
          {handle && ' · '}
          <span className="text-[var(--blue)] font-medium">
            {user.departmentId?.departmentName || 'Default'}
          </span>
        </p>
      </div>

      {/* Info section */}
      <div className="w-full px-4 pb-4 pt-4 mt-2 space-y-2.5">
        {infoRows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 text-sm">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--blue)]/10 text-[var(--blue)] shrink-0">
              <Icon className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--tx3)]">
                {label}
              </span>
              <span className="block text-[13px] font-medium text-[var(--tx)] truncate" title={value}>
                {value}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─────────────── Table row ─────────────── */
export const UserTableRow = ({ user, index, currentPage, limit, handleEdit, handleDelete, setSelectedUser, setIsUserModalOpen, selectedUserIds, toggleUserSelection }) => {
  const pics = user.profilePics || [];
  const avatar = pics.length > 0 ? `${nasUrl}/uploads/${pics[0]}` : getInitialsPlaceholder(user.firstName, user.lastName, 40);

  return (
    <tr
      onClick={() => {
        setSelectedUser(user);
        setIsUserModalOpen(true);
      }}
      className="border-b border-[var(--bd)] hover:bg-[var(--bg2)] transition-colors cursor-pointer text-[var(--tx)]"
    >
      <td className="px-3 py-3 text-center">
        <input
          type="checkbox"
          checked={selectedUserIds.includes(user._id)}
          onChange={(e) => {
            e.stopPropagation();
            toggleUserSelection(user._id);
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded accent-[var(--blue)]"
        />
      </td>
      <td className="px-3 py-3 text-xs text-[var(--tx3)] text-center">
        {(currentPage - 1) * limit + index + 1}
      </td>
      <td className="px-3 py-3 max-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <img
            src={avatar}
            alt={`${user.firstName} ${user.lastName}`}
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = getInitialsPlaceholder(user.firstName, user.lastName, 40);
            }}
            className="w-8 h-8 rounded-full object-cover object-top shrink-0 ring-1 ring-[var(--bd)]"
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--tx)] truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-[10px] text-[var(--tx3)] truncate">{user.userName || '—'}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 max-w-0">
        <span className="block text-xs text-[var(--tx2)] truncate" title={displayEmail(user.email) || 'N/A'}>
          {displayEmail(user.email) || 'N/A'}
        </span>
      </td>
      <td className="px-3 py-3 max-w-0">
        <span className="block text-xs text-[var(--tx2)] truncate">
          {user.departmentId?.departmentName || 'N/A'}
        </span>
      </td>
      <td className="px-3 py-3 max-w-0">
        <span className="block text-xs text-[var(--tx2)] truncate">{user.location || '-'}</span>
      </td>
      <td className="px-3 py-3 text-center">
        <StatusBadge verified={!!user.verified} />
      </td>
      <td className="px-3 py-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <button
            title="Edit User"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(user);
            }}
            className="text-[var(--blue)] hover:bg-[var(--blue)]/10 p-1.5 rounded-full transition-colors cursor-pointer"
          >
            <PencilLine className="w-4 h-4" />
          </button>
          <button
            title="Delete User"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(user._id);
            }}
            className="text-[var(--crit)] hover:bg-[var(--crit)]/10 p-1.5 rounded-full transition-colors cursor-pointer"
          >
            <Trash className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
};


