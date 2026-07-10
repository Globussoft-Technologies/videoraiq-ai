import { useState } from 'react';
import { ImageOff, Maximize2, X, Flag } from 'lucide-react';
import { detectionLabel, shortDateTime, mediaUrl } from '../../../lib/format';
import axios from 'axios';
import getAccessToken from '../../../utils/getAccessToken';

const SEV_COLOR = {
  high: '#ef4444', critical: '#ef4444',
  moderate: '#f59e0b', medium: '#f59e0b',
  low: '#6b7796',
};

function statusOf(item) {
  if (item.resolved) return { label: 'Resolved', color: 'var(--ok)' };
  if (item.report?.status === true) return { label: 'Reported', color: 'var(--warn)' };
  return { label: 'New', color: 'var(--crit)' };
}

async function apiMarkResolved(id, incidentType, resolved) {
  const token = getAccessToken();
  const res = await axios.put(
    `${import.meta.env.VITE_BACKEND}/api/v1/incidents/${id}`,
    { resolved, incidentType },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return res?.data?.body;
}

async function apiReport(incidentId, description) {
  const token = getAccessToken();
  const res = await axios.post(
    `${import.meta.env.VITE_BACKEND}/api/v1/incidents/update-report-status`,
    { incidentId, status: true, description },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return res?.data?.body;
}

/* ── Report modal ─────────────────────────────────────────────────────────── */
function ReportModal({ item, onClose, onSuccess }) {
  const existing     = item.report?.status && item.report?.description ? item.report : null;
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
              <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{existing.description}</div>
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
              <button onClick={submit} style={btnStyle('primary')} disabled={loading || !desc.trim()}>
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

/* ── Card ─────────────────────────────────────────────────────────────────── */
export default function IncidentCard({ item, onClick, onRefresh, onOpenLightbox }) {
  const [reportOpen,   setReportOpen]   = useState(false);
  const [resolving,    setResolving]    = useState(false);
  const [localResolved, setLocalResolved] = useState(item.resolved || false);
  const [hover,        setHover]        = useState(false);

  const det      = detectionLabel(item.incidentType || item.displayName);
  const st       = statusOf({ ...item, resolved: localResolved });
  const cam      = item.channelData?.name || item.cameraId || '';
  const site     = item.nvrData?.nvrName  || item.location  || '';
  const conf     = item.confidence ?? item.accuracy ?? item.score;
  const imgSrc   = item.Image ? mediaUrl(item.Image) : null;
  const sevColor = SEV_COLOR[(item.severity || '').toLowerCase()] || '#6b7796';
  const reported = item.report?.status === true;

  function handleCardClick() {
    if (imgSrc) onOpenLightbox?.(item);
    onClick?.();
  }

  async function handleMarkResolved(e) {
    e.stopPropagation();
    if (resolving) return;
    setResolving(true);
    try {
      const newVal = !localResolved;
      await apiMarkResolved(item._id || item.id, item.incidentType, newVal);
      setLocalResolved(newVal);
      onRefresh?.();
    } catch {
      // silently fail — user sees no state change
    } finally {
      setResolving(false);
    }
  }

  return (
    <>
      {reportOpen && <ReportModal item={item} onClose={() => setReportOpen(false)} onSuccess={onRefresh} />}

      <div
        onClick={handleCardClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          background: 'var(--bg1solid)',
          border: '1px solid var(--bd)',
          borderRadius: 12,
          overflow: 'hidden',
          cursor: imgSrc || onClick ? 'pointer' : 'default',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: hover ? '0 4px 16px rgba(0,0,0,.14)' : '0 1px 4px rgba(0,0,0,.06)',
          transition: 'box-shadow .15s',
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

          {/* Top-left: detection badge + mark-as-resolved (shown on hover) */}
          <div style={{ position: 'absolute', top: 9, left: 9, right: 9, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {/* Detection type badge */}
            <div style={{ background: sevColor, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, letterSpacing: '.3px', whiteSpace: 'nowrap' }}>
              {det}
            </div>

            {/* Mark as resolved — visible on hover */}
            {hover && (
              <button
                onClick={handleMarkResolved}
                disabled={resolving}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(4px)',
                  border: '1px solid rgba(255,255,255,.18)',
                  borderRadius: 20, padding: '4px 10px 4px 7px',
                  cursor: resolving ? 'wait' : 'pointer',
                  color: '#fff', fontSize: 11, fontWeight: 500,
                  transition: 'background .15s',
                  maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,.9)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,.72)'}
              >
                {/* Checkbox-like indicator */}
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
                {resolving ? 'Saving…' : localResolved ? 'Resolved' : 'Mark as resolved'}
              </button>
            )}
          </div>

          {/* Top-right: severity chip */}
          <div style={{ position: 'absolute', top: 9, right: 9, background: 'rgba(0,0,0,.55)', color: sevColor, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, backdropFilter: 'blur(4px)', border: `1px solid ${sevColor}` }}>
            {(item.severity || 'LOW').toUpperCase().slice(0, 4)}
          </div>

          {/* Bottom-left: timestamp + camera name */}
          <div style={{ position: 'absolute', bottom: 9, left: 9, maxWidth: 'calc(50% - 14px)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 9.5, color: '#fff', background: 'rgba(0,0,0,.55)', padding: '2px 8px', borderRadius: 5, backdropFilter: 'blur(4px)', maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', boxSizing: 'border-box' }}>
              {shortDateTime(item.timeOfIncident)}
            </span>
            {cam && (
              <span style={{ fontFamily: 'monospace', fontSize: 9.5, color: 'rgba(255,255,255,.8)', background: 'rgba(0,0,0,.45)', padding: '2px 8px', borderRadius: 5, backdropFilter: 'blur(4px)', maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', boxSizing: 'border-box' }}>
                {cam}
              </span>
            )}
          </div>

          {/* Bottom-right: confidence + Report button + expand */}
          <div style={{ position: 'absolute', bottom: 9, right: 9, maxWidth: 'calc(50% - 14px)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, flexWrap: 'wrap' }}>
            {conf != null && (
              <span style={{ fontFamily: 'monospace', fontSize: 9.5, color: '#fff', background: 'rgba(0,0,0,.55)', padding: '2px 8px', borderRadius: 5, backdropFilter: 'blur(4px)' }}>
                {Math.round(conf)}%
              </span>
            )}

            {/* Report button */}
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
                onClick={e => { e.stopPropagation(); handleCardClick(); }}
                style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(0,0,0,.55)', border: '1px solid rgba(255,255,255,.25)', backdropFilter: 'blur(4px)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Maximize2 size={12} color="#fff" />
              </span>
            )}
          </div>
        </div>

        {/* Info row */}
        <div style={{ padding: '11px 13px 12px', display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            {item.incidentName || det}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '1 1 auto' }}>
              {[cam, site].filter(Boolean).join(' · ')}
            </span>
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
