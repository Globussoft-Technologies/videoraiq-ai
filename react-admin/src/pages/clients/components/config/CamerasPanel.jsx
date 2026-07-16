import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import CameraRow from './CameraRow'

const CamerasPanel = ({ cameras, onToggle }) => {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cameras
    return cameras.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.nvrName?.toLowerCase().includes(q) ||
        String(c.channelId).includes(q)
    )
  }, [cameras, query])

  return (
    <div>
      {/* Controls */}
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter cameras…"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 dark:border-white/8 dark:bg-white/4 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-purple-400/60"
          />
        </div>

        <span className="text-sm text-gray-400 dark:text-gray-500">
          {cameras.length} {cameras.length === 1 ? 'camera' : 'cameras'} provisioned
        </span>

        {/* Add Camera — display-only until its POST endpoint exists */}
        {/* <button
          type="button"
          className="ml-auto inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-blue-600 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <Plus size={16} strokeWidth={2.4} />
          Add Camera
        </button> */}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)] gap-4 border-b border-gray-200 px-6 py-3 dark:border-white/8">
          <span className="font-mono text-[10px] font-semibold tracking-[0.12em] text-gray-400 uppercase dark:text-gray-600">
            Camera
          </span>
          <span className="font-mono text-[10px] font-semibold tracking-[0.12em] text-gray-400 uppercase dark:text-gray-600">
            Detections Enabled
          </span>
        </div>

        {filtered.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
            {cameras.length === 0 ? 'No cameras added for this client.' : 'No cameras match your filter.'}
          </p>
        ) : (
          filtered.map((camera) => (
            <CameraRow key={camera.cameraId} camera={camera} onToggle={onToggle} />
          ))
        )}
      </div>
    </div>
  )
}

export default CamerasPanel
