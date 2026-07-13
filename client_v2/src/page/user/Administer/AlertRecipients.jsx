import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Search, Plus, X, Trash2, Loader2, BellRing } from 'lucide-react';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { usePermissions } from '../../../context/PermissionContext';
import DeleteConfirmation from '../../../components/DeleteConfirmation';
import MultiSelect from '../../../components/MultiSelect';
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

// Shared Tailwind classes for the field labels shown beside each value in the mobile card layout.
const M_LABEL = 'font-[family-name:var(--mono)] text-[9.5px] tracking-[.07em] text-[var(--tx3)] shrink-0';

// Track a narrow (phone) viewport so the fixed-grid table can fall back to stacked cards.
function useIsMobile(maxWidth = 640) {
  const query = `(max-width:${maxWidth}px)`;
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return isMobile;
}

function Avatar({ name }) {
  const initials = (name || '?').trim().slice(0, 2).toUpperCase();
  return (
    <span className="w-[32px] h-[32px] rounded-full shrink-0 flex items-center justify-center bg-[linear-gradient(135deg,var(--blue),var(--violet))] text-white text-[11.5px] font-bold font-[family-name:var(--mono)]">
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
      className="fixed inset-0 z-[300] bg-[rgba(6,8,13,.62)] backdrop-blur-[4px] flex items-center justify-center p-[24px]"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-[440px] max-w-full bg-[var(--bg1)] border border-[var(--bd)] rounded-[16px] overflow-hidden"
      >
        <div className="flex items-center justify-between py-[16px] px-[20px] border-b border-[var(--bd)]">
          <div>
            <div className="font-[family-name:var(--disp)] font-semibold text-[15.5px]">Add Notification Recipient</div>
            <div className="text-[11.5px] text-[var(--tx3)] mt-[2px]">Enter contact details and choose alert types</div>
          </div>
          <button onClick={onClose} className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center bg-transparent border border-[var(--bd)] text-[var(--tx3)] cursor-pointer">
            <X size={14} />
          </button>
        </div>

        <div className="py-[18px] px-[20px] flex flex-col gap-[14px]">
          <div>
            <div className="text-[11px] text-[var(--tx2)] mb-[6px]">Full Name</div>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="e.g. John Doe"
              className="w-full box-border h-[38px] px-[12px] rounded-[9px] bg-[var(--bg2)] border border-[var(--bd)] text-[12.5px] text-[var(--tx)] outline-none"
            />
          </div>
          <div>
            <div className="text-[11px] text-[var(--tx2)] mb-[6px]">Email Address</div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. michael@company.com"
              className="w-full box-border h-[38px] px-[12px] rounded-[9px] bg-[var(--bg2)] border border-[var(--bd)] text-[12.5px] text-[var(--tx)] outline-none"
            />
          </div>
          <div>
            <div className="text-[11px] text-[var(--tx2)] mb-[6px]">Detection Types</div>
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

        <div className="flex justify-end gap-[8px] py-[15px] px-[20px] border-t border-[var(--bd)]">
          <button onClick={onClose} disabled={saving} className="text-[12.5px] font-semibold text-[var(--tx2)] border border-[var(--bd)] rounded-[9px] py-[9px] px-[16px] cursor-pointer bg-transparent">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className={`flex items-center gap-[7px] text-[12.5px] font-semibold text-white bg-[linear-gradient(135deg,var(--blue),var(--violet))] rounded-[9px] py-[9px] px-[18px] border-none ${saving ? 'cursor-wait opacity-70' : 'cursor-pointer opacity-100'}`}
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
    if (!canEdit || busy) return;
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
function RecipientRow({ recipient, detectionTypes, canEdit, canDelete, onVerify, onDelete, onSaved, isMobile }) {
  const statusBadge = recipient.verified ? (
    <span className="flex items-center gap-[5px] text-[10.5px] font-semibold text-[var(--ok)] border border-[var(--ok)] rounded-[20px] py-[3px] px-[9px] whitespace-nowrap">
      ✓ Verified
    </span>
  ) : canEdit ? (
    <button
      onClick={onVerify}
      className="text-[10.5px] font-semibold text-white bg-[var(--blue)] border-none rounded-[20px] py-[4px] px-[10px] cursor-pointer whitespace-nowrap"
    >
      Verify
    </button>
  ) : (
    <span className="text-[10.5px] font-semibold text-[var(--warn)] border border-[var(--warn)] rounded-[20px] py-[3px] px-[9px] whitespace-nowrap">
      Unverified
    </span>
  );

  const detectionTypesSelect = <RowDetectionTypes recipient={recipient} detectionTypes={detectionTypes} canEdit={canEdit} onSaved={onSaved} />;

  const deleteBtn = canDelete && (
    <button
      onClick={onDelete}
      title="Delete recipient"
      className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center bg-transparent border border-[rgba(255,77,77,.4)] text-[var(--crit)] cursor-pointer shrink-0"
    >
      <Trash2 size={13} />
    </button>
  );

  // On phones the 4-column grid overflows, so each recipient becomes a stacked
  // card with the columns turned into labelled rows.
  if (isMobile) {
    return (
      <div className="flex flex-col gap-[12px] py-[14px] px-[16px] border-b border-[var(--bd)]">
        <div className="flex items-center gap-[10px] min-w-0">
          <Avatar name={recipient.fullName} />
          <span className="text-[13px] font-semibold text-[var(--tx)] whitespace-nowrap overflow-hidden text-ellipsis flex-1 min-w-0">
            {recipient.fullName || '—'}
          </span>
          {deleteBtn}
        </div>
        <div className="flex items-center gap-[10px]">
          <span className={M_LABEL}>EMAIL</span>
          <span className="text-[12px] text-[var(--tx2)] overflow-hidden text-ellipsis whitespace-nowrap ml-auto min-w-0">
            {recipient.value}
          </span>
        </div>
        <div className="flex items-center justify-between gap-[10px]">
          <span className={M_LABEL}>STATUS</span>
          {statusBadge}
        </div>
        <div className="flex items-center justify-between gap-[10px]">
          <span className={M_LABEL}>DETECTIONS</span>
          {detectionTypesSelect}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1.4fr_1.6fr_1.2fr_44px] items-center gap-[12px] py-[12px] px-[16px] border-b border-[var(--bd)]">
      <div className="flex items-center gap-[10px] min-w-0">
        <Avatar name={recipient.fullName} />
        <span className="text-[12.5px] font-semibold text-[var(--tx)] whitespace-nowrap overflow-hidden text-ellipsis">
          {recipient.fullName || '—'}
        </span>
      </div>
      <div className="text-[12px] text-[var(--tx2)] whitespace-nowrap overflow-hidden text-ellipsis">
        {recipient.value}
      </div>
      <div className="flex items-center gap-[8px] flex-wrap">
        {statusBadge}
        {detectionTypesSelect}
      </div>
      <div className="flex justify-center">
        {deleteBtn}
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function AlertRecipients() {
  const isMobile = useIsMobile();
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
      <div className="p-[40px] text-center text-[var(--tx3)] text-[13px]">
        You don't have permission to view Alert Recipients.
      </div>
    );
  }

  return (
    <div className={`${isMobile ? 'p-[14px]' : 'p-[22px]'} flex flex-col gap-[18px]`}>
      {/* Toolbar */}
      <div className="flex items-center gap-[10px] flex-wrap">
        <div className={`flex items-center gap-[7px] h-[36px] px-[12px] rounded-[9px] bg-[var(--bg2)] border border-[var(--bd)] min-w-[220px] ${isMobile ? 'flex-[1_1_100%]' : 'flex-[0_1_auto]'}`}>
          <Search size={14} className="text-[var(--tx3)] shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search recipients..."
            className="flex-1 bg-transparent border-0 outline-none text-[var(--tx)] text-[12.5px]"
          />
        </div>

        <div className="flex gap-[4px] bg-[var(--bg2)] border border-[var(--bd)] rounded-[9px] p-[3px]">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`py-[6px] px-[13px] rounded-[6px] border-none cursor-pointer text-[12px] font-semibold ${
                statusFilter === f.key ? 'bg-[var(--blue)] text-white' : 'bg-transparent text-[var(--tx2)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {canCreate && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-[7px] text-[12.5px] font-semibold text-white bg-[linear-gradient(135deg,var(--blue),var(--violet))] rounded-[9px] py-[9px] px-[16px] cursor-pointer border-none shadow-[0_0_14px_rgba(99,102,241,.3)]"
          >
            <Plus size={14} /> Add New
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-[var(--bg1)] border border-[var(--bd)] rounded-[14px] overflow-hidden">
        <div className="flex items-center justify-between py-[14px] px-[16px] border-b border-[var(--bd)]">
          <span className="font-[family-name:var(--disp)] font-semibold text-[14px]">All Email Recipients</span>
          <span className="font-[family-name:var(--mono)] text-[11px] text-[var(--tx3)]">
            {verifiedCount} verified · {recipients.length - verifiedCount} pending
          </span>
        </div>

        {/* Column header — hidden on phones, where each row renders its own inline labels. */}
        <div className={`${isMobile ? 'hidden' : 'grid'} grid-cols-[1.4fr_1.6fr_1.2fr_44px] py-[10px] px-[16px] border-b border-[var(--bd)] font-[family-name:var(--mono)] text-[9.5px] tracking-[.07em] text-[var(--tx3)]`}>
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
              isMobile={isMobile}
            />
          ))}
        </AsyncBoundary>
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
