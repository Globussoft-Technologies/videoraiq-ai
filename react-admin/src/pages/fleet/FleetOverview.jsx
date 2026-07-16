import { useEffect, useState } from 'react'
import { Building2, CircleCheck, Video, VideoOff, ScanEye, TriangleAlert } from 'lucide-react'
import Topbar from '../../layout/Topbar'
import LoadingState from '../../components/UI/LoadingState'
import StatTile from './components/StatTile'
import CameraUtilisation from './components/CameraUtilisation'
import ClientsByPlan from './components/ClientsByPlan'
import DetectionsByType from './components/DetectionsByType'
import CameraHealth from './components/CameraHealth'
import AlertsGraph from './components/AlertsGraph'
import TopAlertClients from './components/TopAlertClients'
import { getFleetOverview, getTopAlerts, getAlertsGraph } from './apis/get'
import { getApiMessage } from '../../utils/apiError'

const unwrap = (res) => res?.body?.data ?? res?.data ?? {}

const FleetOverview = () => {
  const [overview, setOverview] = useState(null)
  const [topClients, setTopClients] = useState([])
  const [graph, setGraph] = useState({ buckets: [], total: 0, hours: 24 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        // All three panels load together; one slow call shouldn't serialise the rest.
        const [ovRes, topRes, graphRes] = await Promise.all([
          getFleetOverview(),
          getTopAlerts(24, 5),
          getAlertsGraph(24),
        ])
        if (cancelled) return

        setOverview(unwrap(ovRes))
        setTopClients(unwrap(topRes).clients || [])
        const g = unwrap(graphRes)
        setGraph({ buckets: g.buckets || [], total: g.total || 0, hours: g.hours || 24 })
      } catch (err) {
        if (cancelled) return
        setError(getApiMessage(err, 'Failed to load fleet overview'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const t = overview?.totals || {}

  const TILES = [
    {
      key: 'clients',
      Icon: Building2,
      value: t.clients ?? 0,
      label: 'Total Clients',
      tint: 'bg-blue-50 text-blue-500 dark:bg-blue-500/10 dark:text-blue-300',
      glow: 'bg-blue-400/20',
    },
    {
      key: 'active',
      Icon: CircleCheck,
      value: t.activeClients ?? 0,
      label: 'Active Clients',
      tint: 'bg-green-50 text-green-500 dark:bg-green-500/10 dark:text-green-300',
      glow: 'bg-green-400/20',
    },
    {
      key: 'licensed',
      Icon: Video,
      value: t.camerasLicensed ?? 0,
      label: 'Cameras Licensed',
      tint: 'bg-cyan-50 text-cyan-500 dark:bg-cyan-500/10 dark:text-cyan-300',
      glow: 'bg-cyan-400/20',
    },
    {
      key: 'provisioned',
      Icon: VideoOff,
      value: t.camerasProvisioned ?? 0,
      label: 'Cameras Provisioned',
      tint: 'bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-300',
      glow: 'bg-amber-400/20',
    },
    {
      key: 'detections',
      Icon: ScanEye,
      value: t.detectionsRunning ?? 0,
      label: 'Detections Running',
      tint: 'bg-purple-50 text-purple-500 dark:bg-purple-500/10 dark:text-purple-300',
      glow: 'bg-purple-400/20',
    },
    {
      key: 'alerts',
      Icon: TriangleAlert,
      value: t.alerts24h ?? 0,
      label: 'Alerts · 24h',
      tint: 'bg-orange-50 text-orange-500 dark:bg-orange-500/10 dark:text-orange-300',
      glow: 'bg-orange-400/20',
    },
  ]

  return (
    <>
      <Topbar eyebrow="PLATFORM" title="Fleet Overview" />

      <div className="px-8 py-6">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        ) : loading ? (
          <LoadingState message="Loading fleet overview…" />
        ) : (
          <>
            {/* Header tiles */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              {TILES.map(({ key, ...tile }) => (
                <StatTile key={key} {...tile} />
              ))}
            </div>

            {/* Utilisation + plans */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <CameraUtilisation rows={overview?.cameraUtilisation || []} />
              <ClientsByPlan rows={overview?.clientsByPlan || []} />
            </div>

            {/* Detections + health + alerts */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <DetectionsByType rows={overview?.detectionsByType || []} />
              <CameraHealth health={overview?.cameraHealth} />
              <AlertsGraph buckets={graph.buckets} total={graph.total} hours={graph.hours} />
            </div>

            {/* Top clients by alerts */}
            <div className="mt-6">
              <TopAlertClients clients={topClients} />
            </div>
          </>
        )}
      </div>
    </>
  )
}

export default FleetOverview
