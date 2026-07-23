import { useState } from 'react';
import { Search, Plus, Settings2, Eye, Pencil, Trash2, X, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { usePermissions } from '../../../context/PermissionContext';
import AccessDenied from '../../../components/AccessDenied';
import PageLoader from '../../../components/PageLoader';
import HScrollHint from '../../../components/HScrollHint';
import { getRoles, createRole, renameRole, updateRolePermission, deleteRole, updatePermissionConfig } from '../../../api/administer';

// Role names V1 treats as built-in/protected — Edit and Delete are hidden for
// these (server also 400s a rename attempt on an is_default role; this just
// avoids offering an action that will fail).
const PROTECTED_ROLE_NAMES = new Set(['write', 'admin', 'read']);

// Per-module permission matrix module keys, ported 1:1 from V1's
// server/core/v1/permission/permissions.config.js. `logs` is a nested
// sub-map of its own {view,create,edit,delete} rows.
const PERMISSION_MODULES = [
  'NVR', 'channels', 'LIVE', 'dashboard', 'incidents', 'Users', 'permission',
  'roles', 'departments', 'detectionSettings', 'profiles', 'recipients',
  'locations', 'playbacks',
];
// Every sub-module the backend seeds under permissionConfig.logs (see
// server/core/v1/permission/permissions.config.js's completeConfig.logs) —
// updatePermissions() 400s on any subKey not already present there, so this
// list must stay a superset match of that seed, not just of nav.config.js.
const LOG_SUBMODULES = [
  'global', 'accessLogs', 'attendanceLogs', 'taggedUsersLogs', 'detectedUsersLogs',
  'personCountLogs', 'deskLogs', 'ANPRLogs', 'productivityLogs', 'trackLogs',
  'visibilityLogs', 'guardLogs', 'conveyorLogs', 'vehicleObstructionLogs',
  'vehicleCountLogs', 'crusherLogs', 'lineCrossingLogs', 'waterSpillLogs',
  'unauthorizedAccessLogs',
];

const MODULE_LABELS = {
  NVR: 'NVR', channels: 'Channels', LIVE: 'Live', dashboard: 'Dashboard',
  incidents: 'Incidents', Users: 'Users', permission: 'Permissions', roles: 'Roles',
  departments: 'Departments', detectionSettings: 'Detection Settings', profiles: 'Profiles',
  recipients: 'Recipients', locations: 'Locations', playbacks: 'Playbacks',
  global: 'Global', accessLogs: 'Access Logs', attendanceLogs: 'Attendance Logs',
  taggedUsersLogs: 'Tagged Users', detectedUsersLogs: 'Detected Users',
  personCountLogs: 'Person Count Logs', deskLogs: 'Desk Absence Logs',
  productivityLogs: 'Productivity Logs', trackLogs: 'Track Logs',
  visibilityLogs: 'Visibility Logs', guardLogs: 'Guard Logs', ANPRLogs: 'ANPR Logs',
  conveyorLogs: 'Conveyor Logs', vehicleObstructionLogs: 'Vehicle Obstruction Logs',
  vehicleCountLogs: 'Vehicle Count Logs', crusherLogs: 'Crusher Logs',
  lineCrossingLogs: 'Line Crossing Logs', waterSpillLogs: 'Water Spill Logs',
  unauthorizedAccessLogs: 'Unauthorized Access Logs',
};

function Checkbox({ checked, disabled, onToggle }) {
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

// ── Add / rename role modal ─────────────────────────────────────────────────
function RoleNameModal({ mode, initialName, onClose, onSubmit }) {
  const [name, setName] = useState(initialName || '');
  const [saving, setSaving] = useState(false);
  const isEdit = mode === 'edit';

  const handleSubmit = async () => {
    if (!name.trim()) return toast.error('Role name is required');
    setSaving(true);
    try {
      await onSubmit(name.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg1solid)', border: '1px solid var(--bd)', borderRadius: 14, padding: 24, width: 360,
        boxShadow: '0 8px 40px rgba(0,0,0,.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>{isEdit ? 'Rename Role' : 'Add New Role'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 4 }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>Role Name</div>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Security Supervisor"
          style={{
            width: '100%', boxSizing: 'border-box', height: 38, padding: '0 12px', borderRadius: 9,
            background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 13, color: 'var(--tx)', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, height: 38, borderRadius: 9, fontSize: 12.5, fontWeight: 600, background: 'var(--bg2)', border: '1px solid var(--bd)', cursor: 'pointer', color: 'var(--tx2)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              flex: 1, height: 38, borderRadius: 9, fontSize: 12.5, fontWeight: 600, color: '#fff',
              background: 'linear-gradient(135deg,var(--blue),var(--violet))', border: 'none',
              cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : (isEdit ? 'Save' : 'Add Role')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirmation ──────────────────────────────────────────────────────
function DeleteRoleModal({ role, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const handleConfirm = async () => {
    setDeleting(true);
    try { await onConfirm(); } finally { setDeleting(false); }
  };
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg1solid)', border: '1px solid var(--bd)', borderRadius: 14, padding: 24, width: 380,
        boxShadow: '0 8px 40px rgba(0,0,0,.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Delete Role</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 4 }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.5, marginBottom: 18 }}>
          Delete <strong style={{ color: 'var(--tx)' }}>{role.roleName}</strong>? Any users currently on this role
          will lose their role assignment — they are not moved to a fallback role. This can't be undone.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, height: 36, borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: 'var(--bg2)', border: '1px solid var(--bd)', cursor: 'pointer', color: 'var(--tx2)' }}>
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            style={{ flex: 1, height: 36, borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: 'rgba(239,68,68,.14)', border: '1px solid rgba(239,68,68,.5)', cursor: deleting ? 'default' : 'pointer', color: '#ef4444', opacity: deleting ? 0.7 : 1 }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Configure — granular per-module permission matrix ───────────────────────
function ConfigureModal({ role, readOnly, onClose, onSave }) {
  const initialConfig = role.permissionDetails?.permissionConfig || {};
  const [config, setConfig] = useState(initialConfig);
  const [logsOpen, setLogsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggle = (moduleKey, field, subKey) => {
    if (readOnly) return;
    setConfig(prev => {
      if (subKey) {
        const logs = prev.logs || {};
        const row = logs[subKey] || {};
        return { ...prev, logs: { ...logs, [subKey]: { ...row, [field]: !row[field] } } };
      }
      const row = prev[moduleKey] || {};
      return { ...prev, [moduleKey]: { ...row, [field]: !row[field] } };
    });
  };

  // Select All — turn on view/create/edit/delete for every module + every log
  // sub-module, matching V1's PermissionStep handleSelectAll. `channels`
  // create/delete stay off (those cells are disabled in the matrix).
  const selectAll = () => {
    if (readOnly) return;
    setConfig(prev => {
      const next = { ...prev };
      PERMISSION_MODULES.forEach(m => {
        next[m] = {
          view: true,
          create: m === 'channels' ? false : true,
          edit: true,
          delete: m === 'channels' ? false : true,
        };
      });
      const on = { view: true, create: true, edit: true, delete: true };
      const logs = { ...(prev.logs || {}) };
      LOG_SUBMODULES.forEach(s => { logs[s] = { ...on }; });
      next.logs = logs;
      return next;
    });
  };

  // Clear All — turn everything off (matches V1 handleClearAll).
  const clearAll = () => {
    if (readOnly) return;
    setConfig(prev => {
      const off = { view: false, create: false, edit: false, delete: false };
      const next = { ...prev };
      PERMISSION_MODULES.forEach(m => { next[m] = { ...off }; });
      const logs = { ...(prev.logs || {}) };
      LOG_SUBMODULES.forEach(s => { logs[s] = { ...off }; });
      next.logs = logs;
      return next;
    });
  };

  // `channels` create/delete are always disabled in the matrix (row-level rule),
  // so a column toggle must skip those cells to match what the checkboxes allow.
  const isCellToggleable = (moduleKey, field) =>
    !(moduleKey === 'channels' && (field === 'create' || field === 'delete'));

  // Is every toggleable cell in this column already on? Drives the header's
  // checked indicator and whether a click fills (→all on) or clears the column.
  const isColumnAllOn = (field) => {
    const modsOn = PERMISSION_MODULES.every(
      m => !isCellToggleable(m, field) || config[m]?.[field] === true
    );
    const logsOn = LOG_SUBMODULES.every(s => config.logs?.[s]?.[field] === true);
    return modsOn && logsOn;
  };

  // Column header toggle: if the column isn't fully on, fill every toggleable
  // cell (modules + log sub-modules) on; if already all on, clear the column.
  const toggleColumn = (field) => {
    if (readOnly) return;
    const turnOn = !isColumnAllOn(field);
    setConfig(prev => {
      const next = { ...prev };
      PERMISSION_MODULES.forEach(m => {
        if (!isCellToggleable(m, field)) return;
        next[m] = { ...(prev[m] || {}), [field]: turnOn };
      });
      const logs = { ...(prev.logs || {}) };
      LOG_SUBMODULES.forEach(s => { logs[s] = { ...(logs[s] || {}), [field]: turnOn }; });
      next.logs = logs;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(config);
    } finally {
      setSaving(false);
    }
  };

  const Row = ({ label, row, onToggleField, disableCreate, disableDelete }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4,60px)', alignItems: 'center', padding: '8px 4px', borderBottom: '1px solid var(--bd)' }}>
      <span style={{ fontSize: 12.5 }}>{label}</span>
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox checked={!!row.view} disabled={readOnly} onToggle={() => onToggleField('view')} />
      </span>
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox checked={!!row.create} disabled={readOnly || disableCreate} onToggle={() => onToggleField('create')} />
      </span>
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox checked={!!row.edit} disabled={readOnly} onToggle={() => onToggleField('edit')} />
      </span>
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox checked={!!row.delete} disabled={readOnly || disableDelete} onToggle={() => onToggleField('delete')} />
      </span>
    </div>
  );

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg1solid)', border: '1px solid var(--bd)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 520, boxSizing: 'border-box',
        maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>
            {readOnly ? 'View Permissions' : 'Configure Permissions'} — {role.roleName}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 4 }}>
            <X size={14} />
          </button>
        </div>

        {/* Select All / Clear All — bulk-set every module + log sub-module at
            once (ported from V1's PermissionStep). Hidden in read-only view. */}
        {!readOnly && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              onClick={selectAll}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px',
                borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer',
                background: 'linear-gradient(135deg,var(--blue),var(--violet))', border: 'none',
              }}
            >
              <CheckCheck size={14} /> Select All
            </button>
            <button
              type="button"
              onClick={clearAll}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px',
                borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--tx2)', cursor: 'pointer',
                background: 'var(--bg2)', border: '1px solid var(--bd)',
              }}
            >
              <X size={14} /> Clear All
            </button>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 420 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4,60px)', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.06em', color: 'var(--tx3)', padding: '0 4px 6px', alignItems: 'center' }}>
              <span>MODULE</span>
              {['view', 'create', 'edit', 'delete'].map(field => {
                const allOn = isColumnAllOn(field);
                return (
                  <span
                    key={field}
                    onClick={readOnly ? undefined : () => toggleColumn(field)}
                    title={readOnly ? undefined : `Toggle ${field} for all modules`}
                    style={{
                      textAlign: 'center', cursor: readOnly ? 'default' : 'pointer',
                      userSelect: 'none', color: allOn ? 'var(--blue)' : 'var(--tx3)',
                    }}
                  >
                    {field.toUpperCase()}
                  </span>
                );
              })}
            </div>

            {PERMISSION_MODULES.map(mod => (
              <Row
                key={mod}
                label={MODULE_LABELS[mod] || mod}
                row={config[mod] || {}}
                disableCreate={mod === 'channels'}
                disableDelete={mod === 'channels'}
                onToggleField={(field) => toggle(mod, field)}
              />
            ))}

            <div
              onClick={() => setLogsOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 4px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--tx2)' }}
            >
              {logsOpen ? '▾' : '▸'} Logs ({LOG_SUBMODULES.length} sub-modules)
            </div>
            {logsOpen && LOG_SUBMODULES.map(sub => (
              <Row
                key={sub}
                label={MODULE_LABELS[sub] || sub}
                row={(config.logs || {})[sub] || {}}
                onToggleField={(field) => toggle('logs', field, sub)}
              />
            ))}
          </div>
        </div>

        {!readOnly && (
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button onClick={onClose} style={{ flex: 1, height: 38, borderRadius: 9, fontSize: 12.5, fontWeight: 600, background: 'var(--bg2)', border: '1px solid var(--bd)', cursor: 'pointer', color: 'var(--tx2)' }}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 1, height: 38, borderRadius: 9, fontSize: 12.5, fontWeight: 600, color: '#fff',
                background: 'linear-gradient(135deg,var(--blue),var(--violet))', border: 'none',
                cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RoleRow({ role, perms, onToggleField, onConfigure, onView, onEdit, onDelete }) {
  const protectedRole = PROTECTED_ROLE_NAMES.has((role.roleName || '').toLowerCase());
  const noActions = !perms.canConfigure && !perms.canView && !(perms.canEditRole && !protectedRole) && !(perms.canDeleteRole && !protectedRole);
  return (
    <div
      className="vq-row"
      style={{
        display: 'grid', gridTemplateColumns: 'minmax(200px,1.7fr) repeat(4,90px) 110px',
        gap: 0, padding: '12px 18px', borderBottom: '1px solid var(--bd)',
        alignItems: 'center', fontSize: 13, transition: 'background .12s',
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ fontWeight: 600, display: 'block' }}>{role.roleName}</span>
        {role.is_default && (
          <span style={{ fontSize: 10.5, color: 'var(--tx3)', display: 'block' }}>Default role</span>
        )}
      </span>

      {/* The 4 inline flags are edited through the same roles.edit grant as the
          Edit action (V1 leaves these always-interactive regardless of the
          viewer's own permission — an oversight, not something to replicate). */}
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox checked={!!role.view} disabled={!perms.canEditRole} onToggle={() => onToggleField('view')} />
      </span>
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox checked={!!role.create} disabled={!perms.canEditRole} onToggle={() => onToggleField('create')} />
      </span>
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox checked={!!role.edit} disabled={!perms.canEditRole} onToggle={() => onToggleField('edit')} />
      </span>
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox checked={!!role.delete} disabled={!perms.canEditRole} onToggle={() => onToggleField('delete')} />
      </span>

      <span style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', color: 'var(--tx3)' }}>
        {noActions && <span style={{ fontSize: 11 }}>—</span>}
        {perms.canConfigure && (
          <button
            onClick={onConfigure}
            title="Configure"
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: 'var(--bg2)', border: '1px solid var(--bd)', color: 'inherit', cursor: 'pointer' }}
          >
            <Settings2 size={14} strokeWidth={1.7} />
          </button>
        )}
        {perms.canView && (
          <button
            onClick={onView}
            title="View"
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: 'var(--bg2)', border: '1px solid var(--bd)', color: 'inherit', cursor: 'pointer' }}
          >
            <Eye size={14} strokeWidth={1.7} />
          </button>
        )}
        {!protectedRole && perms.canEditRole && (
          <button
            onClick={onEdit}
            title="Edit"
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: 'var(--bg2)', border: '1px solid var(--bd)', color: 'var(--blue)', cursor: 'pointer' }}
          >
            <Pencil size={14} strokeWidth={1.8} />
          </button>
        )}
        {!protectedRole && perms.canDeleteRole && (
          <button
            onClick={onDelete}
            title="Delete"
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: 'var(--bg2)', border: '1px solid rgba(255,77,77,.3)', color: 'var(--crit)', cursor: 'pointer' }}
          >
            <Trash2 size={14} strokeWidth={1.8} />
          </button>
        )}
      </span>
    </div>
  );
}

