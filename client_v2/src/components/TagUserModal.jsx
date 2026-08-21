import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Search, Loader2, UserCheck, UserMinus, X, Car, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchTaggableUsers,
  tagVehicleToUser,
  untagVehicleFromUser,
  taggedUserName,
  formatPlate,
  samePlate,
  tagApiError,
} from '@/helpers/vehicleTagging';

const HOST = import.meta.env.VITE_BACKEND || '';
const PAGE_SIZE = 20;

// Themed initials avatar, mirroring Detected Users' fallback so a user with no
// profile picture reads the same in both tagging dialogs.
const initialsAvatar = (firstName, lastName) => {
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  const svg = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="20" fill="#E3F5FF"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#07486A" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const fieldCls =
  'w-full h-11 px-3 text-sm rounded-[10px] border border-[var(--bd)] bg-[var(--bg3)] text-[var(--tx)] placeholder:text-[var(--tx3)] focus:outline-none focus:border-[var(--blue)] transition-colors';

/**
 * "Tag User" for a detected vehicle number.
 *
 * Lists every registered user with a search box; confirming writes the plate
 * onto the selected user, after which every ANPR log and Vehicle Detection
 * incident carrying that plate shows their name alongside it.
 *
 * @param {string} vehicleNumber plate detected on the log/incident being tagged
 * @param {(data: object|null) => void} onTagged called after a successful tag
 */
export default function TagUserModal({ open, vehicleNumber, onClose, onTagged }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const listRef = useRef(null);
  // Guards against overlapping search/scroll fetches; a ref so the scroll
  // handler reads it live rather than through a stale closure.
  const fetchingRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Reset when the dialog closes so the next plate starts from a clean list.
  useEffect(() => {
    if (open) return;
    setSearch('');
    setDebouncedSearch('');
    setUsers([]);
    setTotalCount(0);
    setSelectedUserId(null);
    setLoadingMore(false);
    setSubmitting(false);
  }, [open]);

  // Initial load + reload whenever the search term settles.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      fetchingRef.current = true;
      try {
        const { users: list, totalCount: total } = await fetchTaggableUsers({
          skip: 0,
          limit: PAGE_SIZE,
          search: debouncedSearch,
        });
        if (cancelled) return;
        setUsers(list);
        setTotalCount(total);
        if (listRef.current) listRef.current.scrollTop = 0;
      } catch (err) {
        if (!cancelled) toast.error(tagApiError(err, 'Failed to load users'));
      } finally {
        if (!cancelled) setLoading(false);
        fetchingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, debouncedSearch]);

  const loadMore = useCallback(async () => {
    if (fetchingRef.current || users.length >= totalCount) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    try {
      const { users: list, totalCount: total } = await fetchTaggableUsers({
        skip: users.length,
        limit: PAGE_SIZE,
        search: debouncedSearch,
      });
      setUsers((prev) => [...prev, ...list]);
      setTotalCount(total);
    } catch (err) {
      toast.error(tagApiError(err, 'Failed to load more users'));
    } finally {
      setLoadingMore(false);
      fetchingRef.current = false;
    }
  }, [users.length, totalCount, debouncedSearch]);

  // Escape closes, unless a tag is mid-flight.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const selectedUser = users.find((u) => u._id === selectedUserId) || null;
  // Each user holds a single vehicle number, so tagging someone who already
  // has a different plate replaces it — say so before they confirm.
  const replacesPlate =
    !!selectedUser?.vehicleNumber && !samePlate(selectedUser.vehicleNumber, vehicleNumber);

  const handleConfirm = async () => {
    if (!selectedUser || submitting) return;
    setSubmitting(true);
    try {
      const body = await tagVehicleToUser({
        userId: selectedUser._id,
        vehicleNumber,
      });
      toast.success(body?.message || 'User tagged successfully');
      onTagged?.(body?.data || null);
      onClose?.();
    } catch (err) {
      toast.error(tagApiError(err, 'Failed to tag user'));
    } finally {
      setSubmitting(false);
    }
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !submitting && onClose?.()}
    >
      <div className="w-full max-w-md sm:max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--bd)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white shadow-sm shrink-0">
              <Car className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-[var(--tx)] leading-tight">
                Tag User
              </h3>
              <p className="text-[11px] text-[var(--tx3)] leading-tight truncate">
                Link this vehicle number to a registered user
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            className="p-1.5 rounded-lg text-[var(--tx2)] hover:bg-[var(--bg2)] hover:text-[var(--tx)] cursor-pointer transition-colors shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto">
          {/* The plate being tagged */}
          <div className="flex items-center gap-2.5 mb-4">
            <span className="text-xs font-semibold text-[var(--tx2)]">Vehicle Number</span>
            <span
              className="inline-block text-[12px] font-bold tracking-[0.08em] text-[var(--tx)] bg-[var(--bg2)] border border-[var(--bd)] px-2.5 py-1 rounded-[6px]"
              style={{ fontFamily: 'var(--mono)' }}
            >
              {formatPlate(vehicleNumber)}
            </span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tx3)] pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users by name or email"
              className={`${fieldCls} pl-9`}
            />
          </div>

          <div
            ref={listRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) loadMore();
            }}
            className="max-h-64 overflow-y-auto -mx-1 px-1 mt-3 space-y-1.5"
          >
            {loading ? (
              <div className="flex items-center justify-center py-8 text-[var(--tx3)]">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-[var(--tx3)] text-xs">No users found.</div>
            ) : (
              users.map((u) => {
                const avatar =
                  u.profilePics?.length > 0
                    ? `${HOST}/uploads${u.profilePics[0]}`
                    : initialsAvatar(u.firstName, u.lastName);
                const isSelected = selectedUserId === u._id;
                return (
                  <button
                    key={u._id}
                    type="button"
                    onClick={() => setSelectedUserId(u._id)}
                    className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all text-left cursor-pointer border ${
                      isSelected
                        ? 'bg-[var(--brand)]/10 border-[var(--brand)]/50 ring-1 ring-[var(--brand)]/30'
                        : 'bg-[var(--bg2)]/40 border-[var(--bd)] hover:bg-[var(--bg2)] hover:border-[var(--bd2)]'
                    }`}
                  >
                    <img
                      src={avatar}
                      alt=""
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = initialsAvatar(u.firstName, u.lastName);
                      }}
                      className="w-9 h-9 rounded-full object-cover shrink-0 border border-[var(--bd)]"
                    />
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-[13px] font-medium text-[var(--tx)] truncate">
                        {taggedUserName(u)}
                      </span>
                      <span className="text-[11px] text-[var(--tx3)] truncate">
                        {u.email || u.designation || '—'}
                      </span>
                    </span>
                    {u.vehicleNumber && (
                      <span
                        className="text-[10px] font-semibold tracking-[0.06em] text-[var(--tx2)] bg-[var(--bg2)] border border-[var(--bd)] px-2 py-0.5 rounded-[5px] shrink-0"
                        style={{ fontFamily: 'var(--mono)' }}
                        title="Vehicle number already on this user"
                      >
                        {formatPlate(u.vehicleNumber)}
                      </span>
                    )}
                    {isSelected && <UserCheck className="w-4 h-4 text-[var(--brand)] shrink-0" />}
                  </button>
                );
              })
            )}

            {loadingMore && (
              <div className="flex items-center justify-center py-3 text-[var(--tx3)]">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            )}
          </div>

          {replacesPlate && (
            <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded-[10px] border border-[var(--warn)]/40 bg-[var(--warn)]/10">
              <AlertTriangle className="w-4 h-4 text-[var(--warn)] shrink-0 mt-[1px]" />
              <span className="text-[11.5px] text-[var(--tx2)] leading-snug">
                {taggedUserName(selectedUser)} already has{' '}
                <b style={{ fontFamily: 'var(--mono)' }}>
                  {formatPlate(selectedUser.vehicleNumber)}
                </b>
                . Tagging replaces it with {formatPlate(vehicleNumber)}.
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 sm:px-6 py-4 border-t border-[var(--bd)]">
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            disabled={submitting}
            className="px-4 py-2 rounded-[10px] text-sm font-medium text-[var(--tx2)] bg-[var(--bg2)] border border-[var(--bd)] hover:text-[var(--tx)] cursor-pointer disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedUser || submitting}
            className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold text-white bg-[var(--blue)] border border-[var(--blue)] hover:opacity-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Tagging…' : 'Tag User'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Confirmation for removing a vehicle number from the user it was tagged to.
 *
 * Deliberately a separate, small dialog rather than a control on the tag list:
 * untagging is destructive to an association an admin set up on purpose, so it
 * gets an explicit confirm naming both the plate and the person.
 *
 * @param {object} taggedUser the user currently holding the plate
 * @param {() => void} onUntagged called after a successful untag
 */
export function UntagUserModal({ open, vehicleNumber, taggedUser, onClose, onUntagged }) {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open || !taggedUser) return null;

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const body = await untagVehicleFromUser({
        userId: taggedUser._id,
        vehicleNumber,
      });
      toast.success(body?.message || 'User untagged successfully');
      onUntagged?.(body?.data || null);
      onClose?.();
    } catch (err) {
      toast.error(tagApiError(err, 'Failed to untag user'));
    } finally {
      setSubmitting(false);
    }
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !submitting && onClose?.()}
    >
      <div className="w-full max-w-sm rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--bd)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--crit)]/15 text-[var(--crit)] shrink-0">
              <UserMinus className="w-4 h-4" />
            </span>
            <h3 className="text-base font-semibold text-[var(--tx)] leading-tight">Untag User</h3>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            className="p-1.5 rounded-lg text-[var(--tx2)] hover:bg-[var(--bg2)] hover:text-[var(--tx)] cursor-pointer transition-colors shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 text-[13px] text-[var(--tx2)] leading-relaxed">
          Remove{' '}
          <b className="text-[var(--tx)]" style={{ fontFamily: 'var(--mono)' }}>
            {formatPlate(vehicleNumber)}
          </b>{' '}
          from <b className="text-[var(--tx)]">{taggedUserName(taggedUser)}</b>?
          <div className="mt-2 text-[11.5px] text-[var(--tx3)]">
            Detections of this vehicle will show as untagged again, and can be tagged
            to any user later.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--bd)]">
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            disabled={submitting}
            className="px-4 py-2 rounded-[10px] text-sm font-medium text-[var(--tx2)] bg-[var(--bg2)] border border-[var(--bd)] hover:text-[var(--tx)] cursor-pointer disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold text-white bg-[var(--crit)] border border-[var(--crit)] hover:opacity-90 cursor-pointer disabled:opacity-40 transition-opacity"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Untagging…' : 'Untag'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
