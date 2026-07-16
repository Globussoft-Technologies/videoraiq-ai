import { useEffect, useRef, useState } from 'react';
import { Search, Plus, X, Eye, EyeOff, Shuffle, Copy, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
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
  'site admin':  '#a855f7',
  'operator':    '#3b82f6',
  'viewer':      '#6b7796',
};
function getRoleColor(roleName) {
  return ROLE_COLORS[(roleName || '').toLowerCase()] ?? '#6366f1';
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function userName(u) {
  const n = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  return n || u.userName || u.username || 'Unknown';
}
function userEmail(u) {
  return u.userName || u.email || u.username || '';
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

function TextInput({ style, ...props }) {
  return (
    <input
      {...props}
      style={{
        width: '100%', height: 38, padding: '0 12px', boxSizing: 'border-box',
        borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)',
        fontSize: 13, color: 'var(--tx)', outline: 'none',
        ...style,
      }}
    />
  );
}

function Checkbox({ checked, onToggle }) {
  return (
    <span
      onClick={onToggle}
      style={{
        width: 18, height: 18, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1.6px solid ${checked ? 'transparent' : 'var(--bd2)'}`,
        background: checked ? 'linear-gradient(135deg,var(--blue),var(--violet))' : 'var(--bg2)',
        transition: 'all .12s', cursor: 'pointer', flexShrink: 0,
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

function UserRow({ u, checked, onToggle, onEdit, onDelete }) {
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
      <Checkbox checked={checked} onToggle={onToggle} />

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

      <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
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
      </span>
    </div>
  );
}

// ── Add / Edit user modal (shared) ──────────────────────────────────────────
const ROLE_PANEL_MAX_H = 176;

function RoleSelect({ roles, loading, value, onChange }) {
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
          background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 13, color: value ? 'var(--tx)' : 'var(--tx3)',
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

  const [username, setUsername] = useState(isEdit ? userEmail(user) : '');
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
    sonnerToast.success('Strong password generated successfully!');
  };
  const handleCopyPassword = () => {
    if (!password) return sonnerToast.error('No password to copy. Generate a password first.');
    navigator.clipboard.writeText(password);
    sonnerToast.success('Password copied to clipboard!');
  };

  const handleSave = async () => {
    if (!username.trim()) return sonnerToast.error('Username is required');
    if (!firstName.trim()) return sonnerToast.error('First name is required');
    if (!email.trim()) return sonnerToast.error('Email is required');
    if (!isEdit && !password) return sonnerToast.error('Password is required');
    // Editing may leave the password untouched, but if it is edited the two
    // fields still have to agree.
    if (password !== confirmPassword) return sonnerToast.error('Passwords do not match');

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
      <div style={{
        background: 'var(--bg1solid)', border: '1px solid var(--bd)',
        borderRadius: 14, padding: isMobile ? 16 : 24, width: '100%', maxWidth: 640, maxHeight: '88vh', overflowY: 'auto',
        boxShadow: '0 8px 40px rgba(0,0,0,.5)',
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
                onChange={e => setUsername(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Email ID *</FieldLabel>
              <TextInput placeholder="Enter email address" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
            <div>
              <FieldLabel>First name *</FieldLabel>
              <TextInput placeholder="Enter first name" value={firstName} onChange={e => setFirstName(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Last name *</FieldLabel>
              <TextInput placeholder="Enter last name" value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--bd)' }} />

          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
            <div>
              <FieldLabel>Assign Role to the user *</FieldLabel>
              <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: -4, marginBottom: 6 }}>Assign the correct role permissions to this user.</div>
              <RoleSelect roles={roles} loading={rolesLoading} value={roleId} onChange={setRoleId} />
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
                      onChange={e => setPassword(e.target.value)}
                      style={{ paddingRight: 34 }}
                    />
                    <button
                      onClick={() => setShowPass(v => !v)}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 2 }}
                    >
                      {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>
                <div>
                  <FieldLabel>{isEdit ? 'Confirm password' : 'Confirm password *'}</FieldLabel>
                  <div style={{ position: 'relative' }}>
                    <TextInput
                      placeholder="Re-enter password"
                      type={showConfirmPass ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      style={{ paddingRight: 34 }}
                    />
                    <button
                      onClick={() => setShowConfirmPass(v => !v)}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 2 }}
                    >
                      {showConfirmPass ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
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

// ── main page ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [editUser, setEditUser]   = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selected, setSelected]   = useState({});
  const LIMIT = 10;

  const rolesApi     = useApi(() => getRoles({ limit: 100 }), []);
  const usersApi     = useApi(
    () => getUsers({ skip: page * LIMIT, limit: LIMIT, searchQuery: search }),
    [page, search],
  );

  const roles     = rolesApi.data?.roles ?? [];
  const users     = usersApi.data?.users ?? [];
  const total     = usersApi.data?.total ?? 0;
  const pages     = Math.max(1, Math.ceil(total / LIMIT));

  const selCount = Object.values(selected).filter(Boolean).length;
  const allChecked = users.length > 0 && users.every(u => selected[u._id]);

  const toggleAll = () => {
    const on = !allChecked;
    const next = { ...selected };
    users.forEach(u => { next[u._id] = on; });
    setSelected(next);
  };
  const toggleOne = (id) => setSelected(prev => ({ ...prev, [id]: !prev[id] }));

  const handleCreate = async (payload) => {
    try {
      await createUser(payload);
      sonnerToast.success('User registered successfully');
      setShowAddModal(false);
      usersApi.refetch();
    } catch (err) {
      sonnerToast.error(apiError(err, 'Failed to register user'));
    }
  };

  const handleDelete = async (u) => {
    setDeleting(true);
    try {
      await deleteUser(u._id);
      sonnerToast.success(`${userName(u)} removed`);
      usersApi.refetch();
    } catch {
      sonnerToast.error('Failed to remove user');
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Object.keys(selected).filter(id => selected[id]);
    if (!ids.length) return;
    setDeleting(true);
    try {
      // Server reports how many documents it actually removed — surface that
      // rather than assuming every selected id matched.
      const result = await bulkDeleteUsers(ids);
      const removed = result?.deletedCount ?? ids.length;
      sonnerToast.success(`${removed} user${removed === 1 ? '' : 's'} removed`);
      setSelected({});
      usersApi.refetch();
    } catch (err) {
      sonnerToast.error(err?.response?.data?.message || 'Failed to remove users');
    } finally {
      setDeleting(false);
      setConfirmBulkDelete(false);
    }
  };

  const handleSaveEdit = async (patch) => {
    try {
      await updateUser(editUser._id, patch);
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
            <button
              onClick={() => sonnerToast(`Assign role to ${selCount} users`)}
              style={{ height: 32, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, fontWeight: 500, cursor: 'pointer', color: 'var(--tx)' }}
            >
              Assign Role
            </button>
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
