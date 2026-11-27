import { useEffect, useState } from 'react'
import { Building2, CircleCheck, Video, VideoOff, ScanEye, ListChecks } from 'lucide-react'
import Topbar from '../../layout/Topbar'
import LoadingState from '../../components/UI/LoadingState'
import StatTile from './components/StatTile'
import CameraUtilisation from './components/CameraUtilisation'
import ClientsByPlan from './components/ClientsByPlan'
import DetectionsByType from './components/DetectionsByType'
import CameraHealth from './components/CameraHealth'
import DetectionSetup from './components/DetectionSetup'
import TopAlertClients from './components/TopAlertClients'
import { getFleetOverview } from './apis/get'
import { getApiMessage } from '../../utils/apiError'

const unwrap = (res) => res?.body?.data ?? res?.data ?? {}

const FleetOverview = () => {
  const [result, setResult] = useState(null)
  const [utilisationQuery, setUtilisationQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(utilisationQuery.trim()), 350)
    return () => clearTimeout(timer)
  }, [utilisationQuery])

  useEffect(() => {
    let cancelled = false
    getFleetOverview(debouncedSearch)
      .then((response) => {
        if (!cancelled) setResult({ overview: unwrap(response), search: debouncedSearch })
      })
      .catch((err) => {
        if (!cancelled) setResult((previous) => ({
          ...previous,
          failedSearch: debouncedSearch,
          error: getApiMessage(err, 'Failed to load fleet overview'),
        }))
      })
    return () => {
      cancelled = true
    }
  }, [debouncedSearch])

  const overview = result?.overview
  const appliedSearch = result?.search || ''
  const error = result?.failedSearch === debouncedSearch ? result.error : ''

  const t = overview?.totals || {}
  const metricLink = (key) => {
    const params = new URLSearchParams()
    if (appliedSearch) params.set('search', appliedSearch)
    if (key === 'active') params.set('status', 'active')
    if (key === 'licensed' || key === 'provisioned') {
      params.set('view', key)
      return `/fleet/cameras?${params}`
    }
    const path = key === 'clients' || key === 'active' ? '/clients' : `/fleet/${key}`
    return params.size ? `${path}?${params}` : path
  }

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
      key: 'detection-setup',
      Icon: ListChecks,
      value: t.activeClients ?? 0,
      label: 'Client Detection Setup',
      tint: 'bg-orange-50 text-orange-500 dark:bg-orange-500/10 dark:text-orange-300',
      glow: 'bg-orange-400/20',
    },
  ]

  return (
    <>
      <Topbar eyebrow="PLATFORM" title="Fleet Overview" />

      <div className="px-8 py-6">
        {!overview && error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        ) : !overview ? (
          <LoadingState message="Loading fleet overview…" />
        ) : (
          <>
            {/* Header tiles */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              {TILES.map(({ key, ...tile }) => (
                <StatTile key={key} {...tile} to={metricLink(key)} />
              ))}
            </div>

            {/* Utilisation + plans */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <CameraUtilisation
                rows={overview?.cameraUtilisation || []}
                query={utilisationQuery}
                onQueryChange={setUtilisationQuery}
                searching={!error && debouncedSearch !== appliedSearch}
                searchError={error}
              />
              <ClientsByPlan rows={overview?.clientsByPlan || []} search={appliedSearch} />
            </div>

            {/* Detection configuration and camera health */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <DetectionsByType rows={overview?.detectionsByType || []} filtered={Boolean(appliedSearch)} />
              <CameraHealth
                health={overview?.cameraHealth}
                provisioned={t.camerasProvisioned ?? 0}
                filtered={Boolean(appliedSearch)}
              />
              <DetectionSetup counts={overview.detectionSetup} search={appliedSearch} />
            </div>
            <TopAlertClients key={appliedSearch} search={appliedSearch} />
          </>
        )}
      </div>
    </>
  )
}

export default FleetOverview
