import useMetadataEffect from '@/hooks/useMetadataEffect';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  X,
  Trash2,
  Pencil,
  Loader2,
  BellRing,
  CheckCircle2,
} from 'lucide-react';
import { AsyncBoundary } from '../../../components/States';
import HScrollHint from '../../../components/HScrollHint';
import { useApi } from '../../../hooks/useApi';
import { usePermissions } from '../../../context/PermissionContext';
import { useSocket } from '../../../context/SocketContext';
import { useAuth } from '../../../context/AuthContext';
import DeleteConfirmation from '../../../components/DeleteConfirmation';
import MultiSelect from '../../../components/MultiSelect';
import { fromLegacyKey, toIncidentKey } from './recipientTypes';
import { departmentLabel, departmentTitle, hasDepartments } from './recipientDepartments';
import { fetchDepartments } from '../Departments/Api';
import Pagination from '../../../components/Pagination';
import { formatUtcInConfiguredTimezone } from '@/utils/timezone';
import { EMAIL_EMOJI_ERROR, hasEmailEmoji } from '@/utils/emailValidation';
import TelegramAlerts from './TelegramAlerts';
import { getDetectionTypes } from '../../../helpers/configure';
import { getTelegramLinkCode, unlinkTelegram } from '../../../helpers/telegram';
import {
  getRecipients,
  createRecipient,
  updateRecipient,
  removeRecipient,
  resendVerification,
} from '../../../helpers/recipients';


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^\p{L}[\p{L}\p{M} ]*$/u;

const STATUS_FILTERS = [
  { key: 'All', label: 'All' },
  { key: 'verified', label: 'Verified' },
  { key: 'unverified', label: 'Unverified' },
];

const RECIPIENT_VIEWS = [
  { key: 'email', label: 'Email' },
  { key: 'telegram', label: 'Telegram' },
];

const TELEGRAM_CHANNELS_PER_PAGE = 4;
const EMAIL_RECIPIENTS_PER_PAGE = 10;

function Avatar({ name }) {
  const initials = (name || '?').trim().slice(0, 2).toUpperCase();
  return (
    <span
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg,var(--blue),var(--violet))',
        color: '#fff',
        fontSize: 11.5,
        fontWeight: 700,
        fontFamily: 'var(--mono)',
      }}
    >
      {initials}
    </span>
  );
}

const SEVERITY_OPTIONS = [
  { id: 'low', label: 'Low', color: '#22d3ee' },
  { id: 'moderate', label: 'Moderate', color: '#f59e0b' },
  { id: 'high', label: 'High', color: '#ef4444' },
];

// Only the selected types' entries, minus empty ones (empty = every severity).
const severityPayload = (incidentIds, severityByType) => Object.fromEntries(
  incidentIds.map((id) => [id, severityByType[id] || []]).filter(([, list]) => list.length),
);
const sameIds = (left, right) => JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
const normalizeSeveritySettings = (incidentIds, severityByType) => JSON.stringify(
  Object.entries(severityPayload(incidentIds, severityByType))
    .map(([type, severities]) => [type, [...severities].sort()])
    .sort(([left], [right]) => left.localeCompare(right)),
);

