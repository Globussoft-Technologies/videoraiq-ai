import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { Panel, Badge } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { severity, detectionLabel, shortDateTime, timeAgo, mediaUrl } from '../../../lib/format';
import { fetchIncidents, updateReportStatus } from '../../../helpers/incidents';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'Critical' },
  { key: 'moderate', label: 'Medium' },
  { key: 'low', label: 'Low' },
];

function tab(active) {
  return {
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    color: active ? 'var(--blue)' : 'var(--tx2)',
    background: active ? 'rgba(59,130,246,.14)' : 'var(--bg2)',
    border: `1px solid ${active ? 'rgba(59,130,246,.45)' : 'var(--bd)'}`,
  };
}

function statusOf(item) {
  if (item.resolved) return { label: 'Resolved', color: 'var(--ok)' };
  if (item.report?.status === true) return { label: 'Acknowledged', color: 'var(--blue)' };
  return { label: 'New', color: 'var(--warn)' };
}

export default function AlertsView() {
  const ctx = useOutletContext() || {};
  const location = ctx.location || '';
  const [sev, setSev] = useState('all');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  const filter = useMemo(() => (location ? { location } : {}), [location]);
  const feed = useApi(() => fetchIncidents({ skip: 0, limit: 50 }, filter), [filter], { pollMs: 30000 });

  const rows = useMemo(() => {
    let list = feed.data?.items || [];
    if (sev !== 'all') list = list.filter((i) => (i.severity || '').toLowerCase() === sev);
    return list;
  }, [feed.data, sev]);

  const active = selected || rows[0] || null;

  async function acknowledge() {
    if (!active?._id) return;
    setBusy(true);
    try {
      await updateReportStatus({ incidentId: active._id, status: true, description: '' });
      toast.success('Acknowledged');
      feed.refetch();
    } catch {
      toast.error('Could not acknowledge');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map((t) => <div key={t.key} onClick={() => setSev(t.key)} style={tab(sev === t.key)}>{t.label}</div>)}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tx3)' }}>{rows.length} events</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }} className="vq-cc-grid">
        {/* Table */}
        <Panel style={{ overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px 110px', gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--bd)', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--tx3)' }}>
            <span>SEVERITY</span><span>EVENT</span><span>TIME</span><span>STATUS</span>
          </div>
          <AsyncBoundary loading={feed.loading} error={feed.error} isEmpty={!feed.loading && !feed.error && rows.length === 0} onRetry={feed.refetch} minH={300} emptyLabel="No alerts">
            {() => (
              <div className="vq-scroll" style={{ maxHeight: '64vh', overflowY: 'auto' }}>
                {rows.map((it) => {
                  const s = severity(it.severity);
                  const st = statusOf(it);
                  const isSel = active && active._id === it._id;
                  return (
                    <div
                      key={it._id}
                      onClick={() => setSelected(it)}
                      style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px 110px', gap: 8, alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid var(--bd)', cursor: 'pointer', background: isSel ? 'var(--bg2)' : 'transparent' }}
                    >
                      <Badge color={s.color}>{s.short}</Badge>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.incidentName || detectionLabel(it.incidentType)}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[it.channelData?.name, it.nvrData?.nvrName].filter(Boolean).join(' · ')}</div>
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--tx2)' }}>{timeAgo(it.timeOfIncident)}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: st.color, fontWeight: 600 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color }} />{st.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </AsyncBoundary>
        </Panel>

        {/* Detail */}
        <Panel style={{ overflow: 'hidden', alignSelf: 'flex-start', position: 'sticky', top: 0 }}>
          {!active ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx3)', fontSize: 12 }}>Select an alert to inspect</div>
          ) : (
            <>
              <div style={{ position: 'relative', aspectRatio: '16/9', background: '#0a0e15' }}>
                {active.Image ? (
                  <img src={mediaUrl(active.Image)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 11.5 }}>No snapshot</div>
                )}
              </div>
              <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                  <Badge color={severity(active.severity).color} solid>{detectionLabel(active.incidentType)}</Badge>
                  <Badge color={severity(active.severity).color}>{severity(active.severity).short}</Badge>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>{shortDateTime(active.timeOfIncident)}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{active.incidentName || detectionLabel(active.incidentType)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{[active.channelData?.name, active.nvrData?.nvrName, active.location].filter(Boolean).join(' · ')}</div>
                {active.description && <div style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.4 }}>{active.description}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <div onClick={busy ? undefined : acknowledge} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#fff', background: 'linear-gradient(135deg,var(--blue),var(--violet))', borderRadius: 8, padding: 9, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                    {busy ? '…' : 'Acknowledge'}
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--crit)', border: '1px solid rgba(255,77,77,.4)', borderRadius: 8, padding: 9, cursor: 'pointer' }}>Dispatch</div>
                </div>
                {active.videoLink && (
                  <a href={active.videoLink} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: 'var(--blue)', textAlign: 'center', textDecoration: 'none' }}>
                    Export clip · view full timeline →
                  </a>
                )}
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
