import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Search, Plus, X, Trash2, Loader2, BellRing } from 'lucide-react';
import { AsyncBoundary } from '../../../components/States';
import HScrollHint from '../../../components/HScrollHint';
import { useApi } from '../../../hooks/useApi';
import { usePermissions } from '../../../context/PermissionContext';
import DeleteConfirmation from '../../../components/DeleteConfirmation';
import MultiSelect from '../../../components/MultiSelect';
import TelegramAlerts from './TelegramAlerts';
import { getDetectionTypes } from '../../../helpers/configure';
import { getRecipients, createRecipient, updateRecipient, removeRecipient, resendVerification } from '../../../helpers/recipients';

/* Detection-settings key (e.g. "loiteringWithoutAuthSettings") -> incidentType
   key stored on the recipient (e.g. "loiteringWithoutAuth"). Ported 1:1 from
   client/src/components/NotificationRecipientModal/AddRecipientModal.jsx so
   the values match what the backend already expects. */
function toIncidentKey(detectionKey) {
  if (detectionKey === 'personalProtectiveEquipmentSettings') return 'personProtectiveEquipment';
  return detectionKey.replace('Settings', '');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS_FILTERS = [
  { key: 'All', label: 'All' },
  { key: 'verified', label: 'Verified' },
  { key: 'unverified', label: 'Unverified' },
];

function Avatar({ name }) {
  const initials = (name || '?').trim().slice(0, 2).toUpperCase();
  return (
    <span style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg,var(--blue),var(--violet))',
      color: '#fff', fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--mono)',
    }}>
      {initials}
    </span>
  );
}

