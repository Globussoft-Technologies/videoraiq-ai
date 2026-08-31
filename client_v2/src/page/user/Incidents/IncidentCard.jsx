import { useEffect, useRef, useState } from 'react';
import IncidentPreviewModal from './IncidentPreviewModal';
import { toast } from 'sonner';
import { PlayCircle, ImageOff, Maximize2, X, Flag, Check, UserPlus, UserCheck, UserMinus } from 'lucide-react';
import { detectionLabel, shortDateTime, mediaUrl } from '../../../lib/format';
import { taggedUserName, formatPlate, hasReadablePlate } from '../../../helpers/vehicleTagging';
import axios from 'axios';
import getAccessToken from '../../../utils/getAccessToken';

const SEV_COLOR = {
  high: '#ef4444', critical: '#ef4444',
  moderate: '#f59e0b', medium: '#f59e0b',
  low: '#6b7796',
};

// Explicit short labels — truncating with .slice(0, 4) turned the stored
// "moderate" into "MODE". Keyed the same way as SEV_COLOR; matches the "MED"
// badge Command Center's Latest Incident already shows.
const SEV_LABEL = {
  high: 'HIGH', critical: 'CRIT',
  moderate: 'MEDIUM', medium: 'MEDIUM',
  low: 'LOW',
};

/**
 * Plate + who it belongs to, for detections that carry a vehicle number
 * (Vehicle Detection and the other plate-bearing types). An untagged plate
 * offers Tag User so an admin can link it to a registered user at any time;
 * a detection with no readable plate renders nothing.
 *
 * Exported so the Incident Center lightbox shows exactly the same thing.
 */
export function VehicleTagStrip({ item, onTagUser, onUntagUser, onViewUser, variant = 'card', showPlate = true }) {
  if (!hasReadablePlate(item?.vehicleNumber)) return null;

  const dark = variant === 'lightbox';
  const plateStyle = dark
    ? { fontFamily: 'monospace', fontSize: 13, fontWeight: 700, letterSpacing: '.08em', color: '#fff', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.25)', padding: '3px 9px', borderRadius: 6 }
    : { fontFamily: 'var(--mono, monospace)', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--tx)', background: 'var(--bg2)', border: '1px solid var(--bd)', padding: '3px 8px', borderRadius: 6 };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
      {showPlate && <span style={plateStyle}>{formatPlate(item.vehicleNumber)}</span>}

      {item.taggedUser ? (
        <span style={{
          display: 'flex', alignItems: 'center', gap: 5, minWidth: 0,
          fontSize: dark ? 13 : 11.5,
          color: dark ? 'rgba(255,255,255,.85)' : 'var(--tx2)',
        }}>
          <UserCheck size={dark ? 14 : 12} color={dark ? '#34d399' : 'var(--ok)'} style={{ flexShrink: 0 }} />
          {/* The name opens the registered user's full details without leaving
              the Incident Center. */}
          {typeof onViewUser === 'function' ? (
            <button
              onClick={(e) => { e.stopPropagation(); onViewUser(item.taggedUser); }}
              title={`View ${taggedUserName(item.taggedUser)}'s details`}
              style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                font: 'inherit', color: 'inherit',
                textDecoration: 'underline dotted', textUnderlineOffset: 2,
              }}
            >
              {taggedUserName(item.taggedUser)}
            </button>
          ) : (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {taggedUserName(item.taggedUser)}
            </span>
          )}
          {typeof onUntagUser === 'function' && (
            <button
              onClick={(e) => { e.stopPropagation(); onUntagUser(item); }}
              title={`Untag ${taggedUserName(item.taggedUser)} from this vehicle`}
              aria-label="Untag user"
              style={{
                display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, cursor: 'pointer',
                marginLeft: 2,
                fontSize: dark ? 11.5 : 10.5, fontWeight: 600,
                padding: dark ? '4px 9px' : '2px 6px', borderRadius: 5,
                background: dark ? 'rgba(239,68,68,.18)' : 'transparent',
                border: `1px solid ${dark ? 'rgba(239,68,68,.45)' : 'var(--bd2)'}`,
                color: dark ? '#f87171' : 'var(--tx3)',
              }}
            >
              <UserMinus size={dark ? 12 : 11} />
              Untag
            </button>
          )}
        </span>
      ) : typeof onTagUser === 'function' ? (
        <button
          onClick={(e) => { e.stopPropagation(); onTagUser(item); }}
          title="Tag this vehicle number to a registered user"
          style={{
            display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
            fontSize: dark ? 12 : 11, fontWeight: 600,
            padding: dark ? '5px 12px' : '3px 9px', borderRadius: 6,
            background: dark ? 'rgba(59,130,246,.2)' : 'transparent',
            border: `1px solid ${dark ? 'rgba(59,130,246,.5)' : 'var(--bd2)'}`,
            color: dark ? '#60a5fa' : 'var(--blue)',
            transition: 'background .15s',
          }}
        >
          <UserPlus size={dark ? 13 : 12} />
          Tag User
        </button>
      ) : (
        <span style={{ fontSize: 11.5, color: dark ? 'rgba(255,255,255,.5)' : 'var(--tx3)' }}>
          Not tagged
        </span>
      )}
    </div>
  );
}

