import { ScanEye, Camera as CameraIcon } from 'lucide-react';
import { detectionColor } from './detectionColors';

function Row({ detection, isLast }) {
  const { fg, bg } = detectionColor(detection.settingType);
  return (
    <div
      className="flex items-center gap-3 px-1 py-3"
      style={{ borderBottom: isLast ? 'none' : '1px solid var(--bd)', opacity: detection.enabled ? 1 : 0.6 }}
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: bg }}>
        <ScanEye size={16} strokeWidth={2} color={fg} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--tx)' }}>{detection.name}</div>
        <div className="truncate text-[9.5px] uppercase tracking-wide" style={{ color: 'var(--tx3)', fontFamily: 'var(--mono)' }}>
          {detection.settingType}
        </div>
      </div>

      <span
        className="flex flex-shrink-0 items-center gap-1 text-[11px]"
        title={`${detection.cameraAllocation} camera${detection.cameraAllocation === 1 ? '' : 's'} allocated for ${detection.name}`}
        style={{ color: 'var(--tx3)', fontFamily: 'var(--mono)' }}
      >
        <CameraIcon size={11} strokeWidth={2} />
        {detection.cameraAllocation}
      </span>

      <span
        className="w-[72px] flex-shrink-0 rounded-full py-1 text-center text-[10px] font-semibold"
        style={
          detection.enabled
            ? { background: 'rgba(34,197,94,.12)', color: 'var(--ok)' }
            : { background: 'var(--bg2)', color: 'var(--tx3)', border: '1px solid var(--bd)' }
        }
      >
        {detection.enabled ? 'Enabled' : 'Disabled'}
      </span>
    </div>
  );
}

export default function DetectionAllocation({ detections }) {
  const total = detections?.length ?? 0;
  const enabledCount = detections?.filter((d) => d.enabled).length ?? 0;
  const assignedCameras = detections?.reduce((sum, d) => sum + (d.cameraAllocation || 0), 0) ?? 0;
  const pct = total ? Math.round((enabledCount / total) * 100) : 0;

  return (
    <div className="rounded-2xl p-5" style={{ border: '1px solid var(--bd)', background: 'var(--bg1)' }}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: 'linear-gradient(135deg,var(--blue),var(--violet))' }}
          >
            <ScanEye size={16} color="#fff" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-sm font-semibold leading-tight" style={{ fontFamily: 'var(--disp)', color: 'var(--tx)' }}>
              Detection Allocation
            </h2>
            <span className="text-[11px]" style={{ color: 'var(--tx3)' }}>
              {enabledCount} of {total} types enabled · {assignedCameras} cam-assignments
            </span>
          </div>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: 'rgba(168,85,247,.12)', color: 'var(--violet)', fontFamily: 'var(--mono)' }}
        >
          {pct}%
        </span>
      </div>

      <div className="my-4 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--bg2)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg,var(--blue),var(--violet))' }}
        />
      </div>

      {total ? (
        <div className="max-h-96 overflow-y-auto vq-scroll">
          {detections.map((d, i) => (
            <Row key={d.settingType} detection={d} isLast={i === detections.length - 1} />
          ))}
        </div>
      ) : (
        <span className="text-xs" style={{ color: 'var(--tx3)' }}>No detection data available</span>
      )}
    </div>
  );
}