const LIMIT = 12;

export default function RolesPermission() {
  const { permissions, loading: permissionsLoading } = usePermissions();
  const canViewRole = permissions?.roles?.view;
  const canCreateRole = permissions?.roles?.create;
  const canEditRole = permissions?.roles?.edit;
  const canDeleteRole = permissions?.roles?.delete;
  const canConfigure = permissions?.permission?.edit;
  const canView = permissions?.permission?.view;

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [configureTarget, setConfigureTarget] = useState(null); // { role, readOnly }

  const rolesApi = useApi(
    () => getRoles({ skip: page * LIMIT, limit: LIMIT, searchQuery: search }),
    [page, search],
    { enabled: !!canViewRole },
  );
  const roles = rolesApi.data?.roles ?? [];
  const total = rolesApi.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  // Toggling a row flag (view/create/edit/delete) cascades server-side into
  // EVERY module + log sub-module of the role's permissionConfig (see
  // roles.service.js update). We optimistically flip the row for instant
  // feedback, then refetch so the freshly-cascaded permissionConfig is what the
  // Configure modal reads — otherwise it opens with the stale pre-cascade config
  // and the checkboxes look empty. Rolls back the row if the request fails.
  const handleToggleField = async (role, field) => {
    const next = !role[field];
    rolesApi.setData(prev => ({
      ...prev,
      roles: (prev?.roles ?? []).map(r => (r._id === role._id ? { ...r, [field]: next } : r)),
    }));
    try {
      await updateRolePermission(role._id, field, next);
      // Silent: pull the freshly-cascaded permissionConfig without a full-table
      // spinner (the row already shows the new flag optimistically).
      rolesApi.refetch({ silent: true });
    } catch (err) {
      rolesApi.setData(prev => ({
        ...prev,
        roles: (prev?.roles ?? []).map(r => (r._id === role._id ? { ...r, [field]: role[field] } : r)),
      }));
      toast.error(err?.response?.data?.body?.message || 'Failed to update permission');
    }
  };

  const handleAddRole = async (name) => {
    try {
      await createRole(name);
      toast.success('Role created');
      setShowAddModal(false);
      rolesApi.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to create role');
    }
  };

  const handleRename = async (name) => {
    try {
      await renameRole(renameTarget._id, name);
      toast.success('Role renamed');
      setRenameTarget(null);
      rolesApi.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to rename role');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteRole(deleteTarget._id);
      toast.success('Role deleted');
      setDeleteTarget(null);
      rolesApi.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to delete role');
    }
  };

  const handleSaveConfig = async (permissionConfig) => {
    try {
      await updatePermissionConfig(configureTarget.role.permissionDetails?._id, permissionConfig);
      toast.success('Permissions updated');
      setConfigureTarget(null);
      rolesApi.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to update permissions');
    }
  };

  if (permissionsLoading) return <PageLoader />;
  if (!canViewRole) {
    return <AccessDenied message="You don't have permission to view Roles." />;
  }

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 400 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx3)' }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search roles…"
            style={{
              width: '100%', boxSizing: 'border-box', height: 40, padding: '0 12px 0 36px', borderRadius: 10,
              background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 13, color: 'var(--tx)', outline: 'none',
            }}
          />
        </div>

        {canCreateRole && (
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7,
              height: 40, padding: '0 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff',
              background: 'linear-gradient(135deg,var(--blue),var(--violet))', border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(99,102,241,.28)',
            }}
          >
            <Plus size={16} /> Add New Role
          </button>
        )}
      </div>

      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 15, overflow: 'hidden' }}>
        {/* Horizontal scroll on narrow screens, with edge fades hinting swipeability. */}
        <HScrollHint minWidth={700} fadeColor="var(--bg1)">
          <div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'minmax(200px,1.7fr) repeat(4,90px) 110px',
              gap: 0, padding: '12px 18px', borderBottom: '1px solid var(--bd)',
              fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--tx3)', alignItems: 'center',
            }}>
              <span>ROLE NAME</span>
              <span style={{ textAlign: 'center' }}>VIEW</span>
              <span style={{ textAlign: 'center' }}>CREATE</span>
              <span style={{ textAlign: 'center' }}>EDIT</span>
              <span style={{ textAlign: 'center' }}>DELETE</span>
              <span style={{ textAlign: 'right' }}>ACTION</span>
            </div>

            <AsyncBoundary
              loading={rolesApi.loading}
              error={rolesApi.error}
              isEmpty={!rolesApi.loading && !rolesApi.error && roles.length === 0}
              onRetry={rolesApi.refetch}
              minH={160}
              emptyLabel={search ? `No roles match "${search}".` : 'No roles yet'}
            >
              {() => roles.map(role => (
                <RoleRow
                  key={role._id}
                  role={role}
                  perms={{ canConfigure, canView, canEditRole, canDeleteRole }}
                  onToggleField={(field) => handleToggleField(role, field)}
                  onConfigure={() => setConfigureTarget({ role, readOnly: false })}
                  onView={() => setConfigureTarget({ role, readOnly: true })}
                  onEdit={() => setRenameTarget(role)}
                  onDelete={() => setDeleteTarget(role)}
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
        <RoleNameModal mode="add" onClose={() => setShowAddModal(false)} onSubmit={handleAddRole} />
      )}
      {renameTarget && (
        <RoleNameModal
          mode="edit"
          initialName={renameTarget.roleName}
          onClose={() => setRenameTarget(null)}
          onSubmit={handleRename}
        />
      )}
      {deleteTarget && (
        <DeleteRoleModal role={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
      )}
      {configureTarget && (
        <ConfigureModal
          role={configureTarget.role}
          readOnly={configureTarget.readOnly}
          onClose={() => setConfigureTarget(null)}
          onSave={handleSaveConfig}
        />
      )}
    </div>
  );
}
