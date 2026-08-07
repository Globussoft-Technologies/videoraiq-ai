import { useState, useMemo } from 'react';
import { Search, Plus, Settings2, Eye, Pencil, Trash2, X, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { usePermissions } from '../../../context/PermissionContext';
import { useAuth } from '../../../context/AuthContext';
import AccessDenied from '../../../components/AccessDenied';
import PageLoader from '../../../components/PageLoader';
import HScrollHint from '../../../components/HScrollHint';
import { getRoles, createRole, renameRole, updateRolePermission, deleteRole, updatePermissionConfig } from '../../../api/administer';

// Per-module permission matrix module keys, ported 1:1 from V1's
// server/core/v1/permission/permissions.config.js. `logs` is a nested
// sub-map of its own {view,create,edit,delete} rows.
// 'permission' is intentionally excluded from this list — it's hidden from
// the Configure/View Permissions matrix (product decision). It still exists
// in the backend's permissionConfig and is still what gates this whole page
// (see canConfigure/canView below, which read permissions.permission.edit/
// view directly from the viewer's own permission object) — only the row in
// this editable matrix is hidden, nothing about the underlying enforcement.
const PERMISSION_MODULES = [
  'NVR', 'channels', 'LIVE', 'dashboard', 'alerts', 'analytics', 'incidents', 'Users',
  'roles', 'settings', 'departments', 'detectionSettings', 'profiles', 'recipients',
  'locations', 'playbacks',
];
// Every sub-module the backend seeds under permissionConfig.logs (see
// server/core/v1/permission/permissions.config.js's completeConfig.logs) —
// updatePermissions() 400s on any subKey not already present there, so this
// list must stay a superset match of that seed, not just of nav.config.js.
const LOG_SUBMODULES = [
  'global', 'accessLogs', 'attendanceLogs', 'taggedUsersLogs', 'detectedUsersLogs',
  'personCountLogs', 'deskLogs', 'ANPRLogs',
  // 'productivityLogs',
  'trackLogs',
  'visibilityLogs', 'guardLogs', 'conveyorLogs', 'vehicleObstructionLogs',
  'vehicleCountLogs', 'crusherLogs', 'lineCrossingLogs', 'waterSpillLogs',
  'unauthorizedAccessLogs',
];

const MODULE_LABELS = {
  NVR: 'Cameras & NVRs', channels: 'Channels', LIVE: 'Live Wall', dashboard: 'Command Center',
  alerts: 'Alerts', analytics: 'Analytics',
  incidents: 'Incident Center', Users: 'Users', permission: 'Permissions', roles: 'Roles', settings: 'Settings',
  departments: 'Departments', detectionSettings: 'Detection Settings', profiles: 'Profiles',
  recipients: 'Alert Recipients', locations: 'Locations', playbacks: 'Playbacks',
  global: 'Global', accessLogs: 'Access Logs', attendanceLogs: 'Attendance Logs',
  taggedUsersLogs: 'Tagged Users', detectedUsersLogs: 'Detected Users',
  personCountLogs: 'Person Count Logs', deskLogs: 'Desk Absence Logs',
  // productivityLogs: 'Productivity Logs',
  trackLogs: 'Track Logs',
  visibilityLogs: 'Visibility Logs', guardLogs: 'Guard Logs', ANPRLogs: 'ANPR Logs',
  conveyorLogs: 'Conveyor Logs', vehicleObstructionLogs: 'Vehicle Obstruction Logs',
  vehicleCountLogs: 'Vehicle Count Logs', crusherLogs: 'Crusher Logs',
  lineCrossingLogs: 'Line Crossing Logs', waterSpillLogs: 'Water Spill Logs',
  unauthorizedAccessLogs: 'Unauthorized Access Logs',
};

const LEGACY_SETTINGS_BY_ROLE = {
  admin: { view: true, create: true, edit: true, delete: true },
  read: { view: true, create: false, edit: false, delete: false },
  write: { view: true, create: true, edit: true, delete: false },
};
const SETTINGS_DENIED = { view: false, create: false, edit: false, delete: false };

function permissionConfigForRole(role) {
  const stored = role.permissionDetails?.permissionConfig || {};
  if (stored.settings) return stored;
  const roleName = String(role.roleName || '').toLowerCase();
  return {
    ...stored,
    settings: { ...(LEGACY_SETTINGS_BY_ROLE[roleName] || SETTINGS_DENIED) },
  };
}

const ROLE_NAME_MAX_LENGTH = 40;

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

// Hoisted to module scope (not declared inside ConfigureModal) — a component
// function redefined on every parent render gets a new identity each time, so
// React unmounts/remounts this whole subtree on every keystroke/click instead
// of just updating it. That remount could swallow the very click that
// triggered it, which was why Create/Edit/Delete looked "stuck" even after
// View was already checked.
function ConfigureRow({ label, row, onToggleField, readOnly, requiresLabel, requiresMet }) {
  // create/edit/delete require view. Rather than blocking the click with a
  // toast, turning one of them on auto-enables view alongside it — the same
  // outcome the admin was being asked to go do manually. The cross-module
  // dependency (e.g. Channels needs Cameras & NVRs' View first, since channels
  // belong to an NVR) still can't be auto-resolved here — that lives on a
  // different row — so it still blocks with an explanatory toast.
  const guardedToggle = (field) => {
    if (requiresLabel && !requiresMet) {
      toast.error(`Enable "${requiresLabel}" View first — this module depends on it.`);
      return;
    }
    onToggleField(field);
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4,72px)', alignItems: 'center', padding: '9px 4px', borderBottom: '1px solid var(--bd)' }}>
      <span style={{ fontSize: 12.5 }}>{label}</span>
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox checked={!!row.view} disabled={readOnly} onToggle={() => guardedToggle('view')} />
      </span>
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox checked={!!row.create} disabled={readOnly} onToggle={() => guardedToggle('create')} />
      </span>
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox checked={!!row.edit} disabled={readOnly} onToggle={() => guardedToggle('edit')} />
      </span>
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox checked={!!row.delete} disabled={readOnly} onToggle={() => guardedToggle('delete')} />
      </span>
    </div>
  );
}