// Per selected detection type: which incident severities this recipient is
// emailed about. No chip on = every severity for that type.
function DetectionSeverities({ typeOptions, incidentIds, value, onChange }) {
  if (!incidentIds.length) return null;
  const toggle = (type, severity) => {
    const current = value[type] || [];
    onChange({
      ...value,
      [type]: current.includes(severity) ? current.filter((s) => s !== severity) : [...current, severity],
    });
  };
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>Severity per detection</div>
      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--bd)', borderRadius: 9, background: 'var(--bg2)' }}>
        {incidentIds.map((type, i) => {
          const current = value[type] || [];
          return (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderTop: i ? '1px solid var(--bd)' : 'none' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {typeOptions.find((o) => o.id === type)?.label || type}
              </span>
              {!current.length && <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>All</span>}
              {SEVERITY_OPTIONS.map((s) => {
                const on = current.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(type, s.id)}
                    aria-pressed={on}
                    style={{
                      flexShrink: 0, height: 24, padding: '0 9px', borderRadius: 999, cursor: 'pointer',
                      fontSize: 10.5, fontWeight: 600, color: on ? '#fff' : 'var(--tx2)',
                      background: on ? s.color : 'transparent', border: `1px solid ${on ? s.color : 'var(--bd2)'}`,
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 5 }}>
        Pick severities to limit a detection&apos;s emails. None picked = every severity.
      </div>
    </div>
  );
}

// Departments for a recipient, as labels: they only help find them in a
// detection's Select Recipients and never change which alerts they get.
function DepartmentField({ value, onChange, label = 'Departments', exclude = [] }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useMetadataEffect(() => {
    fetchDepartments(0, 1000)
      .then((resp) => setOptions(
        (resp?.data?.body?.data?.data || []).map((d) => ({ id: String(d._id), label: d.departmentName })),
      ))
      .catch(() => toast.error('Failed to load departments'))
      .finally(() => setLoading(false));
  }, [], ["departments"]);

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>{label}</div>
      <MultiSelect
        options={options.filter((o) => !exclude.includes(o.id))}
        value={value}
        onChange={onChange}
        placeholder="No department"
        searchPlaceholder="Search departments..."
        msg={loading ? 'Loading departments...' : 'No departments found'}
        inlinePanel
      />
      <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 5 }}>
        Used to find this recipient on the Detections page. They don&apos;t change which alerts they get.
      </div>
    </div>
  );
}

function AddRecipientModal({ detectionTypes, onClose, onCreated }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [incidentIds, setIncidentIds] = useState([]);
  const [departmentIds, setDepartmentIds] = useState([]);
  const [severityByType, setSeverityByType] = useState({});
  const [saving, setSaving] = useState(false);

  const typeOptions = useMemo(
    () =>
      Object.entries(detectionTypes).map(([key, label]) => ({
        id: toIncidentKey(key),
        label,
      })),
    [detectionTypes],
  );

  async function submit() {
    if (!fullName.trim()) {
      toast.error('Full name is required');
      return;
    }
    if (!NAME_RE.test(fullName.trim())) {
      toast.error('Full name must contain only letters and spaces');
      return;
    }
    if (hasEmailEmoji(email)) {
      setEmailError(EMAIL_EMOJI_ERROR);
      toast.error(EMAIL_EMOJI_ERROR);
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      toast.error('Enter a valid email address');
      return;
    }

    setSaving(true);
    try {
      const response = await createRecipient({
        type: 'email',
        value: email.trim(),
        fullName: fullName.trim(),
        incidentTypes: incidentIds,
        departmentIds,
        severityByType: severityPayload(incidentIds, severityByType),
      });
      if (response?.statusCode === 200 || response?.body?.status === 'success') {
        toast.success(response?.body?.message || 'Recipient added successfully');
        onCreated();
        onClose();
      } else {
        toast.error(response?.body?.message || 'Something went wrong');
      }
    } catch (error) {
      toast.error(error?.response?.data?.body?.message || 'Failed to add recipient');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(6,8,13,.62)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        className="vq-recipients-modal"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 440,
          maxWidth: '100%',
          // Never taller than the window: the body scrolls, header and buttons stay put.
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg1solid)',
          border: '1px solid var(--bd2)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 18px 50px rgba(0,0,0,.35)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--bd)',
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--disp)',
                fontWeight: 600,
                fontSize: 15.5,
              }}
            >
              Add Notification Recipient
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>
              Enter contact details and choose alert types
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: '1px solid var(--bd)',
              color: 'var(--tx3)',
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div
          className="vq-recipients-modal-body"
          style={{
            overflowY: 'auto',
            minHeight: 0,
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>
              Full Name
            </div>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="e.g. John Doe"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                height: 38,
                padding: '0 12px',
                borderRadius: 9,
                background: 'var(--bg2)',
                border: '1px solid var(--bd)',
                fontSize: 12.5,
                color: 'var(--tx)',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>
              Email Address
            </div>
            <input
              type="email"
              value={email}
              aria-invalid={!!emailError || undefined}
              onChange={(event) => {
                if (hasEmailEmoji(event.target.value)) {
                  setEmailError(EMAIL_EMOJI_ERROR);
                  return;
                }
                setEmail(event.target.value);
                setEmailError('');
              }}
              placeholder="e.g. michael@company.com"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                height: 38,
                padding: '0 12px',
                borderRadius: 9,
                background: 'var(--bg2)',
                border: '1px solid var(--bd)',
                fontSize: 12.5,
                color: 'var(--tx)',
                outline: 'none',
              }}
            />
          </div>

          {emailError && <div role="alert" style={{ fontSize: 11, color: 'var(--crit)', marginTop: -8 }}>{emailError}</div>}

          <DepartmentField value={departmentIds} onChange={setDepartmentIds} />

          <div>
            <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>
              Detection Types
            </div>
            <MultiSelect
              options={typeOptions}
              value={incidentIds}
              onChange={setIncidentIds}
              placeholder="Select detection types..."
              searchPlaceholder="Search detection types..."
              msg="No detection types found"
              inlinePanel
              closeOnSelectAll
            />
            <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 5 }}>
              Alerts of these types from every camera. With none picked, they only get alerts from detections they're selected on (Detections page).
            </div>
          </div>

          <DetectionSeverities typeOptions={typeOptions} incidentIds={incidentIds} value={severityByType} onChange={setSeverityByType} />
        </div>

        <div
          className="vq-recipients-modal-actions"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '15px 20px',
            borderTop: '1px solid var(--bd)',
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--tx2)',
              border: '1px solid var(--bd)',
              borderRadius: 9,
              padding: '9px 16px',
              cursor: 'pointer',
              background: 'none',
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 12.5,
              fontWeight: 600,
              color: '#fff',
              background: 'linear-gradient(135deg,var(--blue),var(--violet))',
              borderRadius: 9,
              padding: '9px 18px',
              cursor: saving ? 'wait' : 'pointer',
              border: 'none',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditRecipientModal({ recipient, detectionTypes, onClose, onUpdated }) {
  // A user's row takes its name, and its Camera Access departments, from the
  // Users page. Those can't be removed here; extra departments can be added.
  const isUser = Boolean(recipient.userId);
  const [fullName, setFullName] = useState(recipient.fullName || '');
  const [incidentIds, setIncidentIds] = useState(() => [
    ...new Set((Array.isArray(recipient.incidentTypes) ? recipient.incidentTypes : []).map(fromLegacyKey)),
  ]);
  const lockedDepartmentIds = (recipient.accessDepartmentIds || []).map(String);
  const lockedDepartmentNames = (recipient.departmentIds || [])
    .filter((d) => d && lockedDepartmentIds.includes(String(d._id ?? d)))
    .map((d) => d.departmentName)
    .filter(Boolean)
    .join(', ');
  const [departmentIds, setDepartmentIds] = useState(() => (recipient.departmentIds || [])
    .filter(Boolean)
    .map((d) => String(d?._id ?? d))
    .filter((id) => !lockedDepartmentIds.includes(id)));
  const [severityByType, setSeverityByType] = useState(() => Object.fromEntries(
    Object.entries(recipient.severityByType || {}).map(([type, list]) => [fromLegacyKey(type), list]),
  ));
  const [saving, setSaving] = useState(false);
  const originalIncidentIds = (Array.isArray(recipient.incidentTypes) ? recipient.incidentTypes : []).map(fromLegacyKey);
  const originalDepartmentIds = (recipient.departmentIds || [])
    .filter(Boolean)
    .map((department) => String(department?._id ?? department))
    .filter((id) => !lockedDepartmentIds.includes(id));
  const originalSeverityByType = Object.fromEntries(
    Object.entries(recipient.severityByType || {}).map(([type, list]) => [fromLegacyKey(type), list]),
  );
  const hasChanges =
    (!isUser && fullName.trim() !== (recipient.fullName || '').trim()) ||
    !sameIds(incidentIds, originalIncidentIds) ||
    !sameIds(departmentIds, originalDepartmentIds) ||
    normalizeSeveritySettings(incidentIds, severityByType) !==
      normalizeSeveritySettings(originalIncidentIds, originalSeverityByType);

  const typeOptions = useMemo(
    () =>
      Object.entries(detectionTypes).map(([key, label]) => ({
        id: toIncidentKey(key),
        label,
      })),
    [detectionTypes],
  );

  async function submit() {
    if (saving || !hasChanges) return;
    if (!isUser) {
      if (!fullName.trim()) {
        toast.error('Full name is required');
        return;
      }
      if (!NAME_RE.test(fullName.trim())) {
        toast.error('Full name must contain only letters and spaces');
        return;
      }
    }
    setSaving(true);
    try {
      const response = await updateRecipient(recipient._id, {
        incidentTypes: incidentIds,
        departmentIds,
        ...(isUser ? {} : { fullName: fullName.trim() }),
        severityByType: severityPayload(incidentIds, severityByType),
      });
      if (response?.status === 'success' || response?.statusCode === 200) {
        toast.success(response?.message || 'Recipient updated successfully');
        onUpdated();
        onClose();
      } else {
        toast.error(response?.message || 'Something went wrong');
      }
    } catch (error) {
      toast.error(error?.response?.data?.body?.message || 'Failed to update recipient');
    } finally {
      setSaving(false);
    }
  }

  const readOnlyField = (label, val) => (
    <div>
      <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>{label}</div>
      <div
        style={{
          width: '100%',
          boxSizing: 'border-box',
          minHeight: 38,
          padding: '9px 12px',
          borderRadius: 9,
          background: 'var(--bg1)',
          border: '1px solid var(--bd)',
          fontSize: 12.5,
          color: 'var(--tx2)',
          wordBreak: 'break-all',
        }}
      >
        {val || '-'}
      </div>
    </div>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(6,8,13,.62)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        className="vq-recipients-modal"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 440,
          maxWidth: '100%',
          // Never taller than the window: the body scrolls, header and buttons stay put.
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg1solid)',
          border: '1px solid var(--bd2)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 18px 50px rgba(0,0,0,.35)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--bd)',
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15.5 }}>
              Edit Notification Recipient
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>
              Update the alert types this recipient is notified for
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: '1px solid var(--bd)',
              color: 'var(--tx3)',
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div
          className="vq-recipients-modal-body"
          style={{ overflowY: 'auto', minHeight: 0, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {isUser ? readOnlyField('Full Name', recipient.fullName) : (
          <div>
            <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>Full Name</div>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="e.g. John Doe"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                height: 38,
                padding: '0 12px',
                borderRadius: 9,
                background: 'var(--bg2)',
                border: '1px solid var(--bd)',
                fontSize: 12.5,
                color: 'var(--tx)',
                outline: 'none',
              }}
            />
          </div>
          )}
          {readOnlyField('Email Address', recipient.value)}

          {isUser && readOnlyField('Departments from Camera Access (Users page)', lockedDepartmentNames || 'None')}
          <DepartmentField
            label={isUser ? 'More departments' : 'Departments'}
            value={departmentIds}
            onChange={setDepartmentIds}
            exclude={lockedDepartmentIds}
          />

          <div>
            <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>
              Detection Types
            </div>
            <MultiSelect
              options={typeOptions}
              value={incidentIds}
              onChange={setIncidentIds}
              placeholder="Select detection types..."
              searchPlaceholder="Search detection types..."
              msg="No detection types found"
              inlinePanel
              closeOnSelectAll
            />
            <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 5 }}>
              Alerts of these types from every camera. With none picked, they only get alerts from detections they're selected on (Detections page).
            </div>
          </div>

          <DetectionSeverities typeOptions={typeOptions} incidentIds={incidentIds} value={severityByType} onChange={setSeverityByType} />
        </div>

        <div
          className="vq-recipients-modal-actions"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '15px 20px',
            borderTop: '1px solid var(--bd)',
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--tx2)',
              border: '1px solid var(--bd)',
              borderRadius: 9,
              padding: '9px 16px',
              cursor: 'pointer',
              background: 'none',
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !hasChanges}
            title={!hasChanges ? 'No changes to save' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 12.5,
              fontWeight: 600,
              color: '#fff',
              background: 'linear-gradient(135deg,var(--blue),var(--violet))',
              borderRadius: 9,
              padding: '9px 18px',
              cursor: saving ? 'wait' : hasChanges ? 'pointer' : 'not-allowed',
              border: 'none',
              opacity: saving || !hasChanges ? 0.55 : 1,
            }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Desktop table: NAME · EMAIL ID · DEPARTMENT · STATUS · ACTION.
