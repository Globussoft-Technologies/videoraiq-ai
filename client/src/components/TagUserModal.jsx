import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, Loader2, UserCheck, UserMinus, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import useDebounce from '@/hooks/useDebounce';
import {
  fetchTaggableUsers,
  tagVehicleToUser,
  untagVehicleFromUser,
  taggedUserName,
  formatPlate,
  samePlate,
  tagApiError,
} from '@/helpers/vehicleTagging';

const nasUrl = import.meta.env.VITE_BACKEND || '';
const PAGE_SIZE = 20;

const getInitialsPlaceholder = (firstName, lastName) => {
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  const svg = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="20" fill="#E3F5FF"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#07486A" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

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
const TagUserModal = ({ open, vehicleNumber, onClose, onTagged }) => {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [users, setUsers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const listRef = useRef(null);
  // Guards against overlapping scroll/search fetches; a ref so the scroll
  // handler reads it live.
  const fetchingRef = useRef(false);

  // Reset when the dialog closes so the next plate starts from a clean list.
  useEffect(() => {
    if (open) return;
    setSearch('');
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose?.()}>
      <DialogContent className="max-w-md sm:max-w-lg w-[95vw] p-6 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tag User</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-gray-500 -mt-2">
          Link vehicle number{' '}
          <span className="font-semibold text-[#07486A] tracking-wide">
            {formatPlate(vehicleNumber)}
          </span>{' '}
          to a registered user.
        </p>

        <div className="relative mt-1">
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name or email"
            className="w-full pl-3 pr-9 h-9 text-xs border border-[#C7C7C7] rounded-lg text-[#595959] focus:outline-none focus:ring-1 focus:ring-[#07486A]"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#595959]" />
        </div>

        <div
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) loadMore();
          }}
          className="max-h-64 overflow-y-auto -mx-1 px-1 mt-2 space-y-1"
        >
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs">No users found.</div>
          ) : (
            users.map((u) => {
              const avatar =
                u.profilePics && u.profilePics.length > 0
                  ? `${nasUrl}/api/v1/uploads${u.profilePics[0]}`
                  : getInitialsPlaceholder(u.firstName, u.lastName);
              const isSelected = selectedUserId === u._id;
              return (
                <button
                  key={u._id}
                  type="button"
                  onClick={() => setSelectedUserId(u._id)}
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors text-left cursor-pointer border ${
                    isSelected
                      ? 'bg-[#E3F5FF] border-[#CFEFFF]'
                      : 'border-transparent hover:bg-[#F8FBFD]'
                  }`}
                >
                  <img
                    src={avatar}
                    alt=""
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = getInitialsPlaceholder(u.firstName, u.lastName);
                    }}
                    className="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-gray-200"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-800 truncate">
                      {taggedUserName(u)}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {u.email || u.designation || '—'}
                    </p>
                  </div>
                  {u.vehicleNumber && (
                    <span
                      className="text-[10px] font-semibold tracking-wide text-[#595959] bg-[#F3F3F3] border border-[#E4E4E4] px-2 py-0.5 rounded shrink-0"
                      title="Vehicle number already on this user"
                    >
                      {formatPlate(u.vehicleNumber)}
                    </span>
                  )}
                  {isSelected && <UserCheck className="w-4 h-4 text-[#07486A] shrink-0" />}
                </button>
              );
            })
          )}

          {/* Infinite-scroll "loading more" indicator */}
          {loadingMore && !loading && (
            <div className="flex items-center justify-center py-3 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}
        </div>

        {replacesPlate && (
          <div className="flex items-start gap-2 mt-2 px-3 py-2 rounded-lg border border-[#F5C87A] bg-[#FFF8EB]">
            <AlertTriangle className="w-4 h-4 text-[#B7791F] shrink-0 mt-[1px]" />
            <span className="text-[11px] text-[#7A5A16] leading-snug">
              {taggedUserName(selectedUser)} already has{' '}
              <b>{formatPlate(selectedUser.vehicleNumber)}</b>. Tagging replaces it with{' '}
              {formatPlate(vehicleNumber)}.
            </span>
          </div>
        )}

        <button
          type="button"
          disabled={!selectedUser || submitting}
          onClick={handleConfirm}
          className="mt-3 w-full bg-[#07486A] text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? 'Tagging…' : 'Tag User'}
        </button>
      </DialogContent>
    </Dialog>
  );
};

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
export const UntagUserModal = ({ open, vehicleNumber, taggedUser, onClose, onUntagged }) => {
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose?.()}>
      <DialogContent className="max-w-sm w-[95vw] p-6 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserMinus className="w-4 h-4 text-[#CE241C]" />
            Untag User
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-gray-600 leading-relaxed -mt-1">
          Remove{' '}
          <span className="font-semibold text-[#07486A] tracking-wide">
            {formatPlate(vehicleNumber)}
          </span>{' '}
          from <span className="font-semibold text-gray-800">{taggedUserName(taggedUser)}</span>?
        </p>
        <p className="text-[11px] text-gray-400 -mt-2">
          Detections of this vehicle will show as untagged again, and can be tagged to
          any user later.
        </p>

        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-[#C7C7C7] hover:bg-gray-50 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#CE241C] hover:opacity-90 cursor-pointer disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Untagging…' : 'Untag'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TagUserModal;
