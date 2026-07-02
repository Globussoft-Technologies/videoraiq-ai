import { Panel, Badge } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { severity, detectionLabel, timeAgo } from '../../../lib/format';

/** Real-time threat feed from dashboard/criticalityStats recentAlerts.
 *  Shows exactly 6 items in the visible area; additional items scroll inside. */
export default function LiveThreatFeed({ alerts = [], loading, error, isEmpty, onRetry }) {
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
              const det = detectionLabel(a.incidentType || a.displayName);
              return (
                <div key={a._id || i} style={{ display: 'flex', gap: 10, padding: '10px 11px', borderRadius: 11, background: 'var(--bg2)', border: '1px solid var(--bd)' }}>
                  <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: sev.color, flex: '0 0 auto' }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <Badge color={sev.color}>{sev.short}</Badge>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--tx3)' }}>{det}</span>
                      <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tx3)' }}>{a.timeAgo || timeAgo(a.timeOfIncident)}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.incidentName || det}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