const RECIPIENT_COLS = '1.3fr 1.5fr 1fr .8fr 84px';

// Rows linked to a login user: name and email come from the Users page,
// and the row is removed with the user, not from here.
function UserBadge({ recipient }) {
  if (!recipient.userId) return null;
  return (
    <span
      title="Linked to a user. Name, email and Camera Access departments follow the Users page."
      style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, fontSize: 10, fontWeight: 600, color: 'var(--blue)', background: 'rgba(59,130,246,.12)', verticalAlign: 'middle' }}
    >
      User
    </span>
  );
}

function RecipientRow({ recipient, canEdit, canDelete, onVerify, onEdit, onDelete }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: RECIPIENT_COLS,
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderBottom: '1px solid var(--bd)',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}
      >
        <Avatar name={recipient.fullName} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--tx)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {recipient.fullName || '-'}
            <UserBadge recipient={recipient} />
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: 12,
          color: 'var(--tx2)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {recipient.value}
      </div>

      <div title={departmentTitle(recipient)} style={{ fontSize: 12, color: hasDepartments(recipient) ? 'var(--tx2)' : 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {departmentLabel(recipient)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {recipient.verified ? (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 10.5,
              fontWeight: 600,
              color: 'var(--ok)',
              border: '1px solid var(--ok)',
              borderRadius: 20,
              padding: '3px 9px',
              whiteSpace: 'nowrap',
            }}
          >
            Verified
          </span>
        ) : canEdit ? (
          <button
            onClick={onVerify}
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: '#fff',
              background: 'var(--blue)',
              border: 'none',
              borderRadius: 20,
              padding: '4px 10px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Verify
          </button>
        ) : (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: 'var(--warn)',
              border: '1px solid var(--warn)',
              borderRadius: 20,
              padding: '3px 9px',
              whiteSpace: 'nowrap',
            }}
          >
            Unverified
          </span>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
        {canEdit && (
          <button
            onClick={onEdit}
            title="Edit recipient"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: '1px solid var(--bd)',
              color: 'var(--tx2)',
              cursor: 'pointer',
            }}
          >
            <Pencil size={13} />
          </button>
        )}
        {canDelete && !recipient.userId && (
          <button
            onClick={onDelete}
            title="Delete recipient"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: '1px solid rgba(255,77,77,.4)',
              color: 'var(--crit)',
              cursor: 'pointer',
            }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function RecipientMobileCard({ recipient, canEdit, canDelete, onVerify, onEdit, onDelete }) {
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
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--tx)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {recipient.fullName || '-'}
            <UserBadge recipient={recipient} />
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 11.5,
              color: 'var(--tx3)',
              overflowWrap: 'anywhere',
            }}
          >
            {recipient.value}
          </div>
          {hasDepartments(recipient) && (
            <div style={{ marginTop: 2, fontSize: 11, color: 'var(--tx3)' }}>{departmentTitle(recipient)}</div>
          )}
        </div>

        {canEdit && (
          <button
            onClick={onEdit}
            title="Edit recipient"
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg1)',
              border: '1px solid var(--bd)',
              color: 'var(--tx2)',
              cursor: 'pointer',
              flex: '0 0 auto',
            }}
          >
            <Pencil size={13} />
          </button>
        )}
        {canDelete && !recipient.userId && (
          <button
            onClick={onDelete}
            title="Delete recipient"
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg1)',
              border: '1px solid rgba(255,77,77,.4)',
              color: 'var(--crit)',
              cursor: 'pointer',
              flex: '0 0 auto',
            }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {recipient.verified ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: 10.5,
              fontWeight: 700,
              color: 'var(--ok)',
              border: '1px solid var(--ok)',
              borderRadius: 20,
              padding: '4px 10px',
            }}
          >
            Verified
          </span>
        ) : canEdit ? (
          <button
            onClick={onVerify}
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: '#fff',
              background: 'var(--blue)',
              border: 'none',
              borderRadius: 20,
              padding: '5px 11px',
              cursor: 'pointer',
            }}
          >
            Verify
          </button>
        ) : (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: 'var(--warn)',
              border: '1px solid var(--warn)',
              borderRadius: 20,
              padding: '4px 10px',
            }}
          >
            Unverified
          </span>
        )}
      </div>
    </div>
  );
}

