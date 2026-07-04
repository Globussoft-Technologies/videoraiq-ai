import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Search, Loader2, UserPlus, UserCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { authorizedUsers } from '@/page/user/Dashboard/Api/get';
import { getEmployeeLocations } from '@/page/user/UserDetails/Api/Post';
import { quickCreateFaceUser, tagFaceImages } from '../Api/faceImages';
import useDebounce from '@/hooks/useDebounce';
import getAccessToken from '@/utils/getAccessToken';

const departmentAPI = `${import.meta.env.VITE_BACKEND}/api/v1/departments/get`;

const nasUrl = import.meta.env.VITE_BACKEND || '';

const PAGE_SIZE = 20;

const getInitialsPlaceholder = (firstName, lastName) => {
  const initials =
    `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  const svg = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="20" fill="#E3F5FF"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#07486A" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

// "Save Folder" flow for a flagged-user folder: either link the folder to an
// existing authorized user, or register a brand-new one (reusing RegisterForm).
const TagFlaggedUserModal = ({ open, folder, onClose, onTagged }) => {
  const [mode, setMode] = useState('existing');
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
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDesignation, setNewDesignation] = useState('');
  const [newLocationId, setNewLocationId] = useState('');
  const [newDepartmentId, setNewDepartmentId] = useState('');
  const [newUserErrors, setNewUserErrors] = useState({});
  const [departments, setDepartments] = useState([]);
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    if (!open) {
      setMode('existing');
      setSearch('');
      setUsers([]);
      setTotalCount(0);
      setLoadingMore(false);
      setSubmitting(false);
      setSelectedUserId(null);
      setNewFirstName('');
      setNewLastName('');
      setNewEmail('');
      setNewDesignation('');
      setNewLocationId('');
      setNewDepartmentId('');
      setNewUserErrors({});
    }
  }, [open]);

  useEffect(() => {
    if (!open || mode !== 'new') return;
    const fetchDepartments = async () => {
      try {
        const res = await fetch(departmentAPI, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-access-token': getAccessToken(),
          },
          body: JSON.stringify({ skip: 0, limit: 100 }),
        });
        const data = await res.json();
        if (data?.body?.status === 'success') {
          setDepartments(data.body.data.data || []);
        }
      } catch (err) {
        console.error('Failed to load departments', err);
      }
    };
    const fetchLocations = async () => {
      try {
        const res = await getEmployeeLocations();
        // Keep the full location objects so a selected location can supply both
        // its name (`location`) and its id (`locationId`) to the payload.
        setLocations(res?.data?.body?.data?.locations || []);
      } catch (err) {
        console.error('Failed to load locations', err);
      }
    };
    fetchDepartments();
    fetchLocations();
  }, [open, mode]);

  // Initial load + reload on search change (resets the list to page 1).
  useEffect(() => {
    if (!open || mode !== 'existing') return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      fetchingRef.current = true;
      try {
        const res = await authorizedUsers(0, PAGE_SIZE, debouncedSearch || '');
        if (!cancelled && res?.body?.status === 'success') {
          setUsers(res.body.data.users || []);
          setTotalCount(res.body.data.totalCount || 0);
          if (listRef.current) listRef.current.scrollTop = 0;
        }
      } catch (err) {
        console.error('Failed to load authorized users', err);
      } finally {
        if (!cancelled) setLoading(false);
        fetchingRef.current = false;
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, mode, debouncedSearch]);

  // Fetch the next page and append. Guarded so it never overlaps another fetch.
  const loadMoreUsers = async () => {
    if (fetchingRef.current) return;
    if (users.length >= totalCount) return; // nothing more to load
    fetchingRef.current = true;
    setLoadingMore(true);
    try {
      const res = await authorizedUsers(users.length, PAGE_SIZE, debouncedSearch || '');
      if (res?.body?.status === 'success') {
        setUsers((prev) => [...prev, ...(res.body.data.users || [])]);
        setTotalCount(res.body.data.totalCount || 0);
      }
    } catch (err) {
      console.error('Failed to load more authorized users', err);
    } finally {
      setLoadingMore(false);
      fetchingRef.current = false;
    }
  };

  // Trigger a fetch when scrolled near the bottom of the list.
  const handleUserScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) {
      loadMoreUsers();
    }
  };

  if (!folder) return null;

  const selectedUser = users.find((u) => u._id === selectedUserId) || null;

  // Pull the {statusCode, body:{message}} error text out of an axios error.
  const apiError = (err, fallback) =>
    err?.response?.data?.body?.message ||
    err?.response?.data?.message ||
    fallback;

  // Tag the dsId folder to an already-existing authorized user.
  const handleTagExisting = async () => {
    if (!selectedUser || submitting) return;
    setSubmitting(true);
    try {
      const res = await tagFaceImages(folder.dsId, selectedUser._id);
      toast.success(res?.data?.body?.message || 'Folder tagged successfully');
      onTagged();
    } catch (err) {
      console.error('Failed to tag folder', err);
      toast.error(apiError(err, 'Failed to tag folder'));
    } finally {
      setSubmitting(false);
    }
  };

  // Quick-create an authorized user, then tag the folder to them. Only fields
  // the admin actually typed/selected are sent — blanks are omitted so the
  // backend can apply its own defaults.
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const errors = {};
    if (!newFirstName.trim()) errors.firstName = 'First name is required';
    if (!newLastName.trim()) errors.lastName = 'Last name is required';
    setNewUserErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // Required fields.
    const payload = {
      firstName: newFirstName.trim(),
      lastName: newLastName.trim(),
      dsId: folder.dsId,
    };

    // Optional fields — only include when provided.
    if (newEmail.trim()) payload.email = newEmail.trim();
    if (newDesignation.trim()) payload.designation = newDesignation.trim();
    if (newDepartmentId) payload.departmentId = newDepartmentId;

    // Location select stores the location _id; send the name plus the numeric
    // EMP location id (empLocationId) that the backend expects as a Number.
    if (newLocationId) {
      const loc = locations.find((l) => l._id === newLocationId);
      if (loc) {
        payload.location = loc.locationName;
        const numericLocationId = Number(loc.empLocationId);
        if (Number.isFinite(numericLocationId)) {
          payload.locationId = numericLocationId;
        }
      }
    }

    // First 3 folder images become the new user's profile pics. folder.images
    // are already full absolute URLs, which is exactly what profilePics stores.
    const profilePics = (folder.images || []).slice(0, 3);
    if (profilePics.length > 0) payload.profilePics = profilePics;

    setSubmitting(true);
    try {
      const res = await quickCreateFaceUser(payload);
      const newUserId = res?.data?.body?.data?._id;
      if (!newUserId) throw new Error('User created but no id returned');
      await tagFaceImages(folder.dsId, newUserId);
      toast.success(
        res?.data?.body?.message || 'Authorized user created successfully'
      );
      onTagged();
    } catch (err) {
      console.error('Failed to register and tag', err);
      toast.error(apiError(err, 'Failed to register and tag user'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md sm:max-w-xl w-[95vw] p-6 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Save Folder</DialogTitle>
        </DialogHeader>

        {/* <p className="text-xs text-gray-500 -mt-2">
          Link <span className="font-semibold text-gray-700">{folder.dsId}</span> to a user before saving.
        </p> */}

        <div className="flex gap-2 mt-2 mb-1">
          <button
            type="button"
            onClick={() => setMode('existing')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
              mode === 'existing'
                ? 'bg-[#07486A] text-white border-[#07486A]'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Tag Existing User
          </button>
          <button
            type="button"
            onClick={() => setMode('new')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
              mode === 'new'
                ? 'bg-[#07486A] text-white border-[#07486A]'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Register New User
          </button>
        </div>

        {mode === 'existing' ? (
          <>
            <div className="relative mt-1">
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users"
                className="w-full pl-3 pr-9 h-9 text-xs border border-[#C7C7C7] rounded-lg text-[#595959] focus:outline-none focus:ring-1 focus:ring-[#07486A]"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#595959]" />
            </div>

            <div
              ref={listRef}
              onScroll={handleUserScroll}
              className="max-h-64 overflow-y-auto -mx-1 px-1 mt-2 space-y-1"
            >
              {loading ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">
                  No users found.
                </div>
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
                        alt={u.userName}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = getInitialsPlaceholder(u.firstName, u.lastName);
                        }}
                        className="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-gray-200"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-800 truncate">
                          {u.userName || `${u.firstName} ${u.lastName}`}
                        </p>
                        <p className="text-[10px] text-gray-400 truncate">{u.email}</p>
                      </div>
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

            <button
              type="button"
              disabled={!selectedUser || submitting}
              onClick={handleTagExisting}
              className="mt-3 w-full bg-[#07486A] text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Folder
            </button>
          </>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="mt-1 space-y-3">
            <p className="text-xs text-gray-500">
              Register a new user, then this folder will be linked to them automatically.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">
                  First Name<span className="text-red-500">*</span>
                </label>
                <Input
                  autoFocus
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  placeholder="Enter first name"
                  className="h-9 text-xs"
                />
                {newUserErrors.firstName && (
                  <p className="text-[10px] text-red-500 mt-1">{newUserErrors.firstName}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">
                  Last Name<span className="text-red-500">*</span>
                </label>
                <Input
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  placeholder="Enter last name"
                  className="h-9 text-xs"
                />
                {newUserErrors.lastName && (
                  <p className="text-[10px] text-red-500 mt-1">{newUserErrors.lastName}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Email</label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Enter email"
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Designation</label>
                <Input
                  value={newDesignation}
                  onChange={(e) => setNewDesignation(e.target.value)}
                  placeholder="Enter designation"
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Location</label>
                <Select value={newLocationId} onValueChange={setNewLocationId}>
                  <SelectTrigger className="h-9 text-xs bg-white">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {newLocationId && (
                      <button
                        type="button"
                        onClick={() => setNewLocationId('')}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-red-500 hover:bg-gray-50 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                        Clear selection
                      </button>
                    )}
                    {locations.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-gray-400">No options available</div>
                    ) : (
                      locations.map((loc) => (
                        <SelectItem key={loc._id} value={loc._id}>
                          {loc.locationName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Department</label>
                <Select value={newDepartmentId} onValueChange={setNewDepartmentId}>
                  <SelectTrigger className="h-9 text-xs bg-white">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {newDepartmentId && (
                      <button
                        type="button"
                        onClick={() => setNewDepartmentId('')}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-red-500 hover:bg-gray-50 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                        Clear selection
                      </button>
                    )}
                    {departments.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-gray-400">No options available</div>
                    ) : (
                      departments.map((d) => (
                        <SelectItem key={d._id} value={d._id}>
                          {d.departmentName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#07486A] text-white rounded-lg py-2 text-sm font-medium cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Save Folder
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TagFlaggedUserModal;
