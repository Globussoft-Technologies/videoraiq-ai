import React from 'react';
import { Loader } from 'lucide-react';

// The backend labels the face detector "Attendance Settings"; the product name
// everywhere in this UI is "Face Recognition".
const FACE_KEYS = new Set(['faceAuthenticationSettings', 'attendanceSettings']);
const displayName = (key, name) =>
  FACE_KEYS.has(key) || name === 'Attendance Settings' ? 'Face Recognition' : name || key;

// The live-demo-analytics endpoint returns byDetection as an array of
// { settingType, name, runs, events, avgConfidence, lastRunAt, lastEventAt, ... }.
// Older callers passed an object map keyed by settingType — support both.
function toRows(analytics) {
  const rows = analytics?.byDetection;
  if (Array.isArray(rows)) {
    return rows.map((row) => {
      const key = row.settingType || row.key || row.name;
      return {
        key,
        name: displayName(key, row.name),
        runs: row.runs || 0,
        events: row.events || 0,
      };
    });
  }
  return Object.entries(rows || {}).map(([key, stats]) => ({
    key,
    name: displayName(key, stats?.name),
    runs: stats?.runs || 0,
    events: stats?.events || 0,
  }));
}

/**
 * Read-only analytics summary shown after a clip is processed — four headline
 * tiles plus a per-detection breakdown, straight from the live-demo-analytics
 * response. No filters.
 */
export default function SessionAnalyticsPanel({
  analytics,
  loading = false,
  selectedDetectionName = 'Detection',
}) {
  const demosRun = analytics?.demosRun ?? 0;
  const eventsDetected = analytics?.eventsDetected ?? 0;
  const avgConfidence = analytics?.avgConfidence ?? 0;
  const detectionsTested = analytics?.detectionsTested ?? 0;

  // Only detections that actually ran or produced events — the response also
  // lists requested-but-empty ones (runs: 0, events: 0).
  const rows = toRows(analytics).filter((row) => row.key && (row.runs > 0 || row.events > 0));
  const maxEvents = Math.max(1, ...rows.map((row) => row.events));

  const tiles = [
    { label: 'Demos run', value: demosRun, color: 'var(--violet)' },
    { label: 'Events detected', value: eventsDetected, color: 'var(--tx)' },
    { label: 'Avg confidence', value: `${avgConfidence}%`, color: 'var(--ok)' },
    { label: 'Detections tested', value: detectionsTested, color: 'var(--magenta)' },
  ];

  return (
    <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="shrink-0 text-[15px] font-bold text-[var(--tx)]">Detection Analytics</h2>
          <span className="min-w-0 truncate rounded-md border border-[var(--bd)] bg-[var(--bg2)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--tx3)]">
            {selectedDetectionName}
          </span>
        </div>
        {loading && <Loader className="h-4 w-4 animate-spin text-[var(--blue)]" />}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border border-[var(--bd)] bg-[var(--bg2)] p-3">
            <div className="text-[11px] font-semibold text-[var(--tx3)]">{tile.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: tile.color }}>
              {tile.value}
            </div>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="grid grid-cols-[minmax(0,170px)_minmax(70px,1fr)_minmax(84px,auto)] items-center gap-3 text-xs">
              <span className="min-w-0 truncate font-semibold text-[var(--tx)]" title={row.name}>
                {row.name}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg2)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--blue)] to-[var(--violet)] transition-[width] duration-300"
                  style={{ width: `${Math.min(100, (row.events / maxEvents) * 100)}%` }}
                />
              </div>
              <span className="w-28 shrink-0 text-right text-[var(--tx3)]">
                {row.runs} run{row.runs === 1 ? '' : 's'} · {row.events} events
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