function formatTelegramDateTime(value) {
  return formatUtcInConfiguredTimezone(value, 'DD MMM YYYY, hh:mm A', '-');
}

function TelegramChannelRow({
  channel,
  index,
  unlinkingChatId,
  onDisconnect,
}) {
  const displayName =
    channel.channelName ||
    channel.channelTitle ||
    channel.channelUsername ||
    channel.chatId ||
    `Channel ${index + 1}`;
  const isConnected = channel.active !== false;
  const isUnlinking = unlinkingChatId === channel.chatId;
  const connectedAt = formatTelegramDateTime(channel.linkedAt);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 1.2fr .8fr 1fr 120px',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderBottom: '1px solid var(--bd)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Avatar name={displayName} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--tx)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={displayName}
          >
            {displayName}
          </div>
          <div
            style={{
              marginTop: 3,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: isConnected ? 'var(--ok)' : 'var(--tx3)',
              fontWeight: 600,
              fontSize: 11,
            }}
          >
            <CheckCircle2 size={13} /> Connected
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: 12,
          color: 'var(--tx2)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={channel.chatId || '-'}
      >
        {channel.chatId || '-'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: 10.5,
            fontWeight: 700,
            color: 'var(--ok)',
            border: '1px solid var(--ok)',
            borderRadius: 20,
            padding: '4px 10px',
          }}
        >
          Connected
        </span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--tx2)' }}>{connectedAt}</div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={() => onDisconnect(channel)}
          disabled={isUnlinking}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--crit)',
            background: 'none',
            border: '1px solid rgba(255,77,77,.4)',
            borderRadius: 9,
            padding: '8px 12px',
            cursor: isUnlinking ? 'wait' : 'pointer',
            opacity: isUnlinking ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {isUnlinking && <Loader2 size={13} className="animate-spin" />}
          Disconnect
        </button>
      </div>
    </div>
  );
}

