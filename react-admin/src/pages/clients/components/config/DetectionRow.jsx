import { CopyCheck, Minus, Plus, ScanEye } from 'lucide-react'

// Rotating accent for the detection icon tile, keyed by index.
const ICON_TINTS = [
  'bg-blue-50 text-blue-500 dark:bg-blue-500/10 dark:text-blue-300',
  'bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-300',
  'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-300',
  'bg-purple-50 text-purple-500 dark:bg-purple-500/10 dark:text-purple-300',
  'bg-teal-50 text-teal-500 dark:bg-teal-500/10 dark:text-teal-300',
  'bg-pink-50 text-pink-500 dark:bg-pink-500/10 dark:text-pink-300',
]

const DetectionRow = ({
  detection,
  index,
  maxCameras,
  onToggle,
  onAllocationChange,
  onApplyToAll,
  applyToAllCount = 0,
}) => {
  const { name, enabled, cameraAllocation, camerasInUse = 0, dsSupported } = detection
  // Explicit false means DS answered and has no engine for this detection, so
  // licensing it would never result in anything running. null means DS could
  // not be reached — say nothing rather than a false accusation.
  const noEngine = dsSupported === false
  const tint = ICON_TINTS[index % ICON_TINTS.length]

  const setAlloc = (n) => onAllocationChange(Math.max(0, Math.min(maxCameras, n)))

  // The client is already running this detection on more cameras than the
  // allocation about to be saved. Existing cameras keep running — the limit
  // only refuses NEW ones — so this is a warning, not a blocked save.
  const overAllocated = enabled && camerasInUse > cameraAllocation
  // Turning a detection off revokes it: on save the client backend stops it on
  // every camera still running it, not just hides it.
  const disablingInUse = !enabled && camerasInUse > 0

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_120px_290px] items-center gap-4 border-b border-gray-100 px-6 py-4 last:border-b-0 dark:border-white/5">
      {/* Detection type */}
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tint}`}>
          <ScanEye size={17} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{name}</p>
          <p className="truncate font-mono text-[10px] tracking-wide text-gray-400 uppercase dark:text-gray-600">
            {detection.settingType}
          </p>
          {noEngine && (
            <p className="mt-0.5 truncate text-[11px] font-medium text-red-600 dark:text-red-400">
              No detection engine — cannot run even if licensed
            </p>
          )}
          {overAllocated && (
            <p className="mt-0.5 truncate text-[11px] font-medium text-amber-600 dark:text-amber-400">
              In use on {camerasInUse} cameras — above this allocation
            </p>
          )}
          {disablingInUse && (
            <p className="mt-0.5 truncate text-[11px] font-medium text-amber-600 dark:text-amber-400">
              Will stop on {camerasInUse} camera{camerasInUse === 1 ? '' : 's'} when saved
            </p>
          )}
        </div>
      </div>

      {/* Enabled toggle */}
      <div className="flex justify-center">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? 'bg-linear-to-r from-purple-600 to-blue-600' : 'bg-gray-300 dark:bg-white/15'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
              enabled ? 'left-[calc(100%-1.375rem)]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {/* Cameras assigned stepper */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setAlloc(cameraAllocation - 1)}
          disabled={!enabled || cameraAllocation <= 0}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:border-white/10 dark:bg-white/4 dark:text-gray-300 dark:hover:bg-white/8"
          aria-label={`Decrease cameras for ${name}`}
        >
          <Minus size={15} strokeWidth={2.4} />
        </button>

        <input
          type="number"
          min={0}
          max={maxCameras}
          value={cameraAllocation}
          disabled={!enabled}
          onChange={(e) => setAlloc(Number(e.target.value) || 0)}
          className="h-8 w-14 rounded-lg border border-gray-200 bg-white text-center text-sm font-semibold text-gray-900 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 disabled:opacity-40 dark:border-white/10 dark:bg-white/4 dark:text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />

        <button
          type="button"
          onClick={() => setAlloc(cameraAllocation + 1)}
          disabled={!enabled || cameraAllocation >= maxCameras}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:border-white/10 dark:bg-white/4 dark:text-gray-300 dark:hover:bg-white/8"
          aria-label={`Increase cameras for ${name}`}
        >
          <Plus size={15} strokeWidth={2.4} />
        </button>

        {/* Copy this row's count onto every other enabled detection — the common
            case is "give them all the same number of cameras". Only enabled
            detections are touched, so it is a no-op worth disabling when this
            row is the only one on. */}
        <button
          type="button"
          onClick={onApplyToAll}
          disabled={!enabled || applyToAllCount < 2}
          title={
            enabled
              ? `Apply ${cameraAllocation} to all ${applyToAllCount} enabled detections`
              : 'Enable this detection to apply its count to the others'
          }
          aria-label={`Apply this camera count to all enabled detections`}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-gray-100 hover:text-purple-600 disabled:opacity-40 disabled:hover:bg-gray-50 disabled:hover:text-gray-500 dark:border-white/10 dark:bg-white/4 dark:text-gray-400 dark:hover:bg-white/8 dark:hover:text-purple-300 dark:disabled:hover:bg-white/4"
        >
          <CopyCheck size={14} strokeWidth={2.2} />
        </button>

        <span
          className={`ml-1 font-mono text-[11px] ${
            overAllocated ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-600'
          }`}
          title={`${camerasInUse} camera${camerasInUse === 1 ? '' : 's'} currently running this detection`}
        >
          {camerasInUse} used · of {maxCameras}
        </span>
      </div>
    </div>
  )
}

export default DetectionRow
