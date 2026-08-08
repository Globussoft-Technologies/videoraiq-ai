import { Panel, Badge } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { severity, detectionLabel, timeOfDay } from '../../../lib/format';
import { useNavigate } from 'react-router-dom';

const TYPE_META = {
  fireSmokeDetection: { label: 'FIRE', color: '#ff5b57' },
  weaponDetection: { label: 'WEPN', color: '#ff5b57' },
  lineCrossing: { label: 'INTR', color: '#ff5b57' },
  unauthorizedAccess: { label: 'ACCS', color: '#f59e0b' },
  unattendedBaggageDetection: { label: 'BAG', color: '#14b8a6' },
  faceRecognition: { label: 'FACE', color: '#5b7cfa' },
  anpr: { label: 'ANPR', color: '#a855f7' },
  motionDetection: { label: 'MOTN', color: '#f59e0b' },
  crowdDetection: { label: 'CRWD', color: '#f59e0b' },
  genericObjectDetection: { label: 'OBJ', color: '#f59e0b' },
};

function typeMeta(alert) {
  const raw = alert?.incidentType || alert?.displayName || '';
  const mapped = TYPE_META[raw];
  if (mapped) return mapped;
  const label = detectionLabel(raw)
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 4)
    .toUpperCase() || 'ALRT';
  return { label, color: severity(alert?.severity).color };
}

/** Real-time threat feed from dashboard/criticalityStats recentAlerts.
 *  Shows exactly 6 items in the visible area; additional items scroll inside. */
export default function LiveThreatFeed({ alerts = [], loading, error, isEmpty, onRetry }) {
  const navigate = useNavigate();
  return (
    <Panel style={{ display: 'flex', flexDirection: 'column', minHeight: 380, maxHeight: 420, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 16px 11px', borderBottom: '1px solid var(--bd)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="vq-blink" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--crit)' }} />
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Live Threat Feed</span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>REAL-TIME</span>
      </div>
      <AsyncBoundary loading={loading} error={error} isEmpty={isEmpty} onRetry={onRetry} minH={300} emptyLabel="No recent threats">
        {() => (
          <div className="vq-scroll" style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {alerts.map((a, i) => {
              const sev = severity(a.severity);
              const type = typeMeta(a);
              const det = detectionLabel(a.incidentType || a.displayName);
              const alertId = a._id || a.id || a.incidentId;
              const cameraName = a.channelData?.customName || a.channelData?.name || a.cameraName || a.channelName || '';
              const locationName = a.location || a.locationName || a.nvrData?.location || a.channelData?.location || '';
              const confidence = a.confidence ?? a.accuracy ?? a.score;
              const meta = [
                cameraName,
                locationName,
                confidence != null && !Number.isNaN(Number(confidence)) ? `${Math.round(Number(confidence))}% conf` : '',
              ].filter(Boolean).join(' · ');
              const incidentTime = timeOfDay(a.timeOfIncident) || a.time || '';
              const openAlert = () => {
                const path = alertId
                  ? `/alerts?alertId=${encodeURIComponent(String(alertId))}`
                  : '/alerts';
                navigate(path, { state: { alertId: alertId ? String(alertId) : undefined, alert: a } });
              };
              return (
                <div
                  key={alertId || i}
                  role="button"
                  tabIndex={0}
                  onClick={openAlert}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openAlert();
                    }
                  }}
                  style={{ display: 'flex', gap: 10, padding: '10px 11px', borderRadius: 11, background: 'var(--bg2)', border: '1px solid var(--bd)', cursor: 'pointer' }}
                >
                  <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: type.color || sev.color, flex: '0 0 auto' }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Badge color={type.color || sev.color}>{type.label}</Badge>
                      {incidentTime && (
                        <span style={{ marginLeft: 'auto', flex: '0 0 auto', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tx3)' }}>{incidentTime}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.incidentName || det}
                    </div>
                    {meta && (
                      <div style={{ fontSize: 10, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {meta}
                      </div>
                    )}
                    <div style={{ display: 'none', fontSize: 10, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {[a.channelData?.name, a.nvrData?.nvrName].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AsyncBoundary>
    </Panel>
  );
}
