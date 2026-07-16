import { Video } from 'lucide-react'
import { pillColor, shortLabel, PILL_OFF } from './cameraDetections'

// Pills are driven straight off the camera's own `detections` object — one pill
// per key present. Clicking a pill toggles that detection's enabled flag; the
// parent tracks the change and persists it on Save.
const CameraRow = ({ camera, onToggle }) => {
  const { name, channelId, nvrName, detections = {} } = camera
  const settingTypes = Object.keys(detections)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)] items-center gap-4 border-b border-gray-100 px-6 py-4 last:border-b-0 dark:border-white/5">
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

      {/* Detection pills — click to toggle enabled/disabled */}
      <div className="flex flex-wrap gap-1.5">
        {settingTypes.length === 0 ? (
          <span className="text-xs text-gray-400 dark:text-gray-600">No detections linked</span>
        ) : (
          settingTypes.map((settingType, i) => {
            const enabled = detections[settingType] === true
            const label = shortLabel(settingType)
            return (
              <button
                key={settingType}
                type="button"
                onClick={() => onToggle(camera.cameraId, settingType, !enabled)}
                title={`${enabled ? 'Disable' : 'Enable'} ${label}`}
                className={`inline-flex cursor-pointer rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  enabled ? pillColor(i) : PILL_OFF
                }`}
              >
                {label}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

export default CameraRow