/* ── Add recipient modal (email only — matches the mockup / v1's active path) ── */
function AddRecipientModal({ detectionTypes, onClose, onCreated }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [incidentIds, setIncidentIds] = useState([]);
  const [saving, setSaving] = useState(false);

  const typeOptions = useMemo(
    () => Object.entries(detectionTypes).map(([key, label]) => ({ id: toIncidentKey(key), label })),
    [detectionTypes]
  );

  async function submit() {
    if (!fullName.trim()) { toast.error('Full name is required'); return; }
    if (!EMAIL_RE.test(email.trim())) { toast.error('Enter a valid email address'); return; }

    setSaving(true);
    try {
      const resp = await createRecipient({ type: 'email', value: email.trim(), fullName: fullName.trim(), incidentTypes: incidentIds });
      if (resp?.statusCode === 200 || resp?.body?.status === 'success') {
        toast.success(resp?.body?.message || 'Recipient added successfully');
        onCreated();
        onClose();
      } else {
        toast.error(resp?.body?.message || 'Something went wrong');
      }
    } catch (e) {
      toast.error(e?.response?.data?.body?.message || 'Failed to add recipient');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(6,8,13,.62)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        className="vq-recipients-modal"
        onClick={e => e.stopPropagation()}
        /* --bg1solid, not --bg1: --bg1 is translucent (62% white / 55% navy) and
           over the overlay's dark scrim it renders as muddy grey with the table
           showing through. Matches the account menu and other floating panels. */
        style={{
          width: 440, maxWidth: '100%',
          background: 'var(--bg1solid)', border: '1px solid var(--bd2)',
          borderRadius: 16, overflow: 'hidden',
          boxShadow: '0 18px 50px rgba(0,0,0,.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--bd)' }}>
          <div>
            <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15.5 }}>Add Notification Recipient</div>
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>Enter contact details and choose alert types</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--bd)', color: 'var(--tx3)', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>

        <div className="vq-recipients-modal-body" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>Full Name</div>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="e.g. John Doe"
              style={{ width: '100%', boxSizing: 'border-box', height: 38, padding: '0 12px', borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12.5, color: 'var(--tx)', outline: 'none' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>Email Address</div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. michael@company.com"
              style={{ width: '100%', boxSizing: 'border-box', height: 38, padding: '0 12px', borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12.5, color: 'var(--tx)', outline: 'none' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>Detection Types</div>
            <MultiSelect
              options={typeOptions}
              value={incidentIds}
              onChange={setIncidentIds}
              placeholder="Select detection types…"
              searchPlaceholder="Search detection types..."
              msg="No detection types found"
            />
          </div>
        </div>

        <div className="vq-recipients-modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '15px 20px', borderTop: '1px solid var(--bd)' }}>
          <button onClick={onClose} disabled={saving} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx2)', border: '1px solid var(--bd)', borderRadius: 9, padding: '9px 16px', cursor: 'pointer', background: 'none' }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 12.5, fontWeight: 600, color: '#fff',
              background: 'linear-gradient(135deg,var(--blue),var(--violet))',
              borderRadius: 9, padding: '9px 18px', cursor: saving ? 'wait' : 'pointer', border: 'none',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Per-row detection-type multi-select, saved immediately on change ─────── */
function RowDetectionTypes({ recipient, detectionTypes, canEdit, onSaved }) {
  const [busy, setBusy] = useState(false);
  const typeOptions = useMemo(
    () => Object.entries(detectionTypes).map(([key, label]) => ({ id: toIncidentKey(key), label })),
    [detectionTypes]
  );
  const selected = recipient.incidentTypes || [];

  async function handleChange(next) {
    if (busy) return;
    if (!canEdit) {
      toast.error("You don't have permission to edit Alert Recipients.");
      return;
    }
    setBusy(true);
    try {
      const result = await updateRecipient(recipient._id, { incidentTypes: next });
      if (result?.status === 'success') {
        toast.success('Detection types updated');
        onSaved();
      } else {
        toast.error(result?.message || 'Failed to update detection types');
      }
    } catch (e) {
      toast.error(e?.response?.data?.body?.message || 'Failed to update detection types');
    } finally {
      setBusy(false);
    }
  }

  const label = selected.length === 0
    ? 'None'
    : selected.length === typeOptions.length
      ? 'All detections'
      : `${selected.length} selected`;

  return (
    <MultiSelect
      options={typeOptions}
      value={selected}
      onChange={handleChange}
      placeholder="None"
      className="w-full sm:w-48"
      maxHeight="max-h-56"
      msg="No detection types found"
    />
  );
}

/* ── Recipient row ────────────────────────────────────────────────────────── */
function RecipientRow({ recipient, detectionTypes, canEdit, canDelete, onVerify, onDelete, onSaved }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1.4fr 1.6fr 1.2fr 44px',
      alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--bd)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Avatar name={recipient.fullName} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {recipient.fullName || '—'}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--tx2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {recipient.value}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {recipient.verified ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: 'var(--ok)', border: '1px solid var(--ok)', borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap' }}>
            ✓ Verified
          </span>
        ) : canEdit ? (
          <button
            onClick={onVerify}
            style={{ fontSize: 10.5, fontWeight: 600, color: '#fff', background: 'var(--blue)', border: 'none', borderRadius: 20, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Verify
          </button>
        ) : (
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--warn)', border: '1px solid var(--warn)', borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap' }}>
            Unverified
          </span>
        )}
        <RowDetectionTypes recipient={recipient} detectionTypes={detectionTypes} canEdit={canEdit} onSaved={onSaved} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {canDelete && (
          <button
            onClick={onDelete}
            title="Delete recipient"
            style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid rgba(255,77,77,.4)', color: 'var(--crit)', cursor: 'pointer' }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function RecipientMobileCard({ recipient, detectionTypes, canEdit, canDelete, onVerify, onDelete, onSaved }) {
  return (
    <div
      style={{
        border: '1px solid var(--bd)',
        borderRadius: 12,
        background: 'var(--bg2)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
        <Avatar name={recipient.fullName} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {recipient.fullName || '-'}
          </div>
          <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--tx3)', overflowWrap: 'anywhere' }}>
            {recipient.value}
          </div>
        </div>
        {canDelete && (
          <button
            onClick={onDelete}
            title="Delete recipient"
            style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg1)', border: '1px solid rgba(255,77,77,.4)', color: 'var(--crit)', cursor: 'pointer', flex: '0 0 auto' }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {recipient.verified ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 10.5, fontWeight: 700, color: 'var(--ok)', border: '1px solid var(--ok)', borderRadius: 20, padding: '4px 10px' }}>
            Verified
          </span>
        ) : canEdit ? (
          <button
            onClick={onVerify}
            style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'var(--blue)', border: 'none', borderRadius: 20, padding: '5px 11px', cursor: 'pointer' }}
          >
            Verify
          </button>
        ) : (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--warn)', border: '1px solid var(--warn)', borderRadius: 20, padding: '4px 10px' }}>
            Unverified
          </span>
        )}
      </div>

      <div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.07em', color: 'var(--tx3)', marginBottom: 6 }}>
          DETECTIONS
        </div>
        <RowDetectionTypes recipient={recipient} detectionTypes={detectionTypes} canEdit={canEdit} onSaved={onSaved} />
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function AlertRecipients() {
  const { permissions } = usePermissions();
  const canView = permissions?.recipients?.view ?? true;
  const canCreate = permissions?.recipients?.create ?? true;
  const canEdit = permissions?.recipients?.edit ?? true;
  const canDelete = permissions?.recipients?.delete ?? true;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const debounceRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const recipientsApi = useApi(() => getRecipients('email', debouncedSearch, statusFilter), [debouncedSearch, statusFilter]);
  const typesApi = useApi(() => getDetectionTypes(), []);

  const recipients = Array.isArray(recipientsApi.data) ? recipientsApi.data : [];
  const detectionTypes = typesApi.data || {};
  const verifiedCount = recipients.filter(r => r.verified).length;

  async function handleVerify(recipient) {
    try {
      const result = await resendVerification({ id: recipient._id, type: 'email', value: recipient.value });
      if (result?.status === 'success') {
        toast.success(result?.message || 'A verification link has been sent');
      } else {
        toast.error(result?.message || 'Failed to send verification link');
      }
    } catch (e) {
      toast.error(e?.response?.data?.body?.message || 'Failed to send verification link');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await removeRecipient({ emailToRemove: deleteTarget.value });
      if (result?.status === 'success') {
        toast.success(result?.message || 'Recipient deleted successfully');
        recipientsApi.refetch();
      } else {
        toast.error(result?.message || 'Something went wrong');
      }
    } catch (e) {
      toast.error(e?.response?.data?.body?.message || 'Failed to delete recipient');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  if (!canView) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>
        You don't have permission to view Alert Recipients.
      </div>
    );
  }

  return (
    <div className="vq-recipients-page" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <style>{`
        @media (max-width: 720px) {
          .vq-recipients-page {
            padding: 12px !important;
            gap: 12px !important;
          }
          .vq-recipients-toolbar {
            align-items: stretch !important;
          }
          .vq-recipients-search {
            width: 100% !important;
            min-width: 0 !important;
          }
          .vq-recipients-status {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }
          .vq-recipients-status button {
            padding-left: 6px !important;
            padding-right: 6px !important;
          }
          .vq-recipients-spacer {
            display: none !important;
          }
          .vq-recipients-add {
            width: 100% !important;
            justify-content: center !important;
          }
          .vq-recipients-panel-head {
            align-items: flex-start !important;
            gap: 4px !important;
            flex-direction: column !important;
          }
          .vq-recipients-desktop {
            display: none !important;
          }
          .vq-recipients-mobile {
            display: flex !important;
          }
          .vq-recipients-modal {
            width: 100% !important;
            max-height: calc(100vh - 28px) !important;
            display: flex !important;
            flex-direction: column !important;
          }
          .vq-recipients-modal-body {
            overflow: auto !important;
          }
          .vq-recipients-modal-actions {
            flex-direction: column-reverse !important;
          }
          .vq-recipients-modal-actions button {
            width: 100% !important;
            justify-content: center !important;
          }
        }
        @media (min-width: 721px) {
          .vq-recipients-mobile {
            display: none !important;
          }
        }
      `}</style>

      {/* Telegram Alerts Menu  */}
      <TelegramAlerts />

      {/* Toolbar */}
      <div className="vq-recipients-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="vq-recipients-search" style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 12px', borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)', minWidth: 220 }}>
          <Search size={14} style={{ color: 'var(--tx3)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search recipients..."
            style={{ flex: 1, background: 'transparent', border: 0, outline: 'none', color: 'var(--tx)', fontSize: 12.5 }}
          />
        </div>

        <div className="vq-recipients-status" style={{ display: 'flex', gap: 4, background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 9, padding: 3 }}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              style={{
                padding: '6px 13px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
                background: statusFilter === f.key ? 'var(--blue)' : 'transparent',
                color: statusFilter === f.key ? '#fff' : 'var(--tx2)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="vq-recipients-spacer" style={{ flex: 1 }} />

        {canCreate && (
          <button
            className="vq-recipients-add"
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 12.5, fontWeight: 600, color: '#fff',
              background: 'linear-gradient(135deg,var(--blue),var(--violet))',
              borderRadius: 9, padding: '9px 16px', cursor: 'pointer', border: 'none',
              boxShadow: '0 0 14px rgba(99,102,241,.3)',
            }}
          >
            <Plus size={14} /> Add New
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 14, overflow: 'hidden' }}>
        <div className="vq-recipients-panel-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--bd)' }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>All Email Recipients</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>
            {verifiedCount} verified · {recipients.length - verifiedCount} pending
          </span>
        </div>

        {/* Horizontal scroll on narrow screens (e.g. after restoring/un-maximizing
            the window), with edge fades hinting swipeability, instead of letting
            the status/detections column squish into the delete button. */}
        <div className="vq-recipients-desktop">
        <HScrollHint minWidth={660} fadeColor="var(--bg1)">
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.6fr 1.2fr 44px', padding: '10px 16px', borderBottom: '1px solid var(--bd)', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.07em', color: 'var(--tx3)' }}>
              <span>NAME</span>
              <span>EMAIL ID</span>
              <span>STATUS &amp; DETECTIONS</span>
              <span />
            </div>

            <AsyncBoundary
              loading={recipientsApi.loading}
              error={recipientsApi.error}
              isEmpty={!recipientsApi.loading && !recipientsApi.error && recipients.length === 0}
              onRetry={recipientsApi.refetch}
              minH={160}
              emptyLabel={search ? `No results found for "${search}"` : 'No recipients added yet'}
            >
              {() => recipients.map(r => (
                <RecipientRow
                  key={r._id}
                  recipient={r}
                  detectionTypes={detectionTypes}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onVerify={() => handleVerify(r)}
                  onDelete={() => setDeleteTarget(r)}
                  onSaved={recipientsApi.refetch}
                />
              ))}
            </AsyncBoundary>
          </div>
        </HScrollHint>
        </div>

        <div className="vq-recipients-mobile" style={{ display: 'none', flexDirection: 'column', gap: 10, padding: 12 }}>
          <AsyncBoundary
            loading={recipientsApi.loading}
            error={recipientsApi.error}
            isEmpty={!recipientsApi.loading && !recipientsApi.error && recipients.length === 0}
            onRetry={recipientsApi.refetch}
            minH={160}
            emptyLabel={search ? `No results found for "${search}"` : 'No recipients added yet'}
          >
            {() => recipients.map(r => (
              <RecipientMobileCard
                key={r._id}
                recipient={r}
                detectionTypes={detectionTypes}
                canEdit={canEdit}
                canDelete={canDelete}
                onVerify={() => handleVerify(r)}
                onDelete={() => setDeleteTarget(r)}
                onSaved={recipientsApi.refetch}
              />
            ))}
          </AsyncBoundary>
        </div>
      </div>

      {showAddModal && (
        <AddRecipientModal
          detectionTypes={detectionTypes}
          onClose={() => setShowAddModal(false)}
          onCreated={recipientsApi.refetch}
        />
      )}

      <DeleteConfirmation
        open={!!deleteTarget}
        title="Delete Recipient"
        message={`Are you sure you want to delete ${deleteTarget?.fullName || deleteTarget?.value}? They will stop receiving alert notifications.`}
        icon={<BellRing className="w-6 h-6 text-red-500" />}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
      />
    </div>
  );
}
