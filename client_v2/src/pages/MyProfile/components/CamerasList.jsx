import { useMemo, useState } from 'react';
import { Cctv, ServerCog, Search } from 'lucide-react';
import { detectionColor, detectionShortLabel } from './detectionColors';

// Server always sends the client's full allowed-detection set on every
// camera (true/false per camera) — showing every key as a pill just repeats
// the same 6-7 labels on every card with only the color changing. Only the
// detections actually TRUE for this camera are worth a pill.
function DetectionChips({ detections }) {
  const enabled = Object.entries(detections || {}).filter(([, on]) => on);
  if (!enabled.length) {
    return <span className="text-[10.5px] italic" style={{ color: 'var(--tx3)' }}>No detections enabled</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {enabled.map(([settingType]) => {
        const { fg, bg, bd } = detectionColor(settingType);
        return (
          <span
            key={settingType}
            className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ background: bg, border: `1px solid ${bd}`, color: fg }}
          >
            {detectionShortLabel(settingType)}
          </span>
        );
      })}
    </div>
  );
}

function CameraCard({ camera }) {
  const hasDetections = Object.values(camera.detections || {}).some(Boolean);
  return (
    <div
      className="relative overflow-hidden rounded-xl p-3.5 transition-shadow hover:shadow-md"
      style={{ border: '1px solid var(--bd)', background: 'var(--bg2)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ background: hasDetections ? 'rgba(59,130,246,.12)' : 'var(--bg1)' }}
          >
            <Cctv size={14} strokeWidth={1.8} color={hasDetections ? 'var(--blue)' : 'var(--tx3)'} />
          </span>
          <span className="truncate text-[12.5px] font-semibold" style={{ color: 'var(--tx)' }} title={camera.name}>
            {camera.name || `Camera ${camera.channelId}`}
          </span>
        </div>
      </div>

      {camera.nvrName && (
        <div className="mt-2 flex items-center gap-1.5 text-[10.5px]" style={{ color: 'var(--tx3)' }}>
          <ServerCog size={11} strokeWidth={1.8} />
          {camera.nvrName}
          {camera.channelId != null && <span style={{ fontFamily: 'var(--mono)' }}>· CH {camera.channelId}</span>}
        </div>
      )}

      <div className="mt-3">
        <DetectionChips detections={camera.detections} />
      </div>
    </div>
  );
}

export default function CamerasList({ cameras, stats }) {
  const [search, setSearch] = useState('');

  const total = stats?.totalCameras ?? cameras?.length ?? 0;
  const withDetectionsCount = cameras?.filter((c) => Object.values(c.detections || {}).some(Boolean)).length ?? 0;
  const pct = total ? Math.round((withDetectionsCount / total) * 100) : 0;

  const filtered = useMemo(() => {
    let list = cameras || [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => (c.name || '').toLowerCase().includes(q) || (c.nvrName || '').toLowerCase().includes(q));
    }
    return list;
  }, [cameras, search]);

  return (
    <div className="rounded-2xl p-5" style={{ border: '1px solid var(--bd)', background: 'var(--bg1)' }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: 'linear-gradient(135deg,var(--blue),var(--violet))' }}
          >
            <Cctv size={16} color="#fff" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-sm font-semibold leading-tight" style={{ fontFamily: 'var(--disp)', color: 'var(--tx)' }}>
              Cameras
            </h2>
            <span className="text-[11px]" style={{ color: 'var(--tx3)' }}>
              {withDetectionsCount} of {total} with detections assigned
            </span>
          </div>
        </div>

        {!!cameras?.length && (
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" color="var(--tx3)" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cameras or NVR…"
              className="rounded-lg py-1.5 pl-7 pr-3 text-[12px] outline-none"
              style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', color: 'var(--tx)', width: 190 }}
            />
          </div>
        )}
      </div>

      <div className="mb-4 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--bg2)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg,var(--blue),var(--violet))' }}
        />
      </div>

      {filtered.length ? (
        <div className="grid max-h-[30rem] grid-cols-1 gap-3 overflow-y-auto vq-scroll pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((camera) => (
            <CameraCard key={camera.cameraId} camera={camera} />
          ))}
        </div>
      ) : (
        <span className="text-xs" style={{ color: 'var(--tx3)' }}>
          {cameras?.length ? 'No cameras match your search' : 'No cameras found'}
        </span>
      )}
    </div>
  );
}
