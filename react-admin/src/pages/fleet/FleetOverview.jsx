import { useEffect, useRef, useState } from 'react'
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
  const [graph, setGraph] = useState({ buckets: [], total: 0, hours: 24, from: '', to: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [utilisationQuery, setUtilisationQuery] = useState('')
  const [debouncedUtilisationQuery, setDebouncedUtilisationQuery] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [utilisationLoading, setUtilisationLoading] = useState(false)
  const [utilisationError, setUtilisationError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [alertStatus, setAlertStatus] = useState('active')
  const [appliedAlertStatus, setAppliedAlertStatus] = useState('active')
  const [initialOverviewLoaded, setInitialOverviewLoaded] = useState(false)
  const lastFleetRequestRef = useRef({ search: '', version: 0, status: 'active' })
  const asOfRef = useRef(new Date().toISOString())

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        // All three panels load together; one slow call shouldn't serialise the rest.
        const [ovRes, topRes, graphRes] = await Promise.all([
          getFleetOverview('', asOfRef.current),
          getTopAlerts(24, 5, asOfRef.current),
          getAlertsGraph(24, asOfRef.current),
        ])
        if (cancelled) return

        setOverview(unwrap(ovRes))
        setInitialOverviewLoaded(true)
        setTopClients(unwrap(topRes).clients || [])
        const g = unwrap(graphRes)
        setGraph({ buckets: g.buckets || [], total: g.total || 0, hours: g.hours || 24, from: g.from || '', to: g.to || '' })
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

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedUtilisationQuery(utilisationQuery.trim()),
      350,
    )
    return () => clearTimeout(timer)
  }, [utilisationQuery])

  useEffect(() => {
    if (
      !initialOverviewLoaded ||
      (debouncedUtilisationQuery === lastFleetRequestRef.current.search &&
        refreshVersion === lastFleetRequestRef.current.version &&
        alertStatus === lastFleetRequestRef.current.status)
    ) {
      return undefined
    }

    let cancelled = false
    lastFleetRequestRef.current = { search: debouncedUtilisationQuery, version: refreshVersion, status: alertStatus }
    setUtilisationLoading(true)
    setUtilisationError('')
    setRefreshError('')
    const asOf = new Date().toISOString()
    asOfRef.current = asOf

    Promise.all([
      getFleetOverview(debouncedUtilisationQuery, asOf, alertStatus),
      getTopAlerts(24, 5, asOf, debouncedUtilisationQuery, alertStatus),
      getAlertsGraph(24, asOf, debouncedUtilisationQuery, alertStatus),
    ])
      .then(([overviewRes, topRes, graphRes]) => {
        if (cancelled) return
        setOverview(unwrap(overviewRes))
        setTopClients(unwrap(topRes).clients || [])
        const g = unwrap(graphRes)
        setGraph({ buckets: g.buckets || [], total: g.total || 0, hours: g.hours || 24, from: g.from || '', to: g.to || '' })
        setAppliedSearch(debouncedUtilisationQuery)
        setAppliedAlertStatus(alertStatus)
      })
      .catch((err) => {
        if (cancelled) return
        const message = getApiMessage(err, 'Failed to refresh fleet overview')
        setUtilisationError(message)
        setRefreshError(message)
      })
      .finally(() => {
        if (!cancelled) {
          setUtilisationLoading(false)
          setRefreshing(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [debouncedUtilisationQuery, initialOverviewLoaded, refreshVersion, alertStatus])

  const refreshFleet = () => {
    if (refreshing) return
    setRefreshing(true)
    setDebouncedUtilisationQuery(utilisationQuery.trim())
    setRefreshVersion((version) => version + 1)
  }

  const changeAlertStatus = (status) => {
    if (refreshing || status === appliedAlertStatus) return
    setRefreshing(true)
    setAlertStatus(status)
    // Also retries a selection if its previous request failed.
    setRefreshVersion((version) => version + 1)
  }

  const t = overview?.totals || {}

  const TILES = [
    {
      key: 'clients',
      Icon: Building2,
      value: t.clients ?? 0,
      label: appliedSearch ? 'Matching Clients' : 'Total Clients',
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
      value: t.detectionsEnabled ?? 0,
      label: 'Detections Enabled',
      tint: 'bg-purple-50 text-purple-500 dark:bg-purple-500/10 dark:text-purple-300',
      glow: 'bg-purple-400/20',
    },
    {
      key: 'alerts',
      Icon: TriangleAlert,
      value: graph.total,
      label: `${appliedAlertStatus === 'all' ? 'All' : 'Active'} Alerts · 24h`,
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
              <CameraUtilisation
                rows={overview?.cameraUtilisation || []}
                query={utilisationQuery}
                onQueryChange={setUtilisationQuery}
                searching={utilisationLoading}
                searchError={utilisationError}
              />
              <ClientsByPlan rows={overview?.clientsByPlan || []} />
            </div>

            {/* Detections + health + alerts */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <DetectionsByType rows={overview?.detectionsByType || []} filtered={Boolean(appliedSearch)} />
              <CameraHealth health={overview?.cameraHealth} filtered={Boolean(appliedSearch)} />
              <AlertsGraph
                buckets={graph.buckets}
                total={graph.total}
                hours={graph.hours}
                from={graph.from}
                to={graph.to}
                filtered={Boolean(appliedSearch)}
                status={appliedAlertStatus}
                onStatusChange={changeAlertStatus}
                onRefresh={refreshFleet}
                refreshing={refreshing}
                error={refreshError}
              />
            </div>

            {/* Top clients by alerts */}
            <div className="mt-6">
              <TopAlertClients clients={topClients} status={appliedAlertStatus} />
            </div>
          </>
        )}
      </div>
    </>
  )
}

export default FleetOverview
