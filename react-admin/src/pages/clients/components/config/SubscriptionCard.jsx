import { CreditCard } from 'lucide-react'

// Built from real API stats only. Plan tier / monthly value / renewal date are
// not returned by the client-config API, so they are intentionally omitted.
const Stat = ({ label, value, accent }) => (
  <div className="flex items-center justify-between border-b border-gray-100 py-3 last:border-b-0 dark:border-white/6">
    <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-gray-400 uppercase dark:text-gray-600">
      {label}
    </span>
    <span className={`text-sm font-semibold ${accent || 'text-gray-900 dark:text-white'}`}>
      {value}
    </span>
  </div>
)

const SubscriptionCard = ({ stats, totalDetections }) => {
  const {
    totalCameras = 0,
    configured = 0,
    nonConfigured = 0,
    detectionsEnabled = 0,
    licenseInUse = 0,
  } = stats || {}
  // Cameras holding a licence slot right now. Over the purchased total means
  // the client is already past the limit — new enables are refused until they
  // free one up, existing ones keep running.
  const overLicensed = totalCameras > 0 && licenseInUse > totalCameras

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
      <div className="flex items-center gap-2">
        <CreditCard size={18} className="text-purple-500 dark:text-purple-300" strokeWidth={2} />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Subscription</h2>
      </div>

      <div className="mt-4">
        <Stat label="Total Cameras" value={totalCameras} />
        <Stat
          label="License In Use"
          value={`${licenseInUse} of ${totalCameras}`}
          accent={
            overLicensed
              ? 'text-red-600 dark:text-red-400'
              : 'text-blue-600 dark:text-blue-400'
          }
        />
        <Stat
          label="Configured"
          value={configured}
          accent="text-green-600 dark:text-green-400"
        />
        <Stat
          label="Non-configured"
          value={nonConfigured}
          accent="text-amber-600 dark:text-amber-400"
        />
        <Stat
          label="Detections Enabled"
          value={`${detectionsEnabled} of ${totalDetections}`}
          accent="text-purple-600 dark:text-purple-400"
        />
      </div>
    </div>
  )
}

export default SubscriptionCard
