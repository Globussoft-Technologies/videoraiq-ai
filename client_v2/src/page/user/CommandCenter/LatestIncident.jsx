import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Maximize2, X } from 'lucide-react';
import { Panel, ActionLink, Badge } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { severity, detectionLabel, shortDateTime, mediaUrl } from '../../../lib/format';
import { updateIncidentReportStatus } from '../../../helpers/monitoring';

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
            position: 'absolute', top: -14, right: -14,
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 15px 11px', borderBottom: '1px solid var(--bd)' }}>
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 13.5 }}>Latest Incident</span>
        <ActionLink style={{ marginLeft: 'auto', fontSize: 11 }} onClick={() => navigate('incidents')}>
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
            <div style={{ padding: '11px 14px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3, marginBottom: 4 }}>
                {incident?.incidentName || det}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
                {[incident?.channelData?.name, incident?.nvrData?.nvrName, incident?.location].filter(Boolean).join(' · ')}
              </div>
              <div style={{ display: 'flex', gap: 7, marginTop: 11 }}>
                <div
                  onClick={busy ? undefined : acknowledge}
                  style={{ flex: 1, textAlign: 'center', fontSize: 11.5, fontWeight: 600, color: '#fff', background: 'linear-gradient(135deg,var(--blue),var(--violet))', borderRadius: 8, padding: 8, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
                >
                  {busy ? '…' : 'Acknowledge'}
                </div>
                <div
                  onClick={() => navigate('incidents')}
                  style={{ flex: 1, textAlign: 'center', fontSize: 11.5, fontWeight: 600, color: 'var(--crit)', border: '1px solid rgba(255,77,77,.4)', borderRadius: 8, padding: 8, cursor: 'pointer' }}
                >
                  Dispatch
                </div>
              </div>
            </div>
          </>
        )}
      </AsyncBoundary>
    </Panel>
  );
}