function statusOf(item) {
  if (item.resolved) return { label: 'Resolved', color: 'var(--ok)' };
  if (item.report?.status === true) return { label: 'Reported', color: 'var(--warn)' };
  return { label: 'New', color: 'var(--crit)' };
}

export async function apiMarkResolved(id, incidentType, resolved) {
  const token = getAccessToken();
  const res = await axios.put(
    `${import.meta.env.VITE_BACKEND}/incidents/${id}`,
    { resolved, incidentType },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return res?.data?.body;
}

async function apiReport(incidentId, description) {
  const token = getAccessToken();
  const res = await axios.post(
    `${import.meta.env.VITE_BACKEND}/incidents/update-report-status`,
    { incidentId, status: true, description },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return res?.data?.body;
}

/* ── Report modal ─────────────────────────────────────────────────────────── */
export function ReportModal({ item, onClose, onSuccess }) {
  // Reported status alone means "already reported" — description can be
  // empty (report.description defaults to "" server-side), and that must
  // still show the "already reported" view, not the blank write form.
  const existing     = item.report?.status ? item.report : null;
  const [desc, setDesc]       = useState(existing?.description || '');
  const [editing, setEditing] = useState(!existing);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');

  async function submit() {
    if (!desc.trim()) { setErr('Please enter a description'); return; }
    setLoading(true); setErr('');
    try {
      await apiReport(item._id || item.id, desc.trim());
      onSuccess?.();
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.body?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: 16, boxSizing: 'border-box' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(420px, 92vw)', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', background: 'var(--bg1solid)', border: '1px solid var(--bd)', borderRadius: 14, padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>Report Incident</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {existing && !editing && (
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ok)', background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 20, padding: '3px 10px' }}>
                ✓ Reported
              </span>
            )}
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--bd)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--tx3)' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* View existing report */}
        {existing && !editing ? (
          <>
            <div style={{ background: 'rgba(34,197,94,.07)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 10, padding: '14px', marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ok)', marginBottom: 8 }}>Report Status: Completed</div>
              <div style={{ fontSize: 13, color: existing.description ? 'var(--tx2)' : 'var(--tx3)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {existing.description || 'No description provided.'}
              </div>
              {existing.reportedAt && (
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 10 }}>
                  Submitted on {new Date(existing.reportedAt).toLocaleString()}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button onClick={onClose} style={btnStyle('secondary')}>Close</button>
              <button onClick={() => setEditing(true)} style={btnStyle('outline-blue')}>Edit Report</button>
            </div>
          </>
        ) : (
          /* Write/edit report */
          <>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx2)', display: 'block', marginBottom: 7 }}>Description</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Describe the incident and actions taken..."
              rows={4}
              style={{
                width: '100%', boxSizing: 'border-box',
                borderRadius: 10, border: '1px solid var(--bd2)',
                background: 'var(--bg2)', color: 'var(--tx)',
                fontSize: 13, padding: '10px 12px',
                resize: 'vertical', outline: 'none',
                fontFamily: 'inherit', lineHeight: 1.55,
              }}
            />
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 5, marginBottom: 14 }}>
              Provide details about the incident and any actions taken.
            </div>
            {err && <div style={{ fontSize: 12, color: 'var(--crit)', marginBottom: 10 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => { if (editing && existing) { setEditing(false); setDesc(existing.description); } else onClose(); }}
                style={btnStyle('secondary')}
                disabled={loading}
              >
                {editing && existing ? 'Cancel' : 'Close'}
              </button>
              <button onClick={submit} style={btnStyle('primary')} disabled={loading}>
                {loading ? 'Reporting…' : 'Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function btnStyle(variant) {
  const base = { fontSize: 13, fontWeight: 600, borderRadius: 8, padding: '7px 18px', cursor: 'pointer', border: '1px solid transparent', transition: 'all .15s' };
  if (variant === 'primary')      return { ...base, background: 'var(--blue)', color: '#fff', border: '1px solid var(--blue)' };
  if (variant === 'outline-blue') return { ...base, background: 'transparent', color: 'var(--blue)', border: '1px solid var(--blue)' };
  return { ...base, background: 'var(--bg2)', color: 'var(--tx2)', border: '1px solid var(--bd)' };
}

/* Inline spinner — `vq-spin` keyframes live in theme/tokens.css, so this works
   anywhere the card is rendered. */
function Spinner({ size = 14, color = '#fff' }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
        border: `2px solid ${color}`, borderTopColor: 'transparent',
        animation: 'vq-spin .7s linear infinite',
      }}
    />
  );
}

/* ── Card ─────────────────────────────────────────────────────────────────── */
export default function IncidentCard({ item, onClick, onRefresh, onResolvedChange, onOpenLightbox, onTagUser, onUntagUser, onViewUser, deleteMode, selectedForDelete, onToggleDelete }) {
  const [reportOpen,   setReportOpen]   = useState(false);
  const [previewOpen,  setPreviewOpen]  = useState(false);
  const [resolving,    setResolving]    = useState(false);
  const [localResolved, setLocalResolved] = useState(item.resolved || false);
  const [hover,        setHover]        = useState(false);
  // Short-lived confirmation after the request settles — { text, ok }. Matches
  // the lightbox's Mark As Resolved so both surfaces confirm the same way.
  const [saveFlash,    setSaveFlash]    = useState(null);
  const flashTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(flashTimerRef.current), []);
  useEffect(() => {
    setLocalResolved(!!item.resolved);
  }, [item._id, item.id, item.resolved]);

  const det      = detectionLabel(item.incidentType || item.displayName);
  const st       = statusOf({ ...item, resolved: localResolved });
  const cam      = item.channelData?.name || '';

  // Preview the recorded moment in place. channelData is the whole channel
  // document (the incidents aggregation $lookup does not project it down), so
  // the ids the playback API needs are all on it.
  const previewChannel = item.channelData || null;
  const previewChannelId = previewChannel?._id || item.channelId || null;
  const previewAt = item.timeOfIncident || null;
  const canPreview = Boolean(previewChannelId && previewAt);
  const site     = item.nvrData?.nvrName  || item.location  || '';
  const conf     = item.confidence ?? item.accuracy ?? item.score;
  const imgSrc   = item.Image ? mediaUrl(item.Image) : null;
  const sevKey   = (item.severity || '').toLowerCase();
  const sevColor = SEV_COLOR[sevKey] || '#6b7796';
  // Fall back to the raw value upper-cased (not truncated) for any severity the
  // map doesn't know, so a new backend value reads oddly rather than wrongly.
  const sevLabel = SEV_LABEL[sevKey] || (item.severity || 'LOW').toUpperCase();
  const reported = item.report?.status === true;

  // Car Model Detection cards surface the model name plus an identifier: the
  // vehicle number when one was read, otherwise the model year.
  const isCarModel =
    item.incidentType === 'carModelDetection' ||
    /car\s*model/i.test(item.incidentName || item.displayName || '');
  const carModelName = String(
    item.model_name || item.modelName || item.carModelName || item.carModel || ''
  ).trim();
  const carPlate = formatPlate(item.vehicleNumber);
  const carYear = String(item.year ?? '').trim();

  function handleCardClick() {
    if (deleteMode) { onToggleDelete?.(); return; }
    if (imgSrc) onOpenLightbox?.(item);
    onClick?.();
  }

  async function handleMarkResolved(e) {
    e.stopPropagation();
    if (resolving) return;
    clearTimeout(flashTimerRef.current);
    setSaveFlash(null);
    setResolving(true);
    try {
      const next = !localResolved;
      await apiMarkResolved(item._id || item.id, item.incidentType, next);
      setLocalResolved(next);
      onResolvedChange?.(item._id || item.id, next);
      setSaveFlash({ text: next ? 'Resolved' : 'Mark as resolved', ok: true });
      flashTimerRef.current = setTimeout(() => setSaveFlash(null), 2500);
    } catch (err) {
      // Previously failed silently, leaving the user to assume it worked;
      // surface the real reason (e.g. a permission error) as a toast.
      toast.error(err?.response?.data?.body?.message || 'Failed — retry');
    } finally {
      setResolving(false);
    }
  }

  return (
    <>
      {reportOpen && <ReportModal item={item} onClose={() => setReportOpen(false)} onSuccess={onRefresh} />}
      {previewOpen && (
        <IncidentPreviewModal
          item={item}
          channel={previewChannel}
          channelId={previewChannelId}
          at={previewAt}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      <div
        onClick={handleCardClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          background: 'var(--bg1solid)',
          border: `1px solid ${deleteMode && selectedForDelete ? 'var(--crit)' : 'var(--bd)'}`,
          boxShadow: deleteMode && selectedForDelete
            ? '0 0 0 2px rgba(239,68,68,.3), 0 4px 16px rgba(0,0,0,.14)'
            : hover ? '0 4px 16px rgba(0,0,0,.14)' : '0 1px 4px rgba(0,0,0,.06)',
          borderRadius: 12,
          overflow: 'hidden',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          transition: 'box-shadow .15s, border-color .15s',
          position: 'relative',
        }}
      >
        {/* Image area */}
        <div style={{ position: 'relative', aspectRatio: '16/9', background: '#111' }}>
          {imgSrc ? (
            <img src={imgSrc} alt={det} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)' }}>
              <ImageOff size={28} strokeWidth={1.4} />
            </div>
          )}

          {/* Delete-selection checkbox — replaces normal card interactions
              (lightbox/resolve/report) while deleteMode is active. Kept as a
              plain outlined square (no filled badge behind it) to match the
              simplified style used in client's IncidentCard. */}
          {deleteMode && (
            <div
              onClick={(e) => { e.stopPropagation(); onToggleDelete?.(); }}
              style={{
                position: 'absolute', top: 9, right: 9, zIndex: 10,
                width: 22, height: 22, borderRadius: 6,
                background: selectedForDelete ? 'var(--crit)' : 'transparent',
                border: `2px solid ${selectedForDelete ? 'var(--crit)' : '#fff'}`,
                boxShadow: '0 1px 4px rgba(0,0,0,.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'background .15s, border-color .15s',
              }}
            >
              {selectedForDelete && <Check size={14} color="#fff" strokeWidth={3} />}
            </div>
          )}

          {/* Top-left: mark-as-resolved (shown on hover). The detection-type
             badge lives bottom-left instead, so it never collides with the
             "Persons: N" / ID labels the engine bakes into the top of the frame. */}
          <div style={{ position: 'absolute', top: 9, left: 9, right: 9, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {/* Mark as resolved — normally hover-only, but stays mounted while a
                save is in flight or its confirmation is showing. Gating purely
                on `hover` meant moving the pointer off the card mid-request
                unmounted the button and took the spinner with it, so the action
                looked like it had done nothing. */}
            {(localResolved || hover || resolving || saveFlash) && (
              <button
                onClick={handleMarkResolved}
                disabled={resolving}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: saveFlash
                    ? (saveFlash.ok ? 'rgba(16,185,129,.85)' : 'rgba(239,68,68,.85)')
                    : 'rgba(0,0,0,.72)',
                  backdropFilter: 'blur(4px)',
                  border: `1px solid ${saveFlash ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.18)'}`,
                  borderRadius: 20, padding: '4px 10px 4px 7px',
                  cursor: resolving ? 'wait' : 'pointer',
                  color: '#fff', fontSize: 11, fontWeight: 500,
                  transition: 'background .2s',
                  maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                }}
              >
                {resolving ? (
                  <Spinner size={14} />
                ) : (
                  /* Checkbox-like indicator */
                  <span style={{
                    width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${localResolved ? 'var(--ok)' : 'rgba(255,255,255,.6)'}`,
                    background: localResolved ? 'var(--ok)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {localResolved && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                )}
                {resolving ? 'Saving…' : saveFlash ? saveFlash.text : localResolved ? 'Resolved' : 'Mark as resolved'}
              </button>
            )}
          </div>

          {/* Top-right: severity chip (moved aside in delete mode so it never
              collides with the selection checkbox in the same corner). */}
          <div style={{ position: 'absolute', top: 9, right: deleteMode ? 44 : 9, background: 'rgba(0,0,0,.55)', color: sevColor, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, backdropFilter: 'blur(4px)', border: `1px solid ${sevColor}` }}>
            {sevLabel}
          </div>

          {/* Bottom-left: detection type badge + timestamp */}
          <div style={{ position: 'absolute', bottom: 9, left: 9, maxWidth: 'calc(60% - 14px)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
            {/* Detection type badge (moved here to avoid the baked-in count/ID labels up top) */}
            <div style={{ background: sevColor, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, letterSpacing: '.3px', whiteSpace: 'nowrap', boxShadow: '0 1px 6px rgba(0,0,0,.55)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {det}
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 9.5, color: '#fff', background: 'rgba(0,0,0,.55)', padding: '2px 8px', borderRadius: 5, backdropFilter: 'blur(4px)', maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', boxSizing: 'border-box' }}>
              {shortDateTime(item.timeOfIncident)}
            </span>
          </div>

          {/* Bottom-right: confidence + Report button + expand. Both stay
              visible in delete mode; each stops propagation and calls its
              own handler directly, so they still work instead of the click
              being caught by the card's delete-mode toggle-selection handler. */}
          <div style={{ position: 'absolute', bottom: 9, right: 9, maxWidth: 'calc(50% - 14px)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, flexWrap: 'wrap' }}>
            {conf != null && (
              <span style={{ fontFamily: 'monospace', fontSize: 9.5, color: '#fff', background: 'rgba(0,0,0,.55)', padding: '2px 8px', borderRadius: 5, backdropFilter: 'blur(4px)' }}>
                {Math.round(conf)}%
              </span>
            )}

            <button
              onClick={e => { e.stopPropagation(); setReportOpen(true); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: reported ? 'rgba(34,197,94,.75)' : 'rgba(59,130,246,.8)',
                backdropFilter: 'blur(4px)',
                border: 'none', borderRadius: 5,
                color: '#fff', fontSize: 10, fontWeight: 600,
                padding: '3px 8px', cursor: 'pointer',
                transition: 'background .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = reported ? 'rgba(34,197,94,.95)' : 'rgba(59,130,246,.95)'}
              onMouseLeave={e => e.currentTarget.style.background = reported ? 'rgba(34,197,94,.75)' : 'rgba(59,130,246,.8)'}
            >
              <Flag size={10} />
              {reported ? 'Reported' : 'Report'}
            </button>

            {/* Expand / lightbox */}
            {imgSrc && (
              <span
                onClick={e => { e.stopPropagation(); onOpenLightbox?.(item); }}
                style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(0,0,0,.55)', border: '1px solid rgba(255,255,255,.25)', backdropFilter: 'blur(4px)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Maximize2 size={12} color="#fff" />
              </span>
            )}
          </div>
        </div>

        {/* Info row */}
        <div style={{ padding: '11px 13px 12px', display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          {isCarModel ? (
            <>
              {/* Title + Tag User on one row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                  {item.incidentName || det}
                </span>
                <VehicleTagStrip item={item} onTagUser={onTagUser} onUntagUser={onUntagUser} onViewUser={onViewUser} showPlate={false} />
              </div>
              {/* Aligned key/value list. With a plate: Model + Year share a
                  row, then Vehicle No. Without: just Model + Year. */}
              {(() => {
                const Cell = ({ label, value, mono, grow }) => (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flex: grow ? '1 1 0' : '0 0 auto' }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--tx3)', flexShrink: 0 }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', fontFamily: mono ? 'var(--mono, monospace)' : undefined, letterSpacing: mono ? '.05em' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {value}
                    </span>
                  </div>
                );
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    {carPlate ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                          <Cell label="Model Name" value={`${carModelName || '--'} ,`} />
                          <Cell label="Year" value={carYear || '--'} />
                        </div>
                        <Cell label="Vehicle No" value={carPlate} mono />
                      </>
                    ) : (
                      <>
                        <Cell label="Model Name" value={carModelName || '--'} />
                        <Cell label="Year" value={carYear || '--'} />
                      </>
                    )}
                  </div>
                );
              })()}
            </>
          ) : (
            <>
              {/* Plate + tagged user, for Vehicle Detection and friends. */}
              <VehicleTagStrip item={item} onTagUser={onTagUser} onUntagUser={onUntagUser} onViewUser={onViewUser} />
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                {item.incidentName || det}
              </div>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
            {isCarModel ? (
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flex: '1 1 auto' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--tx3)', flexShrink: 0 }}>Camera</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{cam || '--'}</span>
              </span>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '1 1 auto' }}>
                {cam}
              </span>
            )}
            {/* Opens Playback on this camera at the second the incident was
                recorded. Hidden rather than disabled when the incident carries
                no camera or timestamp — a dead control is worse than none. */}
            {canPreview && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setPreviewOpen(true); }}
                title={`Play the recorded moment — ${shortDateTime(item.timeOfIncident)}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  flex: '0 0 auto',
                  padding: '3px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--bd)',
                  background: 'transparent',
                  color: 'var(--blue)',
                  fontSize: 10.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <PlayCircle size={12} />
                Preview
              </button>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto', fontSize: 10.5, color: st.color, fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color }} />
              {st.label}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
