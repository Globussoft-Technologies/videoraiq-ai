import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Search, Loader2, UserPlus, UserCheck, X, ChevronDown, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  authorizedUsers,
  fetchDepartments,
  getEmployeeLocations,
  quickCreateFaceUser,
  tagFaceImages,
} from '../Api';
import { getInitialsPlaceholder, useDebounce } from '../detectedUtils';

const nasUrl = import.meta.env.VITE_BACKEND || '';
const PAGE_SIZE = 20;
const PLACEHOLDER_EMAIL_RE = /^quickcreate\+[a-f0-9]+@placeholder\.local$/i;
const displayEmail = (email) => (PLACEHOLDER_EMAIL_RE.test(email || '') ? '' : (email || ''));

// Shared field styling — matches the V2 register form language (taller fields,
// bg3 surface, blue focus border).
const fieldCls =
  'w-full h-11 px-3 text-sm rounded-[10px] border border-[var(--bd)] bg-[var(--bg3)] text-[var(--tx)] placeholder:text-[var(--tx3)] focus:outline-none focus:border-[var(--blue)] transition-colors';
const labelCls = 'text-xs font-semibold text-[var(--tx2)] mb-1.5 block';

// "Save Folder" flow for a detected-user folder: either link the folder to an
// existing authorized user, or register a brand-new one and link automatically.
const TagFolderModal = ({ open, folder, onClose, onTagged }) => {
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
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    designation: '',
    locationId: '',
    departmentId: '',
    vehicleNumber: '',
  });
  const [errors, setErrors] = useState({});
  const [departments, setDepartments] = useState([]);
  const [locations, setLocations] = useState([]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // Reset everything when the modal closes.
  useEffect(() => {
    if (open) return;
    setMode('existing');
    setSearch('');
    setUsers([]);
    setTotalCount(0);
    setLoadingMore(false);
    setSubmitting(false);
    setSelectedUserId(null);
    setForm({
      firstName: '',
      lastName: '',
      email: '',
      designation: '',
      locationId: '',
      departmentId: '',
      vehicleNumber: '',
    });
    setErrors({});
  }, [open]);

  // Load department + location options lazily when the register tab opens.
  useEffect(() => {
    if (!open || mode !== 'new') return;
    (async () => {
      try {
        const res = await fetchDepartments(0, 100, '');
        setDepartments(res?.data?.body?.data?.data || []);
      } catch (err) {
        console.error('Failed to load departments', err);
      }
    })();
    (async () => {
      try {
        const res = await getEmployeeLocations();
        setLocations(res?.data?.body?.data?.locations || []);
      } catch (err) {
        console.error('Failed to load locations', err);
      }
    })();
  }, [open, mode]);

  // Initial load + reload on search change (resets the list to page 1).
  useEffect(() => {
    if (!open || mode !== 'existing') return;
    let cancelled = false;
    (async () => {
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
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode, debouncedSearch]);

  // Fetch the next page and append. Guarded so it never overlaps another fetch.
  const loadMoreUsers = async () => {
    if (fetchingRef.current || users.length >= totalCount) return;
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

  const handleUserScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) loadMoreUsers();
  };

  if (!open || !folder) return null;

  const selectedUser = users.find((u) => u._id === selectedUserId) || null;

  const apiError = (err, fallback) =>
    err?.response?.data?.body?.message || err?.response?.data?.message || fallback;

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
  // the admin actually typed/selected are sent so the backend applies defaults.
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const nextErrors = {};
    if (!form.firstName.trim()) nextErrors.firstName = 'First name is required';
    if (!form.lastName.trim()) nextErrors.lastName = 'Last name is required';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      dsId: folder.dsId,
    };
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.designation.trim()) payload.designation = form.designation.trim();
    if (form.departmentId) payload.departmentId = form.departmentId;
    if (form.vehicleNumber.trim()) payload.vehicleNumber = form.vehicleNumber.trim();
    if (form.locationId) {
      const loc = locations.find((l) => l._id === form.locationId);
      if (loc) {
        payload.location = loc.locationName;
        const numericLocationId = Number(loc.empLocationId);
        if (Number.isFinite(numericLocationId)) payload.locationId = numericLocationId;
      }
    }
    // First 3 folder images seed the new user's profile pics. Store the RAW
    // RELATIVE paths (the same leading-slash format normal registration stores),
    // NOT the full display URLs — otherwise the value gets double-prefixed and
    // the RegisterUser profile face 404s. Fall back to deriving the relative
    // path from the display URL for older callers that only carry `images`.
    const relPaths =
      folder.rawImages ||
      (folder.images || []).map((u) => u.replace(/^https?:\/\/[^/]+\/api\/v1\/uploads/, ''));
    const profilePics = relPaths.slice(0, 3);
    if (profilePics.length > 0) payload.profilePics = profilePics;

    setSubmitting(true);
    try {
      const res = await quickCreateFaceUser(payload);
      const newUserId = res?.data?.body?.data?._id;
      if (!newUserId) throw new Error('User created but no id returned');
      await tagFaceImages(folder.dsId, newUserId);
      toast.success(res?.data?.body?.message || 'Authorized user created successfully');
      onTagged();
    } catch (err) {
      console.error('Failed to register and tag', err);
      toast.error(apiError(err, 'Failed to register and tag user'));
    } finally {
      setSubmitting(false);
    }
  };

  const tabCls = (active) =>
    `flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
      active
        ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white shadow-sm'
        : 'bg-transparent text-[var(--tx2)] hover:text-[var(--tx)]'
    }`;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !submitting && onClose()}
    >
      <div className="w-full max-w-md sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] shadow-2xl">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--bd)]">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white shadow-sm">
              <Save className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-[var(--tx)] leading-tight">Save Folder</h3>
              <p className="text-[11px] text-[var(--tx3)] leading-tight">Link this folder to an authorized user</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="p-1.5 rounded-lg text-[var(--tx2)] hover:bg-[var(--bg2)] hover:text-[var(--tx)] cursor-pointer transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
        {/* Segmented tab toggle */}
        <div className="flex gap-1 mb-4 p-1 rounded-xl bg-[var(--bg2)] border border-[var(--bd)]">
          <button type="button" onClick={() => setMode('existing')} className={tabCls(mode === 'existing')}>
            <UserCheck className="w-3.5 h-3.5" />
            Tag Existing User
          </button>
          <button type="button" onClick={() => setMode('new')} className={tabCls(mode === 'new')}>
            <UserPlus className="w-3.5 h-3.5" />
            Register New User
          </button>
        </div>

        {mode === 'existing' ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tx3)] pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users"
                className={`${fieldCls} pl-9`}
              />
            </div>

            <div
              ref={listRef}
              onScroll={handleUserScroll}
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
                    u.profilePics && u.profilePics.length > 0
                      ? `${nasUrl}/uploads${u.profilePics[0]}`
                      : getInitialsPlaceholder(u.firstName, u.lastName);
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
                        alt={u.userName}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = getInitialsPlaceholder(u.firstName, u.lastName);
                        }}
                        className="w-9 h-9 rounded-full object-cover object-top shrink-0 ring-1 ring-[var(--bd)]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[var(--tx)] truncate">
                          {u.userName || `${u.firstName} ${u.lastName}`}
                        </p>
                        <p className="text-[10px] text-[var(--tx3)] truncate">{displayEmail(u.email)}</p>
                      </div>
                      {isSelected && (
                        <UserCheck className="w-4 h-4 shrink-0 text-[var(--brand)]" />
                      )}
                    </button>
                  );
                })
              )}

              {loadingMore && !loading && (
                <div className="flex items-center justify-center py-3 text-[var(--tx3)]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={!selectedUser || submitting}
              onClick={handleTagExisting}
              className="mt-4 w-full bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] hover:opacity-95 text-white rounded-[10px] py-2.5 text-sm font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 transition-opacity"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Folder
            </button>
          </>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <p className="text-xs text-[var(--tx2)] bg-[var(--bg2)] border border-[var(--bd)] rounded-lg px-3 py-2 flex items-center gap-2">
              <UserPlus className="w-3.5 h-3.5 shrink-0 text-[var(--brand)]" />
              Register a new user — this folder is linked to them automatically.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  First Name<span className="text-[var(--crit)]"> *</span>
                </label>
                <input
                  autoFocus
                  value={form.firstName}
                  onChange={(e) => setField('firstName', e.target.value)}
                  placeholder="Enter first name"
                  className={fieldCls}
                />
                {errors.firstName && (
                  <p className="text-[11px] text-[var(--crit)] mt-1">{errors.firstName}</p>
                )}
              </div>

              <div>
                <label className={labelCls}>
                  Last Name<span className="text-[var(--crit)]"> *</span>
                </label>
                <input
                  value={form.lastName}
                  onChange={(e) => setField('lastName', e.target.value)}
                  placeholder="Enter last name"
                  className={fieldCls}
                />
                {errors.lastName && (
                  <p className="text-[11px] text-[var(--crit)] mt-1">{errors.lastName}</p>
                )}
              </div>

              <div>
                <label className={labelCls}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  placeholder="Enter email"
                  className={fieldCls}
                />
              </div>

              <div>
                <label className={labelCls}>Designation</label>
                <input
                  value={form.designation}
                  onChange={(e) => setField('designation', e.target.value)}
                  placeholder="Enter designation"
                  className={fieldCls}
                />
              </div>

              <div>
                <label className={labelCls}>Location</label>
                <div className="relative">
                  <select
                    value={form.locationId}
                    onChange={(e) => setField('locationId', e.target.value)}
                    className={`${fieldCls} appearance-none pr-9 cursor-pointer`}
                  >
                    <option value="">Select location</option>
                    {locations.map((loc) => (
                      <option key={loc._id} value={loc._id}>
                        {loc.locationName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tx3)] pointer-events-none" />
                </div>
              </div>

              <div>
                <label className={labelCls}>Department</label>
                <div className="relative">
                  <select
                    value={form.departmentId}
                    onChange={(e) => setField('departmentId', e.target.value)}
                    className={`${fieldCls} appearance-none pr-9 cursor-pointer`}
                  >
                    <option value="">Select department</option>
                    {departments.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.departmentName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tx3)] pointer-events-none" />
                </div>
              </div>

              <div>
                <label className={labelCls}>Vehicle Number</label>
                <input
                  value={form.vehicleNumber}
                  onChange={(e) => setField('vehicleNumber', e.target.value)}
                  placeholder="e.g. KA01AB1234"
                  className={fieldCls}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] hover:opacity-95 text-white rounded-[10px] py-2.5 text-sm font-semibold shadow-sm cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Save Folder
            </button>
          </form>
        )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TagFolderModal;
