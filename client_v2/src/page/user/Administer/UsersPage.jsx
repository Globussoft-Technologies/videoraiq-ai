import { useState, useRef, useEffect } from 'react';
import { Search, RefreshCw, MoreHorizontal, X, Eye, EyeOff, Shuffle } from 'lucide-react';
import moment from 'moment';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { getUsers, createUser, deleteUser, getRoles } from '../../../helpers/administer';
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
function userStatus(u) {
  const s = (u.status || 'active').toLowerCase();
  if (s === 'invited' || s === 'pending')   return { label: 'Invited',  color: '#f5a623' };
  if (s === 'disabled' || s === 'inactive') return { label: 'Disabled', color: '#6b7796' };
  return { label: 'Active', color: '#22c55e' };
}
function relTime(ts) {
  if (!ts) return '—';
  return moment(ts).fromNow();
}
function genPassword(len = 12) {
  const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefghjkmnpqrstwxyz23456789!@#$';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
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

const COL = 'minmax(150px,1.6fr) 110px minmax(0,1fr) 92px 84px 36px';

function ColHeaders() {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: COL,
      padding: '10px 16px', borderBottom: '1px solid var(--bd)',
      fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--tx3)',
    }}>
      {['USER', 'ROLE', 'SITE ACCESS', 'STATUS', 'LAST ACTIVE', ''].map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </div>
  );
}

