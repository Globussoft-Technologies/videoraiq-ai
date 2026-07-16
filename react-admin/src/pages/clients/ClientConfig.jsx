import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Save, ShieldCheck, ShieldHalf, Video, RefreshCw } from 'lucide-react'
import Topbar from '../../layout/Topbar'
import CameraLicenseCard from './components/config/CameraLicenseCard'
import SubscriptionCard from './components/config/SubscriptionCard'
import DetectionRow from './components/config/DetectionRow'
import CamerasPanel from './components/config/CamerasPanel'
import LoadingState from '../../components/UI/LoadingState'
import { getClientConfig, getClientCameras } from './apis/get/clientConfig'
import { updatePurchasedCameras, updateDetection, updateCameraDetection } from './apis/put'
import { getApiMessage, notifyApiError, notifyApiSuccess } from '../../utils/apiError'

const getInitials = (name = '') => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const ClientConfig = () => {
  const { adminId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  // Header details carried from the Clients row click (falls back gracefully).
  const passed = location.state || {}

  const [stats, setStats] = useState(null)
  const [detections, setDetections] = useState([])
  const [totalCameras, setTotalCameras] = useState(0)

  // Baseline snapshot to diff against, so Save only PUTs what changed.
  const [baseline, setBaseline] = useState({ totalCameras: 0, detections: [] })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Tabs: 'license' (default) | 'cameras'. Cameras load lazily on first open.
  const [tab, setTab] = useState('license')
  const [cameras, setCameras] = useState([])
  const [camerasLoaded, setCamerasLoaded] = useState(false)
  const [camerasLoading, setCamerasLoading] = useState(false)
  // Baseline of each camera's detections, so Save only PATCHes what toggled.
  // Shape: { [cameraId]: { [settingType]: enabledBool } }
  const [camerasBaseline, setCamerasBaseline] = useState({})
  const [savingCameras, setSavingCameras] = useState(false)

  // Bump to re-run the config fetch (Retry button).
  const [reloadKey, setReloadKey] = useState(0)

  // Push a fetched config response into local + baseline state.
  const applyData = (res) => {
    const data = res?.body?.data ?? res?.data ?? {}
    const dets = Array.isArray(data.detections) ? data.detections : []
    setStats(data.stats || null)
    setDetections(dets)
    setTotalCameras(data.stats?.totalCameras ?? 0)
    setBaseline({
      totalCameras: data.stats?.totalCameras ?? 0,
      detections: dets.map((d) => ({ ...d })),
    })
  }

  useEffect(() => {
    let cancelled = false

    const fetchConfig = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await getClientConfig(adminId)
        if (cancelled) return
        applyData(res)
      } catch (err) {
        if (cancelled) return
        setError(getApiMessage(err, 'Failed to load client configuration'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchConfig()
    return () => {
      cancelled = true
    }
  }, [adminId, reloadKey])

  // Load the client's cameras the first time the Cameras tab is opened.
  useEffect(() => {
    if (tab !== 'cameras' || camerasLoaded) return
    let cancelled = false

    const fetchCameras = async () => {
      setCamerasLoading(true)
      try {
        const res = await getClientCameras(adminId)
        if (cancelled) return
        const data = res?.body?.data ?? res?.data ?? {}
        const list = Array.isArray(data.cameras) ? data.cameras : []
        setCameras(list)
        setCamerasBaseline(
          Object.fromEntries(list.map((c) => [c.cameraId, { ...(c.detections || {}) }]))
        )
        setCamerasLoaded(true)
      } catch (err) {
        if (cancelled) return
        notifyApiError(err, 'Failed to load cameras')
      } finally {
        if (!cancelled) setCamerasLoading(false)
      }
    }

    fetchCameras()
    return () => {
      cancelled = true
    }
  }, [tab, camerasLoaded, adminId])

  // Flip one camera's detection pill in local state (persisted on Save).
  const toggleCameraDetection = (cameraId, settingType, enabled) => {
    setCameras((prev) =>
      prev.map((c) =>
        c.cameraId === cameraId
          ? { ...c, detections: { ...c.detections, [settingType]: enabled } }
          : c
      )
    )
  }

  // Cameras whose detections differ from the fetched baseline, with the exact
  // { settingType, enabled } toggles that changed — the PATCH payloads to send.
  const dirtyCameraToggles = useMemo(() => {
    const changes = []
    for (const cam of cameras) {
      const base = camerasBaseline[cam.cameraId] || {}
      for (const [settingType, enabled] of Object.entries(cam.detections || {})) {
        if (base[settingType] !== enabled) {
          changes.push({ cameraId: cam.cameraId, settingType, enabled })
        }
      }
    }
    return changes
  }, [cameras, camerasBaseline])

  const camerasTabDirty = dirtyCameraToggles.length > 0

  const handleSaveCameras = async () => {
    if (!camerasTabDirty) return
    setSavingCameras(true)
    try {
      // One PATCH per changed toggle (endpoint toggles a single detection/camera).
      let lastRes
      for (const t of dirtyCameraToggles) {
        lastRes = await updateCameraDetection(adminId, t.cameraId, {
          settingType: t.settingType,
          enabled: t.enabled,
        })
      }
      notifyApiSuccess(lastRes, 'Camera detections updated')
      // Re-baseline from the now-saved local state so the dirty state clears.
      setCamerasBaseline(
        Object.fromEntries(cameras.map((c) => [c.cameraId, { ...(c.detections || {}) }]))
      )
    } catch (err) {
      notifyApiError(err, 'Failed to update camera detections')
    } finally {
      setSavingCameras(false)
    }
  }

  const setDetection = (settingType, patch) => {
    setSaved(false)
    setDetections((prev) =>
      prev.map((d) => (d.settingType === settingType ? { ...d, ...patch } : d))
    )
  }

  // Total assignments across all detections — informational only. Because each
  // detection is capped independently at totalCameras (a camera can run several
  // detections at once), this sum can legitimately exceed totalCameras.
  const assigned = useMemo(
    () => detections.reduce((sum, d) => sum + (d.enabled ? Number(d.cameraAllocation) || 0 : 0), 0),
    [detections]
  )

  const enabledCount = useMemo(
    () => detections.filter((d) => d.enabled).length,
    [detections]
  )

  // What changed vs the baseline?
  const dirtyDetections = useMemo(() => {
    return detections.filter((d) => {
      const base = baseline.detections.find((b) => b.settingType === d.settingType)
      if (!base) return true
      return base.enabled !== d.enabled || Number(base.cameraAllocation) !== Number(d.cameraAllocation)
    })
  }, [detections, baseline])

  const camerasDirty = totalCameras !== baseline.totalCameras
  const isDirty = camerasDirty || dirtyDetections.length > 0

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      // Keep the last server response so we can surface its own success message.
      let lastRes
      if (camerasDirty) {
        lastRes = await updatePurchasedCameras(adminId, totalCameras)
      }
      // Sequential so a failure points at a specific detection.
      for (const d of dirtyDetections) {
        lastRes = await updateDetection(adminId, d.settingType, {
          cameraAllocation: Number(d.cameraAllocation) || 0,
          enabled: d.enabled,
        })
      }
      setSaved(true)
      // Show the API's own success message (not a hardcoded string).
      notifyApiSuccess(lastRes, 'Configuration saved')
      // Re-sync stats + baseline from the server so meters/dirty-state reflect saved values.
      const fresh = await getClientConfig(adminId)
      applyData(fresh)
    } catch (err) {
      // Show the API message (e.g. "purchasedCameras exceeds available cameras…") in a toast only.
      notifyApiError(err, 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Topbar eyebrow="PLATFORM · CLIENTS" title="Client Configuration" />

      <div className="px-8 py-6">
        {/* Header row */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/clients')}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-white/4 dark:text-gray-400 dark:hover:bg-white/8"
              aria-label="Back to clients"
            >
              <ArrowLeft size={18} strokeWidth={2} />
            </button>

            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br text-sm font-semibold text-white ${
                passed.avatarColor || 'from-blue-500 to-purple-500'
              }`}
            >
              {getInitials(passed.name || '')}
            </span>

            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-gray-900 dark:text-white">
                {passed.name || 'Client'}
              </h2>
              <p className="truncate font-mono text-xs text-gray-400 dark:text-gray-500">
                {[passed.email].filter(Boolean).join(' · ') || adminId}
              </p>
            </div>

            {passed.plan && (
              <span className="ml-1 inline-flex rounded-md border border-purple-300/60 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600 dark:border-purple-400/30 dark:bg-purple-500/10 dark:text-purple-300">
                {passed.plan}
              </span>
            )}
          </div>

          {/* License tab: save camera license + detection allocations. */}
          {tab === 'license' && (
            <div className="flex items-center gap-3">
              {saved && !isDirty && (
                <span className="text-sm font-medium text-green-600 dark:text-green-400">Saved ✓</span>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || saving}
                className="inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-blue-600 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save size={16} strokeWidth={2.2} />
                {saving ? 'Saving…' : 'Save Configuration'}
              </button>
            </div>
          )}

          {/* Cameras tab: save per-camera detection toggles. */}
          {tab === 'cameras' && (
            <button
              type="button"
              onClick={handleSaveCameras}
              disabled={!camerasTabDirty || savingCameras}
              className="inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-blue-600 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={16} strokeWidth={2.2} />
              {savingCameras ? 'Saving…' : 'Save Configuration'}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6 inline-flex gap-1 rounded-xl border border-gray-200 bg-white p-1 dark:border-white/8 dark:bg-white/4">
          <button
            type="button"
            onClick={() => setTab('license')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'license'
                ? 'bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white'
                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <ShieldHalf size={16} strokeWidth={2} />
            License &amp; Detections
          </button>
          <button
            type="button"
            onClick={() => setTab('cameras')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'cameras'
                ? 'bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white'
                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Video size={16} strokeWidth={2} />
            Cameras
            {camerasLoaded && (
              <span className="rounded-full bg-gray-200 px-1.5 text-[11px] font-semibold text-gray-600 dark:bg-white/15 dark:text-gray-300">
                {cameras.length}
              </span>
            )}
          </button>
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center dark:border-red-500/20 dark:bg-red-500/10">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
            >
              <RefreshCw size={15} strokeWidth={2.2} />
              Retry
            </button>
          </div>
        ) : loading ? (
          <LoadingState message="Loading configuration…" />
        ) : tab === 'cameras' ? (
          camerasLoading ? (
            <LoadingState message="Loading cameras…" />
          ) : (
            <CamerasPanel cameras={cameras} onToggle={toggleCameraDetection} />
          )
        ) : (
          <>
            {/* Top cards */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <CameraLicenseCard
                totalCameras={totalCameras}
                onChange={(n) => {
                  setSaved(false)
                  setTotalCameras(n)
                }}
              />
              <SubscriptionCard stats={stats} totalDetections={detections.length} />
            </div>

            {/* Detection configuration table */}
            <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
              <div className="flex flex-wrap items-center justify-between gap-2 px-6 pt-5 pb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-purple-500 dark:text-purple-300" strokeWidth={2} />
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    Detection Configuration
                  </h2>
                </div>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {enabledCount} enabled · {assigned} cam-assignments
                </p>
              </div>

              {/* Column header */}
              <div className="grid grid-cols-[minmax(0,1fr)_120px_200px] gap-4 border-y border-gray-200 px-6 py-3 dark:border-white/8">
                <span className="font-mono text-[10px] font-semibold tracking-[0.12em] text-gray-400 uppercase dark:text-gray-600">
                  Detection Type
                </span>
                <span className="text-center font-mono text-[10px] font-semibold tracking-[0.12em] text-gray-400 uppercase dark:text-gray-600">
                  Enabled
                </span>
                <span className="text-right font-mono text-[10px] font-semibold tracking-[0.12em] text-gray-400 uppercase dark:text-gray-600">
                  Cameras Assigned
                </span>
              </div>

              {detections.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                  No detections available for this client.
                </p>
              ) : (
                detections.map((d, i) => (
                  <DetectionRow
                    key={d.settingType}
                    detection={d}
                    index={i}
                    maxCameras={totalCameras}
                    onToggle={(enabled) =>
                      setDetection(d.settingType, {
                        enabled,
                        // Turning off zeroes the allocation; the server treats disabled as 0.
                        cameraAllocation: enabled ? d.cameraAllocation : 0,
                      })
                    }
                    onAllocationChange={(cameraAllocation) =>
                      setDetection(d.settingType, { cameraAllocation })
                    }
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

export default ClientConfig
