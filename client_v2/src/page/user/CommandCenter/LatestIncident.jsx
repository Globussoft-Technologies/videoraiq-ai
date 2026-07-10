import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Maximize2, X } from 'lucide-react';
import { Panel, ActionLink, Badge } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { severity, detectionLabel, shortDateTime, mediaUrl } from '../../../lib/format';
import { updateIncidentReportStatus } from '../../../helpers/monitoring';

function btnStyle(variant) {
  const base = { fontSize: 13, fontWeight: 600, borderRadius: 8, padding: '7px 18px', cursor: 'pointer', border: '1px solid transparent', transition: 'all .15s' };
  if (variant === 'primary') return { ...base, background: 'var(--blue)', color: '#fff', border: '1px solid var(--blue)' };
  return { ...base, background: 'var(--bg2)', color: 'var(--tx2)', border: '1px solid var(--bd)' };
}

/* ── Report modal — same update-report-status flow used in Incident Center / Alerts ── */
function ReportModal({ item, onClose, onSuccess }) {
  const existing = item.report?.status && item.report?.description ? item.report : null;
  const [desc, setDesc]       = useState(existing?.description || '');
  const [editing, setEditing] = useState(!existing);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');

  async function submit() {
    if (!desc.trim()) { setErr('Please enter a description'); return; }
    setLoading(true); setErr('');
    try {
      await updateIncidentReportStatus({ incidentId: item._id || item.id, status: true, description: desc.trim() });
      toast.success('Reported');
      onSuccess?.();
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.body?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: 16, boxSizing: 'border-box' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(420px, 100%)', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', background: 'var(--bg1solid)', border: '1px solid var(--bd)', borderRadius: 14, padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
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
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={btnStyle('secondary')}>Close</button>
              <button onClick={() => setEditing(true)} style={btnStyle('primary')}>Edit Report</button>
            </div>
          </>
        ) : (
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
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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

function Lightbox({ src, alt, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,6,12,.93)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', maxWidth: '94vw', maxHeight: '90vh' }}
      >
        <img
          src={src} alt={alt}
          style={{ maxWidth: '94vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 10, display: 'block' }}
        />
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(6,8,13,.8)', border: '1px solid var(--bd)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

/** Latest incident card with Acknowledge / Dispatch actions wired to incidents API. */
export default function LatestIncident({ incident, loading, error, isEmpty, onRetry, onChanged }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const imgSrc = incident?.Image ? mediaUrl(incident.Image) : null;

  const sev = severity(incident?.severity);
  const det = detectionLabel(incident?.incidentType || incident?.displayName);

  async function acknowledge() {
    if (!incident?._id) return;
    setBusy(true);
    try {
      await updateIncidentReportStatus({ incidentId: incident._id, status: true, description: '' });
      toast.success('Incident acknowledged');
      onChanged?.();
    } catch (e) {
      toast.error('Could not acknowledge');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel style={{ overflow: 'hidden' }}>
      {lightbox && imgSrc && (
        <Lightbox src={imgSrc} alt={det} onClose={() => setLightbox(false)} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 15px 11px', borderBottom: '1px solid var(--bd)', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 13.5 }}>Latest Incident</span>
        <ActionLink style={{ marginLeft: 'auto', fontSize: 11, whiteSpace: 'nowrap' }} onClick={() => navigate('/incidents')}>
          All incidents →
        </ActionLink>
      </div>
      <AsyncBoundary loading={loading} error={error} isEmpty={isEmpty} onRetry={onRetry} minH={200} emptyLabel="No incidents yet">
        {() => (
          <>
            <div style={{ position: 'relative', aspectRatio: '16/9', background: '#0a0e15' }}>
              {imgSrc ? (
                <img src={imgSrc} alt={det} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 11.5 }}>
                  {incident?.channelData?.name || 'No snapshot'}
                </div>
              )}
              <div style={{ position: 'absolute', top: 9, left: 10 }}>
                <Badge color={sev.color} solid>{det}</Badge>
              </div>
              <div style={{ position: 'absolute', top: 9, right: 10 }}>
                <Badge color={sev.color} style={{ background: 'rgba(6,8,13,.6)', backdropFilter: 'blur(4px)' }}>{sev.short}</Badge>
              </div>
              <div style={{ position: 'absolute', bottom: 9, left: 10, fontFamily: 'var(--mono)', fontSize: 9, color: '#fff', background: 'rgba(6,8,13,.6)', padding: '2px 7px', borderRadius: 5, backdropFilter: 'blur(4px)' }}>
                {shortDateTime(incident?.timeOfIncident)}
              </div>
              {/* fullscreen expand */}
              {imgSrc && (
                <div
                  onClick={() => setLightbox(true)}
                  title="View fullscreen"
                  style={{
                    position: 'absolute', bottom: 9, right: 10,
                    width: 28, height: 28, borderRadius: 6,
                    background: 'rgba(6,8,13,.65)', border: '1px solid rgba(255,255,255,.15)',
                    backdropFilter: 'blur(4px)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Maximize2 size={13} color="#fff" />
                </div>
              )}
            </div>
            <div style={{ padding: '11px 14px', minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {incident?.incidentName || det}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {[incident?.channelData?.name, incident?.nvrData?.nvrName, incident?.location].filter(Boolean).join(' · ')}
              </div>
              <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
                <div
                  onClick={busy ? undefined : acknowledge}
                  style={{ flex: 1, textAlign: 'center', fontSize: 11.5, fontWeight: 600, color: '#fff', background: 'linear-gradient(135deg,var(--blue),var(--violet))', borderRadius: 8, padding: 8, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
                >
                  {busy ? '…' : 'Acknowledge'}
                </div>
                <div
                  onClick={() => setReportOpen(true)}
                  style={{ flex: 1, textAlign: 'center', fontSize: 11.5, fontWeight: 600, color: 'var(--crit)', border: '1px solid rgba(255,77,77,.4)', borderRadius: 8, padding: 8, cursor: 'pointer' }}
                >
                  {incident?.report?.status ? 'Reported' : 'Report'}
                </div>
              </div>
            </div>
          </>
        )}
      </AsyncBoundary>

      {reportOpen && incident && (
        <ReportModal
          item={incident}
          onClose={() => setReportOpen(false)}
          onSuccess={onChanged}
        />
      )}
    </Panel>
  );
}
