import { Video, Minus, Plus } from 'lucide-react'

// Set the client's total purchased cameras. Each detection is allocated
// independently (any camera can run several detections at once).
const CameraLicenseCard = ({ totalCameras, onChange }) => {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
      <div className="flex items-center gap-2">
        <Video size={18} className="text-purple-500 dark:text-purple-300" strokeWidth={2} />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Camera License</h2>
      </div>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Set the total number of cameras this client has. Detections below are allocated against this
        total.
      </p>

      <p className="mt-5 font-mono text-[10px] font-semibold tracking-[0.14em] text-gray-400 uppercase dark:text-gray-600">
        Total Cameras
      </p>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, totalCameras - 1))}
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:border-white/10 dark:bg-white/4 dark:text-gray-300 dark:hover:bg-white/8"
          disabled={totalCameras <= 0}
          aria-label="Decrease cameras"
        >
          <Minus size={18} strokeWidth={2.4} />
        </button>

        <input
          type="number"
          min={0}
          value={totalCameras}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="h-12 w-24 rounded-xl border border-gray-200 bg-white text-center text-2xl font-bold text-blue-600 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 dark:border-white/10 dark:bg-white/4 dark:text-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />

        <button
          type="button"
          onClick={() => onChange(totalCameras + 1)}
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100 dark:border-white/10 dark:bg-white/4 dark:text-gray-300 dark:hover:bg-white/8"
          aria-label="Increase cameras"
        >
          <Plus size={18} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  )
}

export default CameraLicenseCard