function UserRow({ u, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  const name  = userName(u);
  const email = userEmail(u);
  const role  = userRoleName(u);
  const rc    = getRoleColor(role);
  const st    = userStatus(u);
  const rawSites = u.locationIds;
  const sites = Array.isArray(rawSites) && rawSites.length
    ? rawSites.map(l => (l && typeof l === 'object') ? (l.locationName || l.name) : l).filter(Boolean).join(', ')
    : 'All sites';

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: COL,
      padding: '11px 16px', borderBottom: '1px solid var(--bd)',
      alignItems: 'center', fontSize: 12.5,
    }}>
      {/* User */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
        <span style={{
          width: 34, height: 34, flexShrink: 0, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: '#fff',
          background: avatarBg(name),
        }}>
          {getInitials(name)}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--tx3)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {email}
          </span>
        </span>
      </span>

      {/* Role badge */}
      <span>
        {role ? (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600,
            color: rc, border: `1px solid ${rc}`,
            borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap',
          }}>
            {role}
          </span>
        ) : <span style={{ color: 'var(--tx3)' }}>—</span>}
      </span>

      {/* Site Access */}
      <span style={{ color: 'var(--tx2)', fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {sites}
      </span>

      {/* Status */}
      <span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: st.color }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
          {st.label}
        </span>
      </span>

      {/* Last Active */}
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tx3)' }}>
        {relTime(u.lastLogin)}
      </span>

      {/* 3-dot menu */}
      <span style={{ textAlign: 'center', position: 'relative' }} ref={menuRef}>
        <button
          onClick={() => setMenuOpen(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 4, borderRadius: 4 }}
        >
          <MoreHorizontal size={15} />
        </button>
        {menuOpen && (
          <div style={{
            position: 'absolute', right: 0, top: '100%', zIndex: 20,
            background: 'var(--bg1)', border: '1px solid var(--bd)',
            borderRadius: 8, padding: 4, minWidth: 120,
            boxShadow: '0 4px 16px rgba(0,0,0,.4)',
          }}>
            <button
              onClick={() => { setMenuOpen(false); onDelete(u); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '7px 12px', borderRadius: 5, fontSize: 12,
                color: 'var(--err)', background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              Remove user
            </button>
          </div>
        )}
      </span>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  fullName: '', email: '', mobile: '',
  selectedRoleId: '', selectedRoleName: '',
  selectedSites: [], password: '', showPass: false,
};

export default function UsersPage() {
  const [form, setForm]           = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(0);
  const [toast, setToast]         = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const LIMIT = 10;

  const rolesApi     = useApi(() => getRoles({ limit: 100 }), []);
  const locationsApi = useApi(() => getLocations({ limit: 100 }), []);
  const usersApi     = useApi(
    () => getUsers({ skip: page * LIMIT, limit: LIMIT, searchQuery: search }),
    [page, search],
  );

  const roles     = rolesApi.data?.roles ?? [];
  const locations = locationsApi.data ?? [];
  const users     = usersApi.data?.users ?? [];
  const total     = usersApi.data?.total ?? 0;
  const pages     = Math.max(1, Math.ceil(total / LIMIT));

  const activeCount  = users.filter(u => userStatus(u).label === 'Active').length;
  const invitedCount = users.filter(u => userStatus(u).label === 'Invited').length;

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const handleSubmit = async () => {
    if (!form.fullName.trim()) return showToast('Full name is required', 'err');
    if (!form.email.trim())    return showToast('Work email is required', 'err');
    if (!form.password)        return showToast('Temporary password is required', 'err');

    const parts     = form.fullName.trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName  = parts.slice(1).join(' ') || '';

    setSubmitting(true);
    try {
      await createUser({
        userName: form.email.trim(),
        firstName,
        lastName,
        mobileNumber: form.mobile.trim() || undefined,
        roleIds: form.selectedRoleId ? [form.selectedRoleId] : [],
        locationIds: form.selectedSites.length ? form.selectedSites : undefined,
        password: form.password,
        confirmPassword: form.password,
      });
      showToast('User registered — invite sent');
      setForm(EMPTY_FORM);
      usersApi.refetch();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to register user', 'err');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (u) => {
    try {
      await deleteUser(u._id);
      showToast(`${userName(u)} removed`);
      usersApi.refetch();
    } catch {
      showToast('Failed to remove user', 'err');
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Register New User ─────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg1)', border: '1px solid var(--bd)',
        borderRadius: 14, padding: 18,
      }}>
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Register New User</div>
        <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 3, marginBottom: 16 }}>
          Invite a team member and assign role &amp; site access.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px 16px' }}>

          {/* Row 1: identity */}
          <div>
            <FieldLabel>Full Name</FieldLabel>
            <TextInput
              placeholder="e.g. Priya Nair"
              value={form.fullName}
              onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
            />
          </div>
          <div>
            <FieldLabel>Work Email</FieldLabel>
            <TextInput
              placeholder="name@org.com"
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <FieldLabel>Mobile Number</FieldLabel>
            <TextInput
              placeholder="+91 ·····"
              value={form.mobile}
              onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))}
            />
          </div>

          {/* Role pills */}
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldLabel>Role</FieldLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              {rolesApi.loading
                ? <span style={{ fontSize: 11, color: 'var(--tx3)' }}>Loading roles…</span>
                : roles.map(r => {
                  const active = form.selectedRoleId === r._id;
                  return (
                    <button
                      key={r._id}
                      onClick={() => setForm(f => ({ ...f, selectedRoleId: r._id, selectedRoleName: r.roleName }))}
                      style={{
                        flex: 1, textAlign: 'center', padding: '8px 4px',
                        borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                        color: active ? '#fff' : 'var(--tx2)',
                        background: active
                          ? 'linear-gradient(135deg,var(--blue),var(--violet))'
                          : 'var(--bg2)',
                        border: `1px solid ${active ? 'transparent' : 'var(--bd)'}`,
                      }}
                    >
                      {r.roleName}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Site Access chips */}
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldLabel>Site Access</FieldLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {locationsApi.loading
                ? <span style={{ fontSize: 11, color: 'var(--tx3)' }}>Loading sites…</span>
                : locations.map(s => {
                  const id  = s._id || s.id;
                  const on  = form.selectedSites.includes(id);
                  const lbl = s.locationName || s.name || id;
                  return (
                    <button
                      key={id}
                      onClick={() => setForm(f => ({
                        ...f,
                        selectedSites: on
                          ? f.selectedSites.filter(x => x !== id)
                          : [...f.selectedSites, id],
                      }))}
                      style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
                        color: on ? '#fff' : 'var(--tx2)',
                        background: on ? 'rgba(59,130,246,.22)' : 'var(--bg2)',
                        border: `1px solid ${on ? 'var(--blue)' : 'var(--bd)'}`,
                      }}
                    >
                      {lbl}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Temporary Password */}
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldLabel>Temporary Password</FieldLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <TextInput
                  placeholder="Auto-generate or set"
                  type={form.showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                />
                <button
                  onClick={() => setForm(f => ({ ...f, showPass: !f.showPass }))}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 2,
                  }}
                >
                  {form.showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <button
                onClick={() => setForm(f => ({ ...f, password: genPassword(), showPass: true }))}
                style={{
                  height: 38, padding: '0 14px', borderRadius: 9, border: '1px solid var(--bd)',
                  background: 'var(--bg2)', color: 'var(--tx2)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                }}
              >
                <Shuffle size={12} /> Generate
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              gridColumn: '1 / -1', textAlign: 'center', fontSize: 13, fontWeight: 600,
              color: '#fff', background: 'linear-gradient(135deg,var(--blue),var(--violet))',
              borderRadius: 10, padding: 11, cursor: submitting ? 'default' : 'pointer',
              boxShadow: '0 0 16px rgba(99,102,241,.3)', border: 'none',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Registering…' : 'Register & Send Invite'}
          </button>

          {/* Footnote */}
          <div style={{ gridColumn: '1 / -1', fontSize: 10.5, color: 'var(--tx3)', textAlign: 'center', lineHeight: 1.4 }}>
            User receives an email to set their password and enroll their face for recognition.
          </div>
        </div>
      </div>

      {/* ── Users & Roles table ───────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 14, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--bd)' }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Users &amp; Roles</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>
            {activeCount} active · {invitedCount} invited
          </span>
        </div>

        {/* Search + refresh */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--bd)' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={12} style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--tx3)', pointerEvents: 'none',
            }} />
            <input
              placeholder="Search users…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              style={{
                width: '100%', height: 34, padding: '0 10px 0 28px', boxSizing: 'border-box',
                borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)',
                fontSize: 12, color: 'var(--tx)', outline: 'none',
              }}
            />
          </div>
          <button
            onClick={() => usersApi.refetch()}
            title="Refresh"
            style={{
              height: 34, width: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)',
              cursor: 'pointer', color: 'var(--tx3)',
            }}
          >
            <RefreshCw size={12} />
          </button>
        </div>

        {/* Column labels */}
        <ColHeaders />

        {/* Rows */}
        <AsyncBoundary
          loading={usersApi.loading}
          error={usersApi.error}
          isEmpty={!usersApi.loading && !usersApi.error && users.length === 0}
          onRetry={usersApi.refetch}
          minH={120}
          emptyLabel="No users found"
        >
          {() => (
            <>
              {users.map(u => (
                <UserRow key={u._id} u={u} onDelete={setConfirmDelete} />
              ))}
              {pages > 1 && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 16px', borderTop: '1px solid var(--bd)',
                  fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--mono)',
                }}>
                  <span>{total} total</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {Array.from({ length: pages }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => setPage(i)}
                        style={{
                          width: 26, height: 26, borderRadius: 5, fontSize: 11,
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
                </div>
              )}
            </>
          )}
        </AsyncBoundary>
      </div>

      {/* ── Confirm Delete modal ──────────────────────────────────────────── */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
        }}>
          <div style={{
            background: 'var(--bg1)', border: '1px solid var(--bd)',
            borderRadius: 14, padding: 24, width: 340,
            boxShadow: '0 8px 40px rgba(0,0,0,.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Remove User</span>
              <button onClick={() => setConfirmDelete(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 4 }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.5, marginBottom: 18 }}>
              Remove <strong style={{ color: 'var(--tx)' }}>{userName(confirmDelete)}</strong> from the system?
              This action cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  flex: 1, height: 36, borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                  background: 'var(--bg2)', border: '1px solid var(--bd)',
                  cursor: 'pointer', color: 'var(--tx2)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                style={{
                  flex: 1, height: 36, borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                  background: 'rgba(239,68,68,.14)', border: '1px solid rgba(239,68,68,.5)',
                  cursor: 'pointer', color: '#ef4444',
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 24, zIndex: 300,
          background: toast.type === 'err' ? 'rgba(239,68,68,.9)' : 'rgba(34,197,94,.9)',
          color: '#fff', padding: '10px 18px', borderRadius: 9,
          fontSize: 12.5, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,.4)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
