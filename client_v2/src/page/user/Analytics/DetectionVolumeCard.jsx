import { useRef, useState } from 'react';
import moment from 'moment';
import { Panel } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { getDetectionVolume } from '../../../helpers/analytics';
import { num } from '../../../lib/format';
import { rangeLabel } from './RangeFilter';
import AnalyticsBlurb from './AnalyticsBlurb';

function areaChartPoints(values, width, height) {
  if (!values.length) return { area: '', line: '', points: [] };
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1 || 1);
  const points = values.map((v, i) => ({
    x: i * step,
    y: height - (v / max) * (height - 4) - 2,
  }));
  const pts = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  return { area: `0,${height} ${pts.join(' ')} ${width},${height}`, line: pts.join(' '), points };
}

export default function DetectionVolumeCard({ params }) {
  const paramsKey = JSON.stringify(params);
  const api = useApi(() => getDetectionVolume(params), [paramsKey], { pollMs: 120000 });
  const series = api.data?.series || [];
  const counts = series.map((s) => s.count);
  const label = rangeLabel(params);

  const chartW = 720;
  const chartH = 200;
  const { area, line, points } = areaChartPoints(counts, chartW, chartH);

  const wrapRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const onMouseMove = (e) => {
    if (!points.length || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    // Map pixel x -> viewBox x (chart uses preserveAspectRatio="none", so the
    // scale is a plain ratio, not letterboxed).
    const vx = (px / rect.width) * chartW;
    const step = chartW / (points.length - 1 || 1);
    const idx = Math.min(points.length - 1, Math.max(0, Math.round(vx / step)));
    setHoverIdx(idx);
    setHoverPos({ x: px, y: e.clientY - rect.top });
  };
  const onMouseLeave = () => setHoverIdx(null);

  const hovered = hoverIdx != null ? series[hoverIdx] : null;
  const hoverPoint = hoverIdx != null ? points[hoverIdx] : null;

  return (
    <Panel style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Detection Volume{label ? `  ${label}` : ''}</div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>alerts / day</span>
      </div>
      <AnalyticsBlurb style={{ marginBottom: 14 }}>
        Daily incident counts across the selected range, shown as a trend line so spikes and quiet periods are easy to spot.
      </AnalyticsBlurb>
      <AsyncBoundary loading={api.loading} error={api.error} isEmpty={!api.loading && !api.error && counts.every((c) => c === 0)} onRetry={api.refetch} minH={220} emptyLabel="No detections in range">
        {() => (
          <div
            ref={wrapRef}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            style={{ position: 'relative', height: 220 }}
          >
            <svg viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="analytics-detvol-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="rgba(168,85,247,.45)" />
                  <stop offset="1" stopColor="rgba(168,85,247,0)" />
                </linearGradient>
              </defs>
              <polygon points={area} fill="url(#analytics-detvol-area)" />
              <polyline points={line} fill="none" stroke="var(--violet)" strokeWidth="2.2" strokeLinejoin="round" />
              {hoverPoint && (
                <>
                  <line x1={hoverPoint.x} y1="0" x2={hoverPoint.x} y2={chartH} stroke="var(--bd2)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                  <circle cx={hoverPoint.x} cy={hoverPoint.y} r="4" fill="var(--violet)" stroke="var(--bg1)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </>
              )}
            </svg>
            {hovered && (
              <div
                style={{
                  position: 'absolute',
                  left: Math.min(Math.max(hoverPos.x, 60), (wrapRef.current?.clientWidth || chartW) - 60),
                  top: Math.max(hoverPos.y - 54, 4),
                  transform: 'translateX(-50%)',
                  background: 'var(--tooltip)',
                  border: '1px solid var(--bd)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  backdropFilter: 'blur(6px)',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 14px rgba(0,0,0,.18)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx)' }}>{moment(hovered.date).format('MMM D, YYYY')}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--violet)' }}>{num(hovered.count)} alert{hovered.count === 1 ? '' : 's'}</div>
              </div>
            )}
          </div>
        )}
      </AsyncBoundary>
    </Panel>
  );
}


