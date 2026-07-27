import { useEffect, useRef, useState } from 'react';
import { Search, Plus, X, Eye, EyeOff, Shuffle, Copy, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { useAuth } from '../../../context/AuthContext';
import MultiSelect from '../../../components/MultiSelect';
import DeleteConfirmation from '../../../components/DeleteConfirmation';
import HScrollHint from '../../../components/HScrollHint';
import {
  getUsers, createUser, updateUser, deleteUser, bulkDeleteUsers, getRoles,
  getEmployeeLocations, getNvrsForUserAccess, getChannelsForUserAccess, getDepartmentsForUserAccess,
} from '../../../api/administer';
import { getLocations } from '../../../helpers/monitoring';

// ── helpers ──────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#3b82f6', '#ef4444', '#a855f7',
];

function avatarBg(name) {
  let h = 0;
  for (const c of (name || '')) h = (h * 31 + c.charCodeAt(0)) & 0xff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function getInitials(name) {
  const parts = (name || '?').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

const ROLE_COLORS = {
  'super admin': '#d946ef',
  'site admin': '#a855f7',
  'admin': '#8b5cf6',
  'operator': '#3b82f6',
  'viewer': '#6b7796',
  'write': '#7c3aed',
  'read': '#0ea5e9',
};
const ROLE_FALLBACK_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#a855f7', '#14b8a6', '#f97316',
];
function getRoleColor(roleName) {
  const normalized = (roleName || '').trim().toLowerCase();
  if (!normalized) return '#6366f1';
  if (ROLE_COLORS[normalized]) return ROLE_COLORS[normalized];

  let hash = 0;
  for (const ch of normalized) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return ROLE_FALLBACK_COLORS[hash % ROLE_FALLBACK_COLORS.length];
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Same pattern AlertRecipients.jsx uses, so both forms accept exactly the same
// set of addresses. The input's type="email" only self-validates on native form
// submit — this modal saves via an onClick handler, so nothing was checking it.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function userName(u) {
  const n = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  return n || u.userName || u.username || 'Unknown';
}
function userEmail(u) {
  return u.email || u.userName || u.username || '';
}
function userRoleName(u) {
  return u.roleIds?.roleName || u.role || u.roleName || '';
}
// The API nests failures under body.message (see utils/response.js), so reading
// data.message alone swallowed real errors — e.g. the 409 raised when an email
// already belongs to another user.
function apiError(err, fallback) {
  return err?.response?.data?.body?.message || err?.response?.data?.message || fallback;
}
// Ported exactly from V1's NewPermissionForm.jsx generateStrongPassword() —
// 16 chars, one of each character class guaranteed, then shuffled.
function genPassword() {
  const length = 16;
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const allChars = uppercase + lowercase + numbers + symbols;

  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// ── sub-components ────────────────────────────────────────────────────────────
function FieldLabel({ children }) {
  return <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>{children}</div>;
}

function TextInput({ style, invalid = false, ...props }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      style={{
        width: '100%', height: 38, padding: '0 12px', boxSizing: 'border-box',
        borderRadius: 9, background: 'var(--bg2)',
        border: `1px solid ${invalid ? 'var(--crit)' : 'var(--bd)'}`,
        fontSize: 13, color: 'var(--tx)', outline: 'none',
        ...style,
      }}
    />
  );
}

/** Inline validation message shown under the field it belongs to. */
function FieldError({ children }) {
  if (!children) return null;
  return (
    <div style={{ fontSize: 10.5, color: 'var(--crit)', marginTop: 5, lineHeight: 1.35 }}>
      {children}
    </div>
  );
}

function Checkbox({ checked, onToggle, disabled }) {
  return (
    <span
      onClick={disabled ? undefined : onToggle}
      style={{
        width: 18, height: 18, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1.6px solid ${checked ? 'transparent' : 'var(--bd2)'}`,
        background: checked ? 'linear-gradient(135deg,var(--blue),var(--violet))' : 'var(--bg2)',
        transition: 'all .12s', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </span>
  );
}

// Matches the mockup exactly: checkbox / User Name (avatar+name) / Email / Role badge / Action.
const COL = '44px minmax(160px,1.7fr) minmax(0,1.6fr) 150px 90px';

function ColHeaders({ allChecked, onToggleAll }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: COL,
      padding: '12px 18px', borderBottom: '1px solid var(--bd)',
      fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--tx3)', alignItems: 'center',
    }}>
      <Checkbox checked={allChecked} onToggle={onToggleAll} />
      <span>USER NAME</span>
      <span>EMAIL</span>
      <span>ROLE</span>
      <span style={{ textAlign: 'right' }}>ACTION</span>
    </div>
  );
}

function UserRow({ u, checked, onToggle, onEdit, onDelete, isSelf }) {
  const name = userName(u);
  const email = userEmail(u);
  const role = userRoleName(u);
  const rc = getRoleColor(role);

  return (
    <div
      className="vq-row"
      style={{
        display: 'grid', gridTemplateColumns: COL,
        padding: '12px 18px', borderBottom: '1px solid var(--bd)',
        alignItems: 'center', fontSize: 13, transition: 'background .12s',
      }}
    >
      <Checkbox checked={checked} onToggle={onToggle} disabled={isSelf} />

      <span style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
        <span style={{
          width: 34, height: 34, flexShrink: 0, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: '#fff',
          background: avatarBg(name),
        }}>
          {getInitials(name)}
        </span>
        <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </span>
      </span>

      <span style={{ color: 'var(--tx2)', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {email}
      </span>

      <span>
        {role ? (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 600,
            color: rc, background: hexA(rc, 0.12), border: `1px solid ${hexA(rc, 0.34)}`,
            borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap',
          }}>
            {role}
          </span>
        ) : <span style={{ color: 'var(--tx3)' }}>—</span>}
      </span>

      <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
        {isSelf ? (
          <span title="You cannot edit or delete your own account" style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
            You
          </span>
        ) : (
          <>
            <button
              onClick={() => onEdit(u)}
              title="Edit"
              style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', color: 'var(--tx2)', cursor: 'pointer' }}
            >
              <Pencil size={15} strokeWidth={1.8} />
            </button>
            <button
              onClick={() => onDelete(u)}
              title="Delete"
              style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'var(--bg2)', border: '1px solid rgba(255,77,77,.3)', color: 'var(--crit)', cursor: 'pointer' }}
            >
              <Trash2 size={15} strokeWidth={1.8} />
            </button>
          </>
        )}
      </span>
    </div>
  );
}

// ── Add / Edit user modal (shared) ──────────────────────────────────────────
const ROLE_PANEL_MAX_H = 176;

function RoleSelect({ roles, loading, value, onChange, invalid = false }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const activeLabel = roles.find(r => r._id === value)?.roleName || 'Select role';

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div style={{ position: 'relative' }} ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', boxSizing: 'border-box', height: 38, padding: '0 34px 0 12px', borderRadius: 9,
          background: 'var(--bg2)', border: `1px solid ${invalid ? 'var(--crit)' : 'var(--bd)'}`,
          fontSize: 13, color: value ? 'var(--tx)' : 'var(--tx3)',
          outline: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left',
        }}
      >
        {activeLabel}
        <ChevronDown size={14} style={{ color: 'var(--tx3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {/* Opens downward, anchored to the trigger — both modes now render the
          Camera Access rows below this field, so there is room underneath. */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 50,
          maxHeight: ROLE_PANEL_MAX_H, overflowY: 'auto', background: 'var(--bg1solid)', border: '1px solid var(--bd2)',
          borderRadius: 10, boxShadow: '0 18px 50px rgba(0,0,0,.35)', padding: 5,
        }}>
          {loading ? (
            <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--tx3)' }}>Loading roles…</div>
          ) : roles.map(r => (
            <div
              key={r._id}
              onClick={() => { onChange(r._id); setOpen(false); }}
              style={{
                padding: '8px 10px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer',
                background: value === r._id ? 'var(--blue)' : 'transparent',
                color: value === r._id ? '#fff' : 'var(--tx)',
              }}
            >
              {r.roleName}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserFormModal({ mode, user, roles, rolesLoading, onClose, onSave }) {
  const isEdit = mode === 'edit';
  const initialFirst = isEdit ? (user.firstName || '') : '';
  const initialLast  = isEdit ? (user.lastName || '') : '';

  const [username, setUsername] = useState(isEdit ? (user.userName || user.username || '') : '');
  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName]   = useState(initialLast);
  const [email, setEmail]       = useState(isEdit ? (user.email || userEmail(user)) : '');
  const [roleId, setRoleId]     = useState(isEdit ? (user.roleIds?._id || user.roleIds || '') : '');

  /* Existing camera access for this user. users/fetch joins the authorizedChannels
     doc onto every user, so editing needs no extra request. locations and
     employeeLocations are stored as name strings; nvrIds/departmentIds/channels
     come back populated as objects — normalise both to plain ids. */
  const access = (isEdit ? user?.authorizedChannels : null) || {};
  const toIds = (arr) => (Array.isArray(arr) ? arr : [])
    .map((x) => (x && typeof x === 'object' ? (x._id || x.id) : x))
    .filter(Boolean);

  const [employeeLocations, setEmployeeLocations] = useState(() => toIds(access.employeeLocations));
  const [selectedLocations, setSelectedLocations] = useState(() => toIds(access.locations));
  const [selectedNvrs, setSelectedNvrs] = useState(() => toIds(access.nvrIds));
  const [selectedChannels, setSelectedChannels] = useState(() => toIds(access.channels));
  const [selectedDepartments, setSelectedDepartments] = useState(() => toIds(access.departmentIds));
  // users/fetch returns the password decrypted, so edit prefills it the way V1
  // does. Sending it back unchanged is a no-op: the update endpoint compares
  // against the stored value and skips when they match.
  const [password, setPassword] = useState(isEdit ? (user.password || '') : '');
  const [confirmPassword, setConfirmPassword] = useState(isEdit ? (user.password || '') : '');
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [saving, setSaving]     = useState(false);

  // Field-level validation, shown under each input rather than as toasts — a
  // toast names one problem at a time and vanishes, leaving the user to guess
  // which of eight fields it meant.
  const [errors, setErrors] = useState({});
  // Clears this field's message as soon as the user starts correcting it.
  const bind = (setter, key) => (e) => {
    setter(e.target.value);
    setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const [nvrOptions, setNvrOptions] = useState([]);
  const [channelOptions, setChannelOptions] = useState([]);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [employeeLocationOptions, setEmployeeLocationOptions] = useState([]);
  const [locationOptions, setLocationOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  // Stack the paired fields into a single column on phones so the form never
  // exceeds the viewport width (which was clipping the right-hand fields).
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const gridCols = isMobile ? '1fr' : '1fr 1fr';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [locs, empLocs, nvrs] = await Promise.all([
          getLocations(0, 200),
          getEmployeeLocations(),
          getNvrsForUserAccess([]),
        ]);
        if (cancelled) return;
        setLocationOptions(locs || []);
        setEmployeeLocationOptions(Array.isArray(empLocs) ? empLocs : []);
        setNvrOptions(nvrs || []);
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Location -> NVR -> Channels cascade, and Channels/Employee Access -> Department —
  // ported from V1's NewPermissionForm.jsx handleGetNvrs/handleGetChannels/handleGetDepartments.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nvrs = await getNvrsForUserAccess(selectedLocations);
      if (cancelled) return;
      setNvrOptions(nvrs || []);
      const validNvrIds = new Set((nvrs || []).map(n => n._id));
      const prunedNvrs = selectedNvrs.filter(id => validNvrIds.has(id));
      if (prunedNvrs.length !== selectedNvrs.length) setSelectedNvrs(prunedNvrs);
      const channels = await getChannelsForUserAccess({ selectedLocations, nvrIds: prunedNvrs });
      console.log('channels for user access', channels);
      if (cancelled) return;
      setChannelOptions(channels || []);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocations]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const channels = await getChannelsForUserAccess({ selectedLocations, nvrIds: selectedNvrs });
      if (cancelled) return;
      setChannelOptions(channels || []);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNvrs]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const depts = await getDepartmentsForUserAccess({ channelsIds: selectedChannels, employeeLocations });
      if (cancelled) return;
      setDepartmentOptions(depts || []);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannels, employeeLocations]);

  const handleGeneratePassword = () => {
    const generated = genPassword();
    setPassword(generated);
    setConfirmPassword(generated);
    // Fills both fields at once, so any outstanding password error is resolved.
    setErrors(prev => ({ ...prev, password: undefined, confirmPassword: undefined }));
    sonnerToast.success('Strong password generated successfully!');
  };
  const handleCopyPassword = () => {
    if (!password) return sonnerToast.error('No password to copy. Generate a password first.');
    navigator.clipboard.writeText(password);
    sonnerToast.success('Password copied to clipboard!');
  };

  /* Every required field is checked in one pass so the form can surface all of
     its problems at once, instead of one-at-a-time as each is fixed. */
  const validate = () => {
    const e = {};
    if (!username.trim())  e.username  = 'Admin user name is required';
    if (!firstName.trim()) e.firstName = 'First name is required';
    // Marked required by its label, but neither this form nor the backend
    // enforced it — a blank surname saved silently and the user then rendered
    // with only a first name everywhere userName() is used.
    if (!lastName.trim())  e.lastName  = 'Last name is required';

    if (!email.trim())                     e.email = 'Email is required';
    else if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email address';

    if (!roleId) e.roleId = 'Select a role for this user';

    // Creating always needs a password; editing prefills the existing one and
    // may legitimately be left untouched.
    if (!isEdit && !password) e.password = 'Password is required';
    if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match';

    return e;
  };

  const handleSave = async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      if (isEdit) {
        await onSave({
          userName: username.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          roleIds: roleId ? [roleId] : [],
          // Only send a password when one is present; the server no-ops it when
          // it matches what is already stored.
          ...(password.trim()
            ? { password: password.trim(), confirmPassword: confirmPassword.trim() }
            : {}),
          // Same shape V1's edit sends — without this the access fields would
          // render but silently discard any change on save.
          authorizedChannelsData: {
            employeeLocations: employeeLocations.length ? employeeLocations : undefined,
            locations: selectedLocations,
            nvrIds: selectedNvrs,
            departmentIds: selectedDepartments,
            channelIds: selectedChannels,
          },
        });
      } else {
        await onSave({
          userName: username.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          roleIds: roleId ? [roleId] : [],
          password,
          confirmPassword,
          // V1 always sends this object shape on create — locations/employeeLocations
          // are location NAME strings, nvrIds/channelIds/departmentIds are ObjectIds.
          authorizedChannelsData: {
            employeeLocations: employeeLocations.length ? employeeLocations : undefined,
            locations: selectedLocations,
            nvrIds: selectedNvrs,
            departmentIds: selectedDepartments,
            channelIds: selectedChannels,
          },
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const employeeLocationMultiOptions = employeeLocationOptions.map(l => ({ id: l.locationName || l.name, label: l.locationName || l.name })).filter(o => o.id);
  const locationMultiOptions = locationOptions.map(l => ({ id: l.locationName || l.name, label: l.locationName || l.name })).filter(o => o.id);
  const nvrMultiOptions = nvrOptions.map(n => ({ id: n._id, label: n.nvrName || n.name }));
  // Cameras are listed under their NVR: a non-selectable header row per NVR
  // followed by that NVR's channels — the same grouping V1's NewPermissionForm
  // builds. customName first, matching how Live Wall labels cameras.
  const channelMultiOptions = (() => {
    const groups = new Map();
    channelOptions.forEach((c) => {
      const key = String(c.nvrId ?? '');
      if (!groups.has(key)) groups.set(key, { nvrName: c.nvrName || 'Unknown NVR', channels: [] });
      groups.get(key).channels.push(c);
    });
    const out = [];
    groups.forEach((group, nvrId) => {

      out.push({ id: `nvr-header-${nvrId}`, label: group.nvrName, isHeader: true });
      group.channels.forEach((c) => {
        console.log('channel for user access', c);
        out.push({ id: c._id, label: c.customName || c.name || 'Unnamed Channel' });
      });
    });
    return out;
  })();
  const departmentMultiOptions = departmentOptions.map(d => ({ id: d._id, label: d.departmentName || d.name }));

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: isMobile ? 12 : 20,
    }}>
      {/* Trim matches the Add Notification Recipient modal so both read as one
          system: --bd2 for a border that stays visible against a solid panel,
          and the shared floating-panel shadow. */}
      <div style={{
        background: 'var(--bg1solid)', border: '1px solid var(--bd2)',
        borderRadius: 14, padding: isMobile ? 16 : 24, width: '100%', maxWidth: 640, maxHeight: '88vh', overflowY: 'auto',
        boxShadow: '0 18px 50px rgba(0,0,0,.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>{isEdit ? 'Edit User' : 'Add New User'}</span>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 4 }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginBottom: 16 }}>
          {isEdit ? 'Update user details.' : 'Define user details. All required fields are validated.'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
            <div>
              <FieldLabel>Admin User Name *</FieldLabel>
              <TextInput
                placeholder="Search or type new user…"
                value={username}
                onChange={bind(setUsername, 'username')}
                invalid={!!errors.username}
                autoComplete="off"
              />
              <FieldError>{errors.username}</FieldError>
            </div>
            <div>
              <FieldLabel>Email ID *</FieldLabel>
              <TextInput
                placeholder="Enter email address"
                type="email"
                value={email}
                onChange={bind(setEmail, 'email')}
                invalid={!!errors.email}
                autoComplete="off"
              />
              <FieldError>{errors.email}</FieldError>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
            <div>
              <FieldLabel>First name *</FieldLabel>
              <TextInput
                placeholder="Enter first name"
                value={firstName}
                onChange={bind(setFirstName, 'firstName')}
                invalid={!!errors.firstName}
                autoComplete="off"
              />
              <FieldError>{errors.firstName}</FieldError>
            </div>
            <div>
              <FieldLabel>Last name *</FieldLabel>
              <TextInput
                placeholder="Enter last name"
                value={lastName}
                onChange={bind(setLastName, 'lastName')}
                invalid={!!errors.lastName}
                autoComplete="off"
              />
              <FieldError>{errors.lastName}</FieldError>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--bd)' }} />

          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
            <div>
              <FieldLabel>Assign Role to the user *</FieldLabel>
              <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: -4, marginBottom: 6 }}>Assign the correct role permissions to this user.</div>
              <RoleSelect
                roles={roles}
                loading={rolesLoading}
                value={roleId}
                onChange={(v) => { setRoleId(v); setErrors(prev => (prev.roleId ? { ...prev, roleId: undefined } : prev)); }}
                invalid={!!errors.roleId}
              />
              <FieldError>{errors.roleId}</FieldError>
            </div>
            <div>
              <FieldLabel>Employee Access</FieldLabel>
              <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: -4, marginBottom: 6 }}>Select the employee location access.</div>
              <MultiSelect
                options={employeeLocationMultiOptions}
                value={employeeLocations}
                onChange={setEmployeeLocations}
                placeholder="Select employee access"
                msg="No employee locations found"
              />
            </div>
          </div>

          {/* Camera Access applies to both modes — in edit it arrives prefilled
              from the user's existing authorizedChannels. */}
              <div style={{ height: 1, background: 'var(--bd)' }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>Camera Access</div>

              <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
                <div>
                  <FieldLabel>Location</FieldLabel>
                  <MultiSelect
                    options={locationMultiOptions}
                    value={selectedLocations}
                    onChange={setSelectedLocations}
                    placeholder="Select locations"
                    msg="No locations found"
                  />
                </div>
                <div>
                  <FieldLabel>NVR</FieldLabel>
                  <MultiSelect
                    options={nvrMultiOptions}
                    value={selectedNvrs}
                    onChange={setSelectedNvrs}
                    placeholder="Select NVRs"
                    msg="No NVRs found"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
                <div>
                  <FieldLabel>Channels</FieldLabel>
                  <MultiSelect
                    options={channelMultiOptions}
                    value={selectedChannels}
                    onChange={setSelectedChannels}
                    placeholder="Select channels"
                    searchPlaceholder="Search cameras..."
                    msg="No channels found"
                    openUp
                  />
                </div>
                <div>
                  <FieldLabel>Department</FieldLabel>
                  <MultiSelect
                    options={departmentMultiOptions}
                    value={selectedDepartments}
                    onChange={setSelectedDepartments}
                    placeholder="Select departments"
                    msg="No departments found"
                    openUp
                  />
                </div>
              </div>

              <div style={{ height: 1, background: 'var(--bd)' }} />

              <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
                <div>
                  <FieldLabel>{isEdit ? 'Update password' : 'New password *'}</FieldLabel>
                  <div style={{ position: 'relative' }}>
                    <TextInput
                      placeholder="Enter new password"
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={bind(setPassword, 'password')}
                      invalid={!!errors.password}
                      style={{ paddingRight: 34 }}
                      autoComplete="new-password"
                    />
                    <button
                      onClick={() => setShowPass(v => !v)}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 2 }}
                    >
                      {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <FieldError>{errors.password}</FieldError>
                </div>
                <div>
                  <FieldLabel>{isEdit ? 'Confirm password' : 'Confirm password *'}</FieldLabel>
                  <div style={{ position: 'relative' }}>
                    <TextInput
                      placeholder="Re-enter password"
                      type={showConfirmPass ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={bind(setConfirmPassword, 'confirmPassword')}
                      invalid={!!errors.confirmPassword}
                      style={{ paddingRight: 34 }}
                      autoComplete="new-password"
                    />
                    <button
                      onClick={() => setShowConfirmPass(v => !v)}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 2 }}
                    >
                      {showConfirmPass ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <FieldError>{errors.confirmPassword}</FieldError>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button
                  onClick={handleGeneratePassword}
                  title="Generate strong password"
                  style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'rgba(59,130,246,.1)', border: '1px solid var(--blue)', color: 'var(--blue)', cursor: 'pointer' }}
                >
                  <Shuffle size={14} />
                </button>
                <button
                  onClick={handleCopyPassword}
                  title="Copy password"
                  style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', color: 'var(--tx2)', cursor: 'pointer' }}
                >
                  <Copy size={14} />
                </button>
              </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, height: 38, borderRadius: 9, fontSize: 12.5, fontWeight: 600,
              background: 'var(--bg2)', border: '1px solid var(--bd)',
              cursor: 'pointer', color: 'var(--tx2)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, height: 38, borderRadius: 9, fontSize: 12.5, fontWeight: 600,
              color: '#fff', background: 'linear-gradient(135deg,var(--blue),var(--violet))',
              border: 'none', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add User')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk "Assign Role" trigger + dropdown (selected-users toolbar) ─────────
// Same 5-visible-row scroll behavior as RoleSelect (ROLE_PANEL_MAX_H), just a
// button trigger instead of a form field, since this isn't bound to one user.
function BulkAssignRoleButton({ roles, rolesLoading, disabled, onAssign }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={disabled}
        style={{
          height: 32, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8,
          background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, fontWeight: 500,
          cursor: disabled ? 'default' : 'pointer', color: 'var(--tx)', opacity: disabled ? 0.6 : 1,
        }}
      >
        Assign Role
        <ChevronDown size={13} style={{ color: 'var(--tx3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50, width: 200,
          maxHeight: ROLE_PANEL_MAX_H, overflowY: 'auto', background: 'var(--bg1solid)', border: '1px solid var(--bd2)',
          borderRadius: 10, boxShadow: '0 18px 50px rgba(0,0,0,.35)', padding: 5,
        }}>
          {rolesLoading ? (
            <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--tx3)' }}>Loading roles…</div>
          ) : roles.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--tx3)' }}>No roles found</div>
          ) : roles.map(r => (
            <div
              key={r._id}
              onClick={() => { setOpen(false); onAssign(r); }}
              style={{ padding: '8px 10px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', color: 'var(--tx)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {r.roleName}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { user } = useAuth();
  // A sub-user must never be able to edit/delete their own account here, even
  // if their role has Users edit/delete permission — memberId is the
  // authorizedUsersModel _id baked into their session token at login, which
  // is the same _id each list row carries.
  const myUserId = String(user?.memberId || '');

  const [search, setSearch]       = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef(null);
  const [page, setPage]           = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [editUser, setEditUser]   = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selected, setSelected]   = useState({});
  const [assigningRole, setAssigningRole] = useState(false);
  const LIMIT = 10;

  // Debounce the search box: typing fires a new request per keystroke
  // otherwise, and fast typing can return responses out of order — the
  // debounce plus useApi's own staleness guard keep the list matching what's
  // actually in the box.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const rolesApi     = useApi(() => getRoles({ limit: 100 }), []);
  const usersApi     = useApi(
    () => getUsers({ skip: page * LIMIT, limit: LIMIT, searchQuery: debouncedSearch }),
    [page, debouncedSearch],
  );

  const roles     = rolesApi.data?.roles ?? [];
  const users     = usersApi.data?.users ?? [];
  const total     = usersApi.data?.total ?? 0;
  const pages     = Math.max(1, Math.ceil(total / LIMIT));

  const selectableUsers = users.filter(u => String(u._id) !== myUserId);
  const selCount = Object.values(selected).filter(Boolean).length;
  const allChecked = selectableUsers.length > 0 && selectableUsers.every(u => selected[u._id]);

  const toggleAll = () => {
    const on = !allChecked;
    const next = { ...selected };
    selectableUsers.forEach(u => { next[u._id] = on; });
    setSelected(next);
  };
  const toggleOne = (id) => {
    if (id === myUserId) return;
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreate = async (payload) => {
    try {
      const result = await createUser(payload);
      // The backend returns validation failures as HTTP 200 with
      // body.status: 'failed' (no rejected promise), so a successful POST
      // here does NOT mean the user was actually created — check status.
      if (result?.status && result.status !== 'success') {
        sonnerToast.error(result?.message || 'Failed to register user');
        return;
      }
      sonnerToast.success('User registered successfully');
      setShowAddModal(false);
      usersApi.refetch();
    } catch (err) {
      sonnerToast.error(apiError(err, 'Failed to register user'));
    }
  };

  const handleDelete = async (u) => {
    if (myUserId && String(u?._id) === myUserId) {
      sonnerToast.error('You cannot delete your own account');
      setConfirmDelete(null);
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteUser(u._id);
      // Same as create/edit: some failures return HTTP 200 with
      // body.status: 'failed' rather than a rejected promise.
      if (result?.status && result.status !== 'success') {
        sonnerToast.error(result?.message || 'Failed to remove user');
        return;
      }
      sonnerToast.success(`${userName(u)} removed`);
      usersApi.refetch();
    } catch (err) {
      sonnerToast.error(apiError(err, 'Failed to remove user'));
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Object.keys(selected).filter(id => selected[id] && id !== myUserId);
    if (!ids.length) return;
    setDeleting(true);
    try {
      // Server reports how many documents it actually removed — surface that
      // rather than assuming every selected id matched.
      const result = await bulkDeleteUsers(ids);
      if (result?.status && result.status !== 'success') {
        sonnerToast.error(result?.message || 'Failed to remove users');
        return;
      }
      const removed = result?.deletedCount ?? ids.length;
      sonnerToast.success(`${removed} user${removed === 1 ? '' : 's'} removed`);
      setSelected({});
      usersApi.refetch();
    } catch (err) {
      sonnerToast.error(apiError(err, 'Failed to remove users'));
    } finally {
      setDeleting(false);
      setConfirmBulkDelete(false);
    }
  };

  const handleBulkAssignRole = async (role) => {
    const ids = Object.keys(selected).filter(id => selected[id] && id !== myUserId);
    if (!ids.length) return;
    const targets = users.filter(u => ids.includes(u._id));
    if (!targets.length) return;

    const toIds = (arr) => (Array.isArray(arr) ? arr : [])
      .map((x) => (x && typeof x === 'object' ? (x._id || x.id) : x))
      .filter(Boolean);

    setAssigningRole(true);
    let succeeded = 0;
    let failed = 0;
    try {
      await Promise.all(targets.map(async (u) => {
        const access = u.authorizedChannels || {};
        try {
          // Same full-payload shape UserFormModal's edit save sends — the
          // backend rebuilds every field from the body, so a role-only patch
          // would blank out the rest.
          const result = await updateUser(u._id, {
            userName: u.userName || '',
            firstName: u.firstName || '',
            lastName: u.lastName || '',
            email: u.email || '',
            roleIds: [role._id],
            authorizedChannelsData: {
              employeeLocations: toIds(access.employeeLocations).length ? toIds(access.employeeLocations) : undefined,
              locations: toIds(access.locations),
              nvrIds: toIds(access.nvrIds),
              departmentIds: toIds(access.departmentIds),
              channelIds: toIds(access.channels),
            },
          });
          if (result?.status && result.status !== 'success') {
            failed += 1;
          } else {
            succeeded += 1;
          }
        } catch {
          failed += 1;
        }
      }));

      if (succeeded > 0) {
        sonnerToast.success(
          failed === 0
            ? `${role.roleName} assigned to ${succeeded} user${succeeded === 1 ? '' : 's'}`
            : `${role.roleName} assigned to ${succeeded}, ${failed} failed`
        );
      } else {
        sonnerToast.error(`Failed to assign ${role.roleName} to ${failed} user${failed === 1 ? '' : 's'}`);
      }
      setSelected({});
      usersApi.refetch();
    } finally {
      setAssigningRole(false);
    }
  };

  const handleSaveEdit = async (patch) => {
    if (myUserId && String(editUser?._id) === myUserId) {
      sonnerToast.error('You cannot edit your own account');
      setEditUser(null);
      return;
    }
    try {
      const result = await updateUser(editUser._id, patch);
      // Same as create: some validation failures return HTTP 200 with
      // body.status: 'failed' rather than a rejected promise.
      if (result?.status && result.status !== 'success') {
        sonnerToast.error(result?.message || 'Failed to update user');
        return;
      }
      sonnerToast.success(`${userName(editUser)} updated`);
      setEditUser(null);
      usersApi.refetch();
    } catch (err) {
      sonnerToast.error(apiError(err, 'Failed to update user'));
    }
  };

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 400 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx3)' }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search users by name or email…"
            autoComplete="off"
            style={{
              width: '100%', boxSizing: 'border-box', height: 40, padding: '0 12px 0 36px', borderRadius: 10,
              background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 13, color: 'var(--tx)', outline: 'none',
            }}
          />
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>{total} users</span>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              height: 40, padding: '0 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff',
              background: 'linear-gradient(135deg,var(--blue),var(--violet))', border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(99,102,241,.28)',
            }}
          >
            <Plus size={16} /> Add New User
          </button>
        </div>
      </div>

      {selCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 11,
          background: 'linear-gradient(90deg,rgba(59,130,246,.14),rgba(168,85,247,.10))',
          border: '1px solid rgba(99,102,241,.3)',
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{selCount} selected</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <BulkAssignRoleButton
              roles={roles}
              rolesLoading={rolesApi.loading}
              disabled={assigningRole}
              onAssign={handleBulkAssignRole}
            />
            <button
              onClick={() => setConfirmBulkDelete(true)}
              style={{ height: 32, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.45)', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--crit)' }}
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 15, overflow: 'hidden' }}>
        {/* Horizontal scroll on narrow screens, with edge fades hinting swipeability. */}
        <HScrollHint minWidth={660} fadeColor="var(--bg1)">
          <div>
            <ColHeaders allChecked={allChecked} onToggleAll={toggleAll} />

            <AsyncBoundary
              loading={usersApi.loading}
              error={usersApi.error}
              isEmpty={!usersApi.loading && !usersApi.error && users.length === 0}
              onRetry={usersApi.refetch}
              minH={120}
              emptyLabel={search ? `No users match "${search}".` : 'No users found'}
            >
              {() => users.map(u => (
                <UserRow
                  key={u._id}
                  u={u}
                  checked={!!selected[u._id]}
                  onToggle={() => toggleOne(u._id)}
                  onEdit={setEditUser}
                  onDelete={setConfirmDelete}
                  isSelf={!!myUserId && String(u._id) === myUserId}
                />
              ))}
            </AsyncBoundary>
          </div>
        </HScrollHint>
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 4 }}>
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              style={{
                width: 30, height: 30, borderRadius: 7, fontSize: 12,
                background: page === i ? 'var(--blue)' : 'var(--bg2)',
                color: page === i ? '#fff' : 'var(--tx3)',
                border: `1px solid ${page === i ? 'var(--blue)' : 'var(--bd)'}`,
                cursor: 'pointer',
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {showAddModal && (
        <UserFormModal
          mode="add"
          roles={roles}
          rolesLoading={rolesApi.loading}
          onClose={() => setShowAddModal(false)}
          onSave={handleCreate}
        />
      )}

      {editUser && (
        <UserFormModal
          mode="edit"
          user={editUser}
          roles={roles}
          rolesLoading={rolesApi.loading}
          onClose={() => setEditUser(null)}
          onSave={handleSaveEdit}
        />
      )}

      <DeleteConfirmation
        open={!!confirmDelete}
        icon={<Trash2 className="w-7 h-7 text-[var(--crit)]" />}
        message={
          confirmDelete
            ? <>Are you sure you want to delete "{userName(confirmDelete)}" user?</>
            : 'Are you sure you want to delete this user?'
        }
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => handleDelete(confirmDelete)}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={deleting}
      />

      <DeleteConfirmation
        open={confirmBulkDelete}
        icon={<Trash2 className="w-7 h-7 text-[var(--crit)]" />}
        message={`Are you sure you want to delete ${selCount} selected user${selCount === 1 ? '' : 's'}?`}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={handleBulkDelete}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={deleting}
      />
    </div>
  );
}