function TelegramChannelMobileCard({
  channel,
  index,
  unlinkingChatId,
  onDisconnect,
}) {
  const displayName =
    channel.channelName ||
    channel.channelTitle ||
    channel.channelUsername ||
    channel.chatId ||
    `Channel ${index + 1}`;
  const isConnected = channel.active !== false;
  const isUnlinking = unlinkingChatId === channel.chatId;

  return (
    <div
      style={{
        border: '1px solid var(--bd)',
        borderRadius: 14,
        background: 'var(--bg2)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
        <Avatar name={displayName} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--tx)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={displayName}
          >
            {displayName}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 11.5,
              color: 'var(--tx3)',
              overflowWrap: 'anywhere',
            }}
          >
            {channel.chatId || '-'}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.07em', color: 'var(--tx3)' }}>
            STATUS
          </div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: isConnected ? 'var(--ok)' : 'var(--tx3)', fontWeight: 600 }}>
            Connected
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.07em', color: 'var(--tx3)' }}>
            CONNECTED AT
          </div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--tx2)' }}>
            {formatTelegramDateTime(channel.linkedAt)}
          </div>
        </div>
      </div>

      <div>
        <button
          onClick={() => onDisconnect(channel)}
          disabled={isUnlinking}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--crit)',
            background: 'none',
            border: '1px solid rgba(255,77,77,.4)',
            borderRadius: 9,
            padding: '9px 14px',
            cursor: isUnlinking ? 'wait' : 'pointer',
            opacity: isUnlinking ? 0.6 : 1,
          }}
        >
          {isUnlinking && <Loader2 size={13} className="animate-spin" />}
          Disconnect
        </button>
      </div>
    </div>
  );
}