// ── Add / rename role modal ─────────────────────────────────────────────────
function RoleNameModal({ mode, initialName, onClose, onSubmit }) {
  const [name, setName] = useState(initialName || '');
  const [saving, setSaving] = useState(false);
  const isEdit = mode === 'edit';

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return toast.error('Role name is required');
    if (trimmedName.length > ROLE_NAME_MAX_LENGTH) {
      return toast.error(`Role name cannot exceed ${ROLE_NAME_MAX_LENGTH} characters`);
    }
    setSaving(true);
    try {
      await onSubmit(trimmedName);
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
          maxLength={ROLE_NAME_MAX_LENGTH}
          placeholder="e.g. Security Supervisor"
          style={{
            width: '100%', boxSizing: 'border-box', height: 38, padding: '0 12px', borderRadius: 9,
            background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 13, color: 'var(--tx)', outline: 'none',
          }}
        />
        <div style={{ marginTop: 5, textAlign: 'right', fontSize: 10.5, color: 'var(--tx3)' }}>
          {Math.min(name.length, ROLE_NAME_MAX_LENGTH)}/{ROLE_NAME_MAX_LENGTH}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
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
function ConfigureModal({ role, readOnly, onClose, onSave, requireConfig }) {
  const initialConfig = permissionConfigForRole(role);
  const [config, setConfig] = useState(initialConfig);
  const [logsOpen, setLogsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // create/edit/delete are meaningless without view — you can't create,
  // edit, or delete something you can't see. So: (a) turning view OFF clears
  // create/edit/delete on the same row along with it, and (b) turning
  // create/edit/delete ON while view is off auto-enables view alongside it,
  // instead of requiring the admin to go check View first themselves.
  const toggle = (moduleKey, field, subKey) => {
    if (readOnly) return;
    setConfig(prev => {
      // Channels belong to an NVR — no NVR access, no channel access either.
      if (moduleKey === 'channels' && prev.NVR?.view !== true) return prev;
      const logs = prev.logs || {};
      const row = subKey ? (logs[subKey] || {}) : (prev[moduleKey] || {});
      const turningOn = !row[field];
      const nextRow = field === 'view' && row.view
        ? { view: false, create: false, edit: false, delete: false }
        : { ...row, [field]: !row[field], ...(field !== 'view' && turningOn ? { view: true } : {}) };
      if (subKey) {
        return { ...prev, logs: { ...logs, [subKey]: nextRow } };
      }
      const next = { ...prev, [moduleKey]: nextRow };
      // Turning off NVR's view removes what Channels depends on — clear it
      // along with NVR instead of leaving an unreachable Channels grant.
      if (moduleKey === 'NVR' && field === 'view' && !nextRow.view) {
        next.channels = { view: false, create: false, edit: false, delete: false };
      }
      return next;
    });
  };

  // Select All — turn on view/create/edit/delete for every module + every log
  // sub-module, matching V1's PermissionStep handleSelectAll.
  const selectAll = () => {
    if (readOnly) return;
    setConfig(prev => {
      const on = { view: true, create: true, edit: true, delete: true };
      const next = { ...prev };
      PERMISSION_MODULES.forEach(m => { next[m] = { ...on }; });
      const logs = { ...(prev.logs || {}) };
      LOG_SUBMODULES.forEach(s => { logs[s] = { ...on }; });
      next.logs = logs;
      return next;
    });
  };

  // Clear All — turn everything off (matches V1 handleClearAll). Saving with
  // no `view` flag on anywhere is blocked in handleSave, so warn here too
  // since Clear All is the action that most directly leads there.
  const clearAll = () => {
    if (readOnly) return;
    toast.warning('All permissions cleared. Select at least one "View" before saving.');
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

  // Is every cell in this column already on? Drives the header's checked
  // indicator and whether a click fills (→all on) or clears the column.
  const isColumnAllOn = (field) => {
    const modsOn = PERMISSION_MODULES.every(m => config[m]?.[field] === true);
    const logsOn = LOG_SUBMODULES.every(s => config.logs?.[s]?.[field] === true);
    return modsOn && logsOn;
  };

  // Column header toggle: if the column isn't fully on, fill every cell
  // (modules + log sub-modules) on; if already all on, clear the column.
  // Turning a non-view column on forces that row's view on too (create/edit/
  // delete require view — see toggle()); turning view off clears the row's
  // create/edit/delete along with it, same as the single-cell rule.
  const toggleColumn = (field) => {
    if (readOnly) return;
    const turnOn = !isColumnAllOn(field);
    const applyRow = (row) => {
      if (field === 'view') {
        return turnOn ? { ...row, view: true } : { view: false, create: false, edit: false, delete: false };
      }
      return turnOn ? { ...row, view: true, [field]: true } : { ...row, [field]: false };
    };
    setConfig(prev => {
      const next = { ...prev };
      PERMISSION_MODULES.forEach(m => { next[m] = applyRow(prev[m] || {}); });
      const logs = { ...(prev.logs || {}) };
      LOG_SUBMODULES.forEach(s => { logs[s] = applyRow(logs[s] || {}); });
      next.logs = logs;
      return next;
    });
  };

  // Is every log sub-module already on for this field? Drives the Logs group
  // header's own checkbox state, independent of the top table's columns.
  const isLogsFieldAllOn = (field) =>
    LOG_SUBMODULES.every(s => config.logs?.[s]?.[field] === true);

  // Logs group header checkbox: applies the field to all 19 sub-modules at
  // once, so a reviewer doesn't have to expand the list and click each row.
  // Same view-required rule as toggleColumn: a non-view field forces view on
  // too; turning view off clears create/edit/delete on every sub-module.
  const toggleLogsField = (field) => {
    if (readOnly) return;
    const turnOn = !isLogsFieldAllOn(field);
    setConfig(prev => {
      const logs = { ...(prev.logs || {}) };
      LOG_SUBMODULES.forEach(s => {
        const row = logs[s] || {};
        logs[s] = field === 'view'
          ? (turnOn ? { ...row, view: true } : { view: false, create: false, edit: false, delete: false })
          : (turnOn ? { ...row, view: true, [field]: true } : { ...row, [field]: false });
      });
      return { ...prev, logs };
    });
  };

  // Sidebar.jsx (isItemVisible) gates every nav item purely on a module's
  // `view` flag — create/edit/delete never make anything visible on their
  // own. So requiring "any flag anywhere" isn't enough: a role with only
  // create/edit/delete true and every view false still renders a fully empty
  // sidebar. Require `view` specifically to be true on at least one module or
  // log sub-module before allowing Save.
  const hasAnyViewPermission = () => {
    const modsHaveView = PERMISSION_MODULES.some(m => config[m]?.view === true);
    if (modsHaveView) return true;
    return LOG_SUBMODULES.some(s => config.logs?.[s]?.view === true);
  };

  // A just-created role starts fully empty (server default) — invisible-app
  // territory. requireConfig (set only for that auto-opened flow, not the
  // regular Configure/Edit entry point) keeps this modal from being dismissed
  // via Cancel/X/backdrop until at least one "View" is picked, instead of
  // letting the admin walk away from an unusable role by accident.
  const handleCloseAttempt = () => {
    if (requireConfig && !hasAnyViewPermission()) {
      toast.error('Select at least one "View" permission before closing — this role has no access yet.');
      return;
    }
    onClose();
  };

  const handleSave = async () => {
    if (!hasAnyViewPermission()) {
      toast.error('Select at least one "View" permission before saving.');
      return;
    }
    setSaving(true);
    try {
      await onSave(config);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={handleCloseAttempt} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg1solid)', border: '1px solid var(--bd)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 580, boxSizing: 'border-box',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flex: '0 0 auto' }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {readOnly ? 'View Permissions' : 'Configure Permissions'} — {role.roleName}
          </span>
          <button onClick={handleCloseAttempt} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx3)', padding: 4 }}>
            <X size={14} />
          </button>
        </div>

        {/* Select All / Clear All — bulk-set every module + log sub-module at
            once (ported from V1's PermissionStep). Hidden in read-only view. */}
        {!readOnly && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12, flex: '0 0 auto' }}>
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

        <div className="vq-scroll" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'auto' }}>
          <div style={{ minWidth: 480 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4,72px)', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.06em', color: 'var(--tx3)', padding: '0 4px 6px', alignItems: 'center' }}>
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
              <ConfigureRow
                key={mod}
                label={MODULE_LABELS[mod] || mod}
                row={config[mod] || {}}
                onToggleField={(field) => toggle(mod, field)}
                readOnly={readOnly}
                requiresLabel={mod === 'channels' ? MODULE_LABELS.NVR : undefined}
                requiresMet={mod === 'channels' ? config.NVR?.view === true : true}
              />
            ))}

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr repeat(4,72px)', alignItems: 'center',
              padding: '9px 4px', margin: '4px 0', borderRadius: 8, background: 'var(--bg2)',
            }}>
              <span
                onClick={() => setLogsOpen(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--tx)' }}
              >
                {logsOpen ? '▾' : '▸'} Logs ({LOG_SUBMODULES.length} sub-modules)
              </span>
              {['view', 'create', 'edit', 'delete'].map(field => (
                <span key={field} style={{ display: 'flex', justifyContent: 'center' }}>
                  <Checkbox
                    checked={isLogsFieldAllOn(field)}
                    disabled={readOnly}
                    onToggle={() => toggleLogsField(field)}
                  />
                </span>
              ))}
            </div>
            {logsOpen && LOG_SUBMODULES.filter(sub => sub !== 'global').map(sub => (
              <ConfigureRow
                key={sub}
                label={MODULE_LABELS[sub] || sub}
                row={(config.logs || {})[sub] || {}}
                onToggleField={(field) => toggle('logs', field, sub)}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>

        {!readOnly && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--bd)', flex: '0 0 auto' }}>
            <button onClick={handleCloseAttempt} style={{ flex: 1, height: 38, borderRadius: 9, fontSize: 12.5, fontWeight: 600, background: 'var(--bg2)', border: '1px solid var(--bd)', cursor: 'pointer', color: 'var(--tx2)' }}>
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

function RoleRow({ role, perms, isOwnRole, onToggleField, onConfigure, onView, onEdit, onDelete }) {
  const config = useMemo(() => permissionConfigForRole(role), [role]);
  
  const hasView = PERMISSION_MODULES.some(m => config[m]?.view) || LOG_SUBMODULES.some(s => config.logs?.[s]?.view);
  const hasCreate = PERMISSION_MODULES.some(m => config[m]?.create) || LOG_SUBMODULES.some(s => config.logs?.[s]?.create);
  const hasEdit = PERMISSION_MODULES.some(m => config[m]?.edit) || LOG_SUBMODULES.some(s => config.logs?.[s]?.edit);
  const hasDelete = PERMISSION_MODULES.some(m => config[m]?.delete) || LOG_SUBMODULES.some(s => config.logs?.[s]?.delete);

  // Default roles (role.is_default, set server-side — never a hardcoded name
  // list) can't be renamed server-side (400s) and stay non-deletable here too.
  const defaultRole = !!role.is_default;
  const lockedRole = defaultRole || isOwnRole;
  const noActions = !perms.canConfigure && !perms.canView && !(perms.canEditRole && !lockedRole) && !(perms.canDeleteRole && !lockedRole);
  const roleName = role.roleName || '';
  const displayedRoleName = roleName.length > ROLE_NAME_MAX_LENGTH
    ? `${roleName.slice(0, ROLE_NAME_MAX_LENGTH)}\u2026`
    : roleName;
  return (
    <div
      className="vq-row"
      style={{
        display: 'grid', gridTemplateColumns: 'minmax(0,1fr) repeat(4,90px) 110px',
        gap: 0, padding: '12px 18px', borderBottom: '1px solid var(--bd)',
        alignItems: 'center', fontSize: 13, transition: 'background .12s',
      }}
    >
      <span style={{ minWidth: 0, maxWidth: '100%' }}>
        <span style={{
          fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-all'
        }} title={roleName}>{displayedRoleName}</span>
        {role.is_default && (
          <span style={{ fontSize: 10.5, color: 'var(--tx3)', display: 'block' }}>Default role</span>
        )}
      </span>

      {/* The 4 inline flags are edited through the same roles.edit grant as the
          Edit action. Also disabled for the viewer's own role and for default
          roles (lockedRole) — otherwise a user could grant themself more
          permissions via these checkboxes even with the Edit/Delete buttons
          hidden, or rewrite a default role's permissions in place.
          create/edit/delete additionally require view to already be on —
          consistent with the Configure modal's per-module rule — but stay
          clickable (toast instead of a hard disable) so it's not mistaken for broken. */}
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox checked={hasView} disabled={!perms.canEditRole || lockedRole} onToggle={() => onToggleField('view', hasView)} />
      </span>
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox checked={hasCreate} disabled={!perms.canEditRole || lockedRole} onToggle={() => onToggleField('create', hasCreate)} />
      </span>
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox checked={hasEdit} disabled={!perms.canEditRole || lockedRole} onToggle={() => onToggleField('edit', hasEdit)} />
      </span>
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox checked={hasDelete} disabled={!perms.canEditRole || lockedRole} onToggle={() => onToggleField('delete', hasDelete)} />
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
        {!lockedRole && perms.canEditRole && (
          <button
            onClick={onEdit}
            title="Edit"
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: 'var(--bg2)', border: '1px solid var(--bd)', color: 'var(--blue)', cursor: 'pointer' }}
          >
            <Pencil size={14} strokeWidth={1.8} />
          </button>
        )}
        {!lockedRole && perms.canDeleteRole && (
          <button
            onClick={onDelete}
            title="Delete"
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: 'var(--bg2)', border: '1px solid rgba(255,77,77,.3)', color: 'var(--crit)', cursor: 'pointer' }}
          >
            <Trash2 size={14} strokeWidth={1.8} />
          </button>
        )}
        {isOwnRole && (
          <span title="You cannot edit or delete your own role" style={{ fontSize: 10.5, color: 'var(--tx3)', display: 'flex', alignItems: 'center' }}>
            Your role
          </span>
        )}
      </span>
    </div>
  );
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function RolesPermission() {
  const { permissions, loading: permissionsLoading } = usePermissions();
  const { user } = useAuth();
  const canViewRole = permissions?.roles?.view;
  const canCreateRole = permissions?.roles?.create;
  const canEditRole = permissions?.roles?.edit;
  const canDeleteRole = permissions?.roles?.delete;
  const canConfigure = permissions?.permission?.edit;
  const canView = permissions?.permission?.view;

  // A role must never be able to edit/delete itself, even if the admin granted
  // roles.edit/delete — otherwise a user could unlock further permissions on
  // their own role or delete it out from under themselves.
  const myRoleId = String(
    user?.roleId?._id || user?.roleId || user?.roleIds?._id || user?.roleIds || ''
  );

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [configureTarget, setConfigureTarget] = useState(null); // { role, readOnly }

  const rolesApi = useApi(
    () => getRoles({ skip: page * pageSize, limit: pageSize, searchQuery: search }),
    [page, pageSize, search],
    { enabled: !!canViewRole },
  );
  const roles = rolesApi.data?.roles ?? [];
  const total = rolesApi.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const handlePageSizeChange = (nextPageSize) => {
    setPageSize(nextPageSize);
    setPage(0);
  };

  // Toggling a row flag (view/create/edit/delete) cascades server-side into
  // EVERY module + log sub-module of the role's permissionConfig (see
  // roles.service.js update). We optimistically flip the row for instant
  // feedback, then refetch so the freshly-cascaded permissionConfig is what the
  // Configure modal reads — otherwise it opens with the stale pre-cascade config
  // and the checkboxes look empty. Rolls back the row if the request fails.
  const handleToggleField = async (role, field, currentDerivedValue) => {
    if (myRoleId && String(role._id) === myRoleId) return;
    if (role.is_default) {
      toast.error('Default roles cannot be edited');
      return;
    }
    const next = currentDerivedValue !== undefined ? !currentDerivedValue : !role[field];
    // This flag cascades to every module + log sub-module server-side (see
    // roles.service.js update(): updatedPermissionConfig[key].view = roleView
    // for every key), so turning `view` off here sets EVERY module's view to
    // false in one shot — Sidebar.jsx gates all visibility on `view`, so that
    // alone empties the whole sidebar regardless of create/edit/delete.
    // Block turning view off entirely, and separately block the last
    // remaining flag of any kind going off.
    if (field === 'view' && !next) {
      toast.error('At least one "View" permission must stay selected for this role.');
      return;
    }
    // Turning create/edit/delete on while view is off auto-enables view
    // alongside it (sent in the same request below) instead of blocking the
    // click until the admin goes and checks View first.
    const alsoView = field !== 'view' && next && !role.view;
    const fields = ['view', 'create', 'edit', 'delete'];
    const wouldBeAllOff = !next && fields.every(f => (f === field ? next : !role[f]));
    if (wouldBeAllOff) {
      toast.error('This role must keep at least one permission enabled.');
      return;
    }
    rolesApi.setData(prev => ({
      ...prev,
      roles: (prev?.roles ?? []).map(r => (r._id === role._id ? { ...r, [field]: next, ...(alsoView ? { view: true } : {}) } : r)),
    }));
    try {
      await updateRolePermission(role._id, field, next, { alsoView });
      // Silent: pull the freshly-cascaded permissionConfig without a full-table
      // spinner (the row already shows the new flag optimistically).
      rolesApi.refetch({ silent: true });
    } catch (err) {
      rolesApi.setData(prev => ({
        ...prev,
        roles: (prev?.roles ?? []).map(r => (r._id === role._id ? { ...r, [field]: role[field], view: role.view } : r)),
      }));
      toast.error(err?.response?.data?.body?.message || 'Failed to update permission');
    }
  };

  const handleAddRole = async (name) => {
    try {
      // Defensive: trim and cap role name before sending to server
      const safeName = (name || '').trim().slice(0, ROLE_NAME_MAX_LENGTH);
      const body = await createRole(safeName);
      // Some failures come back as HTTP 200 with body.status: 'failed'
      // (no rejected promise) rather than a thrown error.
      if (body?.status && body.status !== 'success') {
        toast.error(body?.message || 'Failed to create role');
        return;
      }
      toast.success(body?.message || 'Role created');
      setShowAddModal(false);
      rolesApi.refetch();
      // A brand-new role is seeded with every module/log flag off (server
      // default) — invisible-app territory until someone configures it. Pull
      // the freshly-created row (with its permissionDetails) and open
      // Configure immediately so the admin can't leave it fully empty
      // without at least seeing the matrix.
      try {
        const { roles: freshRoles } = await getRoles({ searchQuery: name, limit: 5 });
        const created = freshRoles.find(r => r.roleName?.toLowerCase() === name.toLowerCase());
        if (created) setConfigureTarget({ role: created, readOnly: false, requireConfig: true });
      } catch {
        // Non-fatal — the role list refetch above already succeeded, the
        // admin can still open Configure manually from the row.
      }
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to create role');
    }
  };

  const handleRename = async (name) => {
    if (myRoleId && String(renameTarget?._id) === myRoleId) {
      toast.error('You cannot edit your own role');
      setRenameTarget(null);
      return;
    }
    try {
      const safeName = (name || '').trim().slice(0, ROLE_NAME_MAX_LENGTH);
      const body = await renameRole(renameTarget._id, safeName);
      if (body?.status && body.status !== 'success') {
        toast.error(body?.message || 'Failed to rename role');
        return;
      }
      toast.success(body?.message || 'Role renamed');
      setRenameTarget(null);
      rolesApi.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to rename role');
    }
  };

  const handleDelete = async () => {
    if (myRoleId && String(deleteTarget?._id) === myRoleId) {
      toast.error('You cannot delete your own role');
      setDeleteTarget(null);
      return;
    }
    try {
      const body = await deleteRole(deleteTarget._id);
      // Some failures come back as HTTP 200 with body.status: 'failed'
      // (no rejected promise) rather than a thrown error — same contract
      // Users create/edit already handles.
      if (body?.status && body.status !== 'success') {
        toast.error(body?.message || 'Failed to delete role');
        return;
      }
      toast.success(body?.message || 'Role deleted');
      setDeleteTarget(null);
      rolesApi.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to delete role');
    }
  };

  const handleSaveConfig = async (permissionConfig) => {
    if (myRoleId && String(configureTarget?.role?._id) === myRoleId) {
      toast.error('You cannot edit your own role');
      setConfigureTarget(null);
      return;
    }
    if (configureTarget?.role?.is_default) {
      toast.error('Default roles cannot be edited');
      setConfigureTarget(null);
      return;
    }
    try {
      const body = await updatePermissionConfig(configureTarget.role.permissionDetails?._id, permissionConfig);
      if (body?.status && body.status !== 'success') {
        toast.error(body?.message || 'Failed to update permissions');
        return;
      }
      toast.success(body?.message || 'Permissions updated');
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
              display: 'grid', gridTemplateColumns: 'minmax(0,1fr) repeat(4,90px) 110px',
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
                  isOwnRole={!!myRoleId && String(role._id) === myRoleId}
                  onToggleField={(field, currentVal) => handleToggleField(role, field, currentVal)}
                  onConfigure={() => setConfigureTarget({ role, readOnly: role.is_default || String(role._id) === myRoleId })}
                  onView={() => setConfigureTarget({ role, readOnly: true })}
                  onEdit={() => setRenameTarget(role)}
                  onDelete={() => setDeleteTarget(role)}
                />
              ))}
            </AsyncBoundary>
          </div>
        </HScrollHint>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{
          justifySelf: 'start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          width: 'fit-content',
          padding: '6px 10px',
          borderRadius: 8,
          background: 'var(--bg2)',
          color: 'var(--tx2)',
          fontSize: 12,
        }}>
          Total roles
          <span style={{
            padding: '3px 8px',
            borderRadius: 7,
            background: 'rgba(99,102,241,.12)',
            color: 'var(--blue)',
            fontWeight: 700,
          }}>
            {total}
          </span>
        </div>

        {pages > 1 ? (
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
        ) : <span />}

        <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>Show entries</span>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            style={{
              height: 36,
              minWidth: 86,
              borderRadius: 9,
              border: '1px solid var(--bd)',
              background: 'var(--bg2)',
              color: 'var(--tx)',
              padding: '0 10px',
              fontSize: 12,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {PAGE_SIZE_OPTIONS.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      </div>

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
          requireConfig={configureTarget.requireConfig}
        />
      )}
    </div>
  );
}


