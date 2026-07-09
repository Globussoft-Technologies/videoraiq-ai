import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import Topbar from '../../layout/Topbar'
import DetectionCard from './components/DetectionCard'
import LoadingState from '../../components/UI/LoadingState'
import { getDetectionCatalog } from './apis/get'
import { DETECTION_META, FALLBACK_META } from './data'
import { notifyApiError } from '../../utils/apiError'

// Merge an API detection row (name / description / clientCount) with its
// frontend icon + tint, keyed by settingType.
const mapDetection = (d) => {
  const meta = DETECTION_META[d.settingType] || FALLBACK_META
  return {
    key: d.settingType,
    name: d.name,
    description: d.description,
    clientCount: d.clientCount ?? 0,
    Icon: meta.Icon,
    tint: meta.tint,
  }
}

const DetectionCatalog = () => {
  const [detections, setDetections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await getDetectionCatalog()
        if (cancelled) return
        const data = res?.body?.data ?? res?.data ?? {}
        const rows = Array.isArray(data.detections) ? data.detections : []
        setDetections(rows.map(mapDetection))
      } catch (err) {
        if (cancelled) return
        setError(notifyApiError(err, 'Failed to load detection catalog'))
        setDetections([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <Topbar eyebrow="PLATFORM" title="Detection Catalog" />

      <div className="px-8 py-6">
        {/* Info banner */}
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
          <Info size={18} className="shrink-0 text-purple-500 dark:text-purple-300" strokeWidth={2} />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            The AI detection types available on the platform. Provision them per client &amp; per
            camera from each client&apos;s configuration.
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        ) : loading ? (
          <LoadingState message="Loading detection catalog…" />
        ) : detections.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-400 dark:border-white/8 dark:bg-[#0b0d13] dark:text-gray-500">
            No detections available.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {detections.map((detection) => (
              <DetectionCard key={detection.key} detection={detection} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export default DetectionCatalog
