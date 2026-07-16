const AVATAR_COLORS = [
  'from-blue-500 to-purple-500',
  'from-purple-500 to-pink-500',
  'from-teal-400 to-cyan-500',
  'from-pink-500 to-rose-500',
  'from-amber-500 to-orange-500',
  'from-emerald-500 to-green-500',
]

const getInitials = (name = '') => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Meter colour by how close provisioned is to the licence cap.
const meterColor = (ratio, over) => {
  if (over) return 'bg-red-500'
  if (ratio >= 0.9) return 'bg-red-500'
  if (ratio >= 0.7) return 'bg-amber-500'
  return 'bg-green-500'
}

const CameraUtilisation = ({ rows = [] }) => {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Camera Utilisation by Client
        </h2>
        <span className="font-mono text-[10px] tracking-[0.12em] text-gray-400 uppercase dark:text-gray-600">
          Provisioned / Licensed
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
          No camera data available.
        </p>
      ) : (
        // ~5 rows visible; the rest scroll. pr-2 keeps the scrollbar clear of the meters.
        <div className="flex max-h-72.5 flex-col gap-4 overflow-y-auto pr-2">
          {rows.map((row, i) => {
            const { adminId, name, provisioned = 0, licensed = 0 } = row
            const over = provisioned > licensed
            // Fill is relative to the licence cap; over-allocation pins to full.
            const ratio = licensed > 0 ? Math.min(1, provisioned / licensed) : provisioned > 0 ? 1 : 0

            return (
              <div key={adminId || i}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-linear-to-br text-[10px] font-semibold text-white ${
                        AVATAR_COLORS[i % AVATAR_COLORS.length]
                      }`}
                    >
                      {getInitials(name)}
                    </span>
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                      {name || 'Client'}
                    </p>
                  </div>

                  <p className="shrink-0 font-mono text-xs">
                    <span
                      className={
                        over
                          ? 'font-semibold text-red-500 dark:text-red-400'
                          : 'font-semibold text-gray-700 dark:text-gray-200'
                      }
                    >
                      {provisioned}
                    </span>
                    <span className="text-gray-400 dark:text-gray-600"> / {licensed}</span>
                  </p>
                </div>

                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/8">
                  <span
                    className={`block h-full rounded-full transition-all ${meterColor(ratio, over)}`}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default CameraUtilisation
