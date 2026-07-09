import { Video, Trash2 } from 'lucide-react'
import { pillColor, shortLabel, PILL_OFF } from './cameraDetections'

// `detectionTypes` is [{ settingType, name }] — the canonical list from the API.
const CameraRow = ({ camera, detectionTypes }) => {
  const { name, channelId, nvrName, detections = {} } = camera

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)_40px] items-center gap-4 border-b border-gray-100 px-6 py-4 last:border-b-0 dark:border-white/5">
      {/* Camera identity */}
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-white/6 dark:text-gray-400">
          <Video size={17} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {name || 'Camera'}
          </p>
          <p className="truncate font-mono text-[10px] tracking-wide text-gray-400 uppercase dark:text-gray-600">
            CAM-{channelId} · {nvrName || 'NVR'}
          </p>
        </div>
      </div>

      {/* Detection pills — reflect the camera's enabled state */}
      <div className="flex flex-wrap gap-1.5">
        {detectionTypes.map((d, i) => {
          const enabled = detections[d.settingType] === true
          return (
            <span
              key={d.settingType}
              title={d.name}
              className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                enabled ? pillColor(i) : PILL_OFF
              }`}
            >
              {shortLabel(d.settingType, d.name)}
            </span>
          )
        })}
      </div>

      {/* Delete (display-only for now) */}
      <button
        type="button"
        aria-label={`Remove ${name}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-red-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:border-white/10 dark:hover:bg-red-500/10"
      >
        <Trash2 size={15} strokeWidth={2} />
      </button>
    </div>
  )
}

export default CameraRow
