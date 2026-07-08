import { Panel } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { getDetectionVolume } from '../../../helpers/analytics';
import { rangeLabel } from './RangeFilter';

function areaChartPoints(values, width, height) {
  if (!values.length) return { area: '', line: '' };
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1 || 1);
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return { area: `0,${height} ${pts.join(' ')} ${width},${height}`, line: pts.join(' ') };
}

export default function DetectionVolumeCard({ params }) {
  const paramsKey = JSON.stringify(params);
  const api = useApi(() => getDetectionVolume(params), [paramsKey], { pollMs: 120000 });
  const series = api.data?.series || [];
  const counts = series.map((s) => s.count);
  const label = rangeLabel(api.data);

  const chartW = 720;
  const chartH = 200;
  const { area, line } = areaChartPoints(counts, chartW, chartH);

  return (
    <Panel style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Detection Volume{label ? ` · ${label}` : ''}</div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>events / day</span>
      </div>
      <AsyncBoundary loading={api.loading} error={api.error} isEmpty={!api.loading && !api.error && counts.every((c) => c === 0)} onRetry={api.refetch} minH={220} emptyLabel="No detections in range">
        {() => (
          <div style={{ position: 'relative', height: 220 }}>
            <svg viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="analytics-detvol-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="rgba(168,85,247,.45)" />
                  <stop offset="1" stopColor="rgba(168,85,247,0)" />
                </linearGradient>
              </defs>
              <polygon points={area} fill="url(#analytics-detvol-area)" />
              <polyline points={line} fill="none" stroke="var(--violet)" strokeWidth="2.2" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </AsyncBoundary>
    </Panel>
  );
}