export default function AlertRecipients() {
  const { permissions } = usePermissions();
  const canView = permissions?.recipients?.view ?? true;
  const canCreate = permissions?.recipients?.create ?? true;
  const canEdit = permissions?.recipients?.edit ?? true;
  const canDelete = permissions?.recipients?.delete ?? true;

  const [activeView, setActiveView] = useState('email');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [emailPage, setEmailPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState(null);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [telegramUnlinkingChatId, setTelegramUnlinkingChatId] = useState(null);
  const [telegramDisconnectTarget, setTelegramDisconnectTarget] = useState(null);
  const [telegramSearch, setTelegramSearch] = useState('');
  const [telegramPage, setTelegramPage] = useState(1);
  const debounceRef = useRef(null);
  const telegramSetupRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const recipientsApi = useApi(
    () => getRecipients('email', debouncedSearch, statusFilter),
    [debouncedSearch, statusFilter],
  );

  // Verification happens from the link in the email (another tab, or the
  // recipient's own device). The server announces it on
  // recipientVerified_<adminId>, so the row flips to Verified at once; the list
  // is re-read quietly (no spinner) so counts and the status filter stay right.
  const refetchRecipients = recipientsApi.refetch;
  const { socket } = useSocket() || {};
  const { user } = useAuth();
  useEffect(() => {
    const adminId = user?.adminId;
    if (!socket || !adminId) return undefined;
    const onVerified = () => refetchRecipients({ silent: true });
    socket.on(`recipientVerified_${adminId}`, onVerified);
    return () => socket.off(`recipientVerified_${adminId}`, onVerified);
  }, [socket, user?.adminId, refetchRecipients]);

  // Fallback for a dropped socket: while anyone is pending, re-check on
  // returning to this tab.
  const hasPending = Array.isArray(recipientsApi.data) && recipientsApi.data.some((r) => !r.verified);
  useEffect(() => {
    if (!hasPending) return undefined;
    const refresh = () => refetchRecipients({ silent: true });
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, [hasPending, refetchRecipients]);
  const typesApi = useApi(() => getDetectionTypes(), []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setTelegramLoading(true);
      const data = await getTelegramLinkCode();
      if (!mounted) return;
      setTelegramStatus(data);
      setTelegramLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const recipients = Array.isArray(recipientsApi.data) ? recipientsApi.data : [];
  const detectionTypes = typesApi.data || {};
  const verifiedCount = recipients.filter((recipient) => recipient.verified).length;
  const emailTotalPages = Math.max(1, Math.ceil(recipients.length / EMAIL_RECIPIENTS_PER_PAGE));
  const currentEmailPage = Math.min(emailPage, emailTotalPages);
  const paginatedRecipients = recipients.slice(
    (currentEmailPage - 1) * EMAIL_RECIPIENTS_PER_PAGE,
    currentEmailPage * EMAIL_RECIPIENTS_PER_PAGE,
  );

  useEffect(() => {
    setEmailPage(1);
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    if (emailPage > emailTotalPages) setEmailPage(emailTotalPages);
  }, [emailPage, emailTotalPages]);

  const linkedTelegramChannels = telegramStatus?.linkedChannels?.length
    ? telegramStatus.linkedChannels.filter((channel) => channel?.active !== false)
    : telegramStatus?.linked
      ? [
          {
            chatId: telegramStatus.chatId,
            channelName: telegramStatus.channelName,
            channelTitle: telegramStatus.channelTitle,
            channelUsername: telegramStatus.channelUsername,
            chatType: telegramStatus.chatType,
          },
        ]
      : [];

  const filteredTelegramChannels = linkedTelegramChannels.filter((channel) => {
    const haystack = [
      channel.channelName,
      channel.channelTitle,
      channel.channelUsername,
      channel.chatId,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const searchMatches =
      !telegramSearch.trim() ||
      haystack.includes(telegramSearch.trim().toLowerCase());

    return searchMatches;
  });

  const telegramTotalPages = Math.max(
    1,
    Math.ceil(filteredTelegramChannels.length / TELEGRAM_CHANNELS_PER_PAGE),
  );
  const paginatedTelegramChannels = filteredTelegramChannels.slice(
    (telegramPage - 1) * TELEGRAM_CHANNELS_PER_PAGE,
    telegramPage * TELEGRAM_CHANNELS_PER_PAGE,
  );

  useEffect(() => {
    setTelegramPage(1);
  }, [telegramSearch]);

  useEffect(() => {
    if (telegramPage > telegramTotalPages) {
      setTelegramPage(telegramTotalPages);
    }
  }, [telegramPage, telegramTotalPages]);

  async function reloadTelegramStatus() {
    setTelegramLoading(true);
    const data = await getTelegramLinkCode();
    setTelegramStatus(data);
    setTelegramLoading(false);
    return data;
  }

  async function handleVerify(recipient) {
    try {
      const result = await resendVerification({
        id: recipient._id,
        type: 'email',
        value: recipient.value,
      });
      if (result?.status === 'success') {
        toast.success(result?.message || 'A verification link has been sent');
      } else {
        toast.error(result?.message || 'Failed to send verification link');
      }
    } catch (error) {
      toast.error(
        error?.response?.data?.body?.message || 'Failed to send verification link',
      );
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
    } catch (error) {
      toast.error(error?.response?.data?.body?.message || 'Failed to delete recipient');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  function requestTelegramDisconnect(channel) {
    setTelegramDisconnectTarget(channel);
  }

  async function confirmTelegramDisconnect() {
    if (!telegramDisconnectTarget) return;

    const chatId = telegramDisconnectTarget.chatId;
    setTelegramUnlinkingChatId(chatId);
    try {
      const result = await unlinkTelegram(chatId);
      if (result?.statusCode === 200 || result?.body?.status === 'success') {
        toast.success('Telegram channel disconnected');
        await reloadTelegramStatus();
      } else {
        toast.error(result?.body?.message || 'Failed to disconnect');
      }
    } catch (error) {
      toast.error(error?.response?.data?.body?.message || 'Failed to disconnect');
    } finally {
      setTelegramUnlinkingChatId(null);
      setTelegramDisconnectTarget(null);
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
    <div
      className="vq-recipients-page"
      style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}
    >
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
          .vq-recipients-mode-toggle {
            width: 100% !important;
          }
          .vq-recipients-mode-toggle button {
            flex: 1 1 0 !important;
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

      <div
        className="vq-recipients-mode-toggle"
        style={{
          display: 'inline-flex',
          gap: 4,
          background: 'var(--bg2)',
          border: '1px solid var(--bd)',
          borderRadius: 10,
          padding: 4,
          width: 'fit-content',
          maxWidth: '100%',
        }}
      >
        {RECIPIENT_VIEWS.map((view) => (
          <button
            key={view.key}
            onClick={() => setActiveView(view.key)}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: 700,
              background:
                activeView === view.key
                  ? 'linear-gradient(135deg,var(--blue),var(--violet))'
                  : 'transparent',
              color: activeView === view.key ? '#fff' : 'var(--tx2)',
            }}
          >
            {view.label}
          </button>
        ))}
      </div>

      {activeView === 'telegram' && (
        <div ref={telegramSetupRef}>
          <TelegramAlerts
            showConnectedChannels={false}
            initiallyExpanded={true}
            onStatusChange={setTelegramStatus}
          />
        </div>
      )}

      {activeView === 'email' ? (
        <>
          <div
            className="vq-recipients-toolbar"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div
              className="vq-recipients-search"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                height: 36,
                padding: '0 12px',
                borderRadius: 9,
                background: 'var(--bg2)',
                border: '1px solid var(--bd)',
                minWidth: 220,
              }}
            >
              <Search size={14} style={{ color: 'var(--tx3)', flexShrink: 0 }} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search recipients..."
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 0,
                  outline: 'none',
                  color: 'var(--tx)',
                  fontSize: 12.5,
                }}
              />
            </div>

            <div
              className="vq-recipients-status"
              style={{
                display: 'flex',
                gap: 4,
                background: 'var(--bg2)',
                border: '1px solid var(--bd)',
                borderRadius: 9,
                padding: 3,
              }}
            >
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setStatusFilter(filter.key)}
                  style={{
                    padding: '6px 13px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    background:
                      statusFilter === filter.key ? 'var(--blue)' : 'transparent',
                    color: statusFilter === filter.key ? '#fff' : 'var(--tx2)',
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="vq-recipients-spacer" style={{ flex: 1 }} />

            {canCreate && (
              <button
                className="vq-recipients-add"
                onClick={() => setShowAddModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#fff',
                  background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                  borderRadius: 9,
                  padding: '9px 16px',
                  cursor: 'pointer',
                  border: 'none',
                  boxShadow: '0 0 14px rgba(99,102,241,.3)',
                }}
              >
                <Plus size={14} /> Add New
              </button>
            )}
          </div>

          <div
            style={{
              background: 'var(--bg1)',
              border: '1px solid var(--bd)',
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            <div
              className="vq-recipients-panel-head"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderBottom: '1px solid var(--bd)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--disp)',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                All Email Recipients
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>
                {verifiedCount} verified · {recipients.length - verifiedCount} pending
              </span>
            </div>

            <div className="vq-recipients-desktop">
              <HScrollHint minWidth={920} fadeColor="var(--bg1)">
                <div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: RECIPIENT_COLS,
                      gap: 12,
                      padding: '10px 16px',
                      borderBottom: '1px solid var(--bd)',
                      fontFamily: 'var(--mono)',
                      fontSize: 9.5,
                      letterSpacing: '.07em',
                      color: 'var(--tx3)',
                    }}
                  >
                    <span>NAME</span>
                    <span>EMAIL ID</span>
                    <span>DEPARTMENT</span>
                    <span>STATUS</span>
                    <span style={{ textAlign: 'center' }}>ACTION</span>
                  </div>

                  <AsyncBoundary
                    loading={recipientsApi.loading}
                    error={recipientsApi.error}
                    isEmpty={
                      !recipientsApi.loading &&
                      !recipientsApi.error &&
                      recipients.length === 0
                    }
                    onRetry={recipientsApi.refetch}
                    minH={160}
                    emptyLabel={
                      search
                        ? `No results found for "${search}"`
                        : 'No recipients added yet'
                    }
                  >
                    {() =>
                      paginatedRecipients.map((recipient) => (
                        <RecipientRow
                          key={recipient._id}
                          recipient={recipient}
                          canEdit={canEdit}
                          canDelete={canDelete}
                          onVerify={() => handleVerify(recipient)}
                          onEdit={() => setEditTarget(recipient)}
                          onDelete={() => setDeleteTarget(recipient)}
                        />
                      ))
                    }
                  </AsyncBoundary>
                </div>
              </HScrollHint>
            </div>

            <div
              className="vq-recipients-mobile"
              style={{ display: 'none', flexDirection: 'column', gap: 10, padding: 12 }}
            >
              <AsyncBoundary
                loading={recipientsApi.loading}
                error={recipientsApi.error}
                isEmpty={
                  !recipientsApi.loading &&
                  !recipientsApi.error &&
                  recipients.length === 0
                }
                onRetry={recipientsApi.refetch}
                minH={160}
                emptyLabel={
                  search
                    ? `No results found for "${search}"`
                    : 'No recipients added yet'
                }
              >
                {() =>
                  paginatedRecipients.map((recipient) => (
                    <RecipientMobileCard
                      key={recipient._id}
                      recipient={recipient}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      onVerify={() => handleVerify(recipient)}
                      onEdit={() => setEditTarget(recipient)}
                      onDelete={() => setDeleteTarget(recipient)}
                    />
                  ))
                }
              </AsyncBoundary>
            </div>
          </div>
          {!recipientsApi.loading && !recipientsApi.error && recipients.length > EMAIL_RECIPIENTS_PER_PAGE && (
            <Pagination
              currentPage={currentEmailPage}
              totalPages={emailTotalPages}
              onPageChange={setEmailPage}
            />
          )}
        </>
      ) : (
        <>
          <div
            className="vq-recipients-toolbar"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div
              className="vq-recipients-search"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                height: 36,
                padding: '0 12px',
                borderRadius: 9,
                background: 'var(--bg2)',
                border: '1px solid var(--bd)',
                minWidth: 220,
              }}
            >
              <Search size={14} style={{ color: 'var(--tx3)', flexShrink: 0 }} />
              <input
                value={telegramSearch}
                onChange={(event) => setTelegramSearch(event.target.value)}
                placeholder="Search by channel name..."
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 0,
                  outline: 'none',
                  color: 'var(--tx)',
                  fontSize: 12.5,
                }}
              />
            </div>

          </div>

          <div
            style={{
              background: 'var(--bg1)',
              border: '1px solid var(--bd)',
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
          <div
            className="vq-recipients-panel-head"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: '1px solid var(--bd)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--disp)',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Connected Telegram Channels
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)' }}>
              {filteredTelegramChannels.length} shown · {linkedTelegramChannels.length} connected
            </span>
          </div>

          <div style={{ padding: 16 }}>
            <AsyncBoundary
              loading={telegramLoading}
              error={null}
              isEmpty={!telegramLoading && filteredTelegramChannels.length === 0}
              onRetry={reloadTelegramStatus}
              minH={180}
              emptyLabel={
                telegramSearch.trim()
                  ? 'No Telegram channels match the selected filters'
                  : 'No Telegram channels found yet'
              }
            >
              {() => (
                <>
                  <div className="vq-recipients-desktop">
                    <HScrollHint minWidth={1080} fadeColor="var(--bg1)">
                      <div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1.2fr 1.2fr .8fr 1fr 120px',
                            padding: '10px 16px',
                            borderBottom: '1px solid var(--bd)',
                            fontFamily: 'var(--mono)',
                            fontSize: 9.5,
                            letterSpacing: '.07em',
                            color: 'var(--tx3)',
                          }}
                        >
                          <span>CHANNEL NAME</span>
                          <span>CHANNEL ID</span>
                          <span>STATUS</span>
                          <span>CONNECTED AT</span>
                          <span style={{ textAlign: 'center' }}>ACTION</span>
                        </div>

                        {paginatedTelegramChannels.map((channel, index) => (
                          <TelegramChannelRow
                            key={
                              channel.chatId ||
                              `telegram-linked-${
                                (telegramPage - 1) * TELEGRAM_CHANNELS_PER_PAGE + index
                              }`
                            }
                            channel={channel}
                            index={
                              (telegramPage - 1) * TELEGRAM_CHANNELS_PER_PAGE + index
                            }
                            unlinkingChatId={telegramUnlinkingChatId}
                            onDisconnect={requestTelegramDisconnect}
                          />
                        ))}
                      </div>
                    </HScrollHint>
                  </div>

                  <div
                    className="vq-recipients-mobile"
                    style={{ display: 'none', flexDirection: 'column', gap: 10 }}
                  >
                    {paginatedTelegramChannels.map((channel, index) => (
                      <TelegramChannelMobileCard
                        key={
                          channel.chatId ||
                          `telegram-linked-mobile-${
                            (telegramPage - 1) * TELEGRAM_CHANNELS_PER_PAGE + index
                          }`
                        }
                        channel={channel}
                        index={
                          (telegramPage - 1) * TELEGRAM_CHANNELS_PER_PAGE + index
                        }
                        unlinkingChatId={telegramUnlinkingChatId}
                        onDisconnect={requestTelegramDisconnect}
                      />
                    ))}
                  </div>
                </>
              )}
            </AsyncBoundary>
            {!telegramLoading &&
              filteredTelegramChannels.length > TELEGRAM_CHANNELS_PER_PAGE && (
                <Pagination
                  currentPage={telegramPage}
                  totalPages={telegramTotalPages}
                  onPageChange={setTelegramPage}
                  className="mt-6 flex justify-center"
                />
              )}
          </div>
          </div>
        </>
      )}

      {showAddModal && activeView === 'email' && (
        <AddRecipientModal
          detectionTypes={detectionTypes}
          onClose={() => setShowAddModal(false)}
          onCreated={recipientsApi.refetch}
        />
      )}

      {editTarget && activeView === 'email' && (
        <EditRecipientModal
          recipient={editTarget}
          detectionTypes={detectionTypes}
          onClose={() => setEditTarget(null)}
          onUpdated={recipientsApi.refetch}
        />
      )}

      <DeleteConfirmation
        open={!!deleteTarget}
        title="Delete Recipient"
        message={`Are you sure you want to delete ${
          deleteTarget?.fullName || deleteTarget?.value
        }? They will stop receiving alert notifications.`}
        icon={<BellRing className="w-6 h-6 text-red-500" />}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
      />

      <DeleteConfirmation
        open={!!telegramDisconnectTarget}
        title="Disconnect Telegram Channel"
        message={`Are you sure you want to disconnect ${
          telegramDisconnectTarget?.channelName ||
          telegramDisconnectTarget?.channelTitle ||
          telegramDisconnectTarget?.channelUsername ||
          telegramDisconnectTarget?.chatId
        }? It will stop receiving Telegram alerts. This action cannot be undone.`}
        icon={<BellRing className="w-6 h-6 text-red-500" />}
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        onClose={() => setTelegramDisconnectTarget(null)}
        onConfirm={confirmTelegramDisconnect}
        loading={telegramUnlinkingChatId === telegramDisconnectTarget?.chatId}
      />
    </div>
  );
}
