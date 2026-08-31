import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldHalf,
  ToggleLeft,
  ToggleRight,
  Video,
  X,
} from 'lucide-react'
import Topbar from '../../layout/Topbar'
import CameraLicenseCard from './components/config/CameraLicenseCard'
import SubscriptionCard from './components/config/SubscriptionCard'
import DetectionRow from './components/config/DetectionRow'
import CamerasPanel from './components/config/CamerasPanel'
import LoadingState from '../../components/UI/LoadingState'
import { getClientConfig, getClientCameras } from './apis/get/clientConfig'
import {
  updatePurchasedCameras,
  updateDetection,
  updateCameraDetection,
  syncDetectionCatalog,
} from './apis/put'
import { getApiMessage, notifyApiError, notifyApiSuccess } from '../../utils/apiError'

// How long edits must settle before an auto-save fires. Long enough that
// holding a stepper is one request, short enough to feel immediate.
const AUTOSAVE_DELAY_MS = 700

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
  // Guards against a second flush starting while one is in flight — the
  // debounce timer and an in-progress request can otherwise overlap.
  const savingRef = useRef(false)
  const savingCamerasRef = useRef(false)
  // Always holds the newest edits, so an in-flight save can tell whether the
  // user changed anything while it was running.
  const latestRef = useRef({ totalCameras: 0, detections: [] })

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

  // Filters the Detection Configuration table only — never what gets saved.
  const [detectionSearch, setDetectionSearch] = useState('')
  const [syncing, setSyncing] = useState(false)

  // Pull the platform detection list again. The client backend publishes its
  // DETECTION_TYPES into a shared catalog on boot; this picks up anything added
  // there (Car Model Detection, say) without redeploying the superadmin.
  // Unsaved edits are intentionally discarded — the row set itself may change,
  // so merging a half-finished edit into a different list is not safe.
  const handleSyncDetections = async () => {
    setSyncing(true)
    try {
      const res = await syncDetectionCatalog()
      notifyApiSuccess(res, 'Detection list synced')
      const fresh = await getClientConfig(adminId)
      applyData(fresh)
      setSaved(false)
    } catch (err) {
      notifyApiError(err, 'Failed to sync detections')
    } finally {
      setSyncing(false)
    }
  }

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
    if (!camerasTabDirty || savingCamerasRef.current) return
    savingCamerasRef.current = true
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
      savingCamerasRef.current = false
      setSavingCameras(false)
    }
  }

  // Auto-save the per-camera toggles, same debounce as the licence tab.
  useEffect(() => {
    if (!camerasTabDirty) return undefined
    const timer = setTimeout(() => { handleSaveCameras() }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camerasTabDirty, cameras])

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

  // Rows matching the search box. `index` is carried from the full list so a
  // detection keeps its icon tint while filtering instead of the colours
  // reshuffling as you type.
  const visibleDetections = useMemo(() => {
    const q = detectionSearch.trim().toLowerCase()
    const withIndex = detections.map((d, index) => ({ ...d, index }))
    return q
      ? withIndex.filter(
          (d) =>
            (d.name || '').toLowerCase().includes(q) ||
            (d.settingType || '').toLowerCase().includes(q)
        )
      : withIndex
  }, [detections, detectionSearch])

  const isFiltered = detectionSearch.trim().length > 0
  const visibleEnabledCount = visibleDetections.filter((d) => d.enabled).length

  // Turn every detection on or off in one go, instead of 20-odd clicks.
  // Disabling zeroes the allocation exactly like the per-row toggle does — the
  // server treats a disabled detection as 0, so leaving a stale number behind
  // would make the UI disagree with what gets saved.
  // Scoped to whatever the search box is showing. Flipping rows the admin
  // cannot see while a filter is applied is the classic footgun, so with a
  // search active this only touches the matches (and the button says so).
  const setAllEnabled = (enabled) => {
    setSaved(false)
    const scope = new Set(visibleDetections.map((d) => d.settingType))
    setDetections((prev) =>
      prev.map((d) =>
        scope.has(d.settingType)
          ? { ...d, enabled, cameraAllocation: enabled ? d.cameraAllocation : 0 }
          : d
      )
    )
  }

  // Copy one row's camera count onto every ENABLED detection. Disabled ones are
  // left alone: giving them an allocation would silently queue a change the
  // admin never asked for, and the server would store it against a detection
  // the client cannot use.
  const applyAllocationToAll = (cameraAllocation) => {
    const next = Math.max(0, Math.min(totalCameras, Number(cameraAllocation) || 0))
    setSaved(false)
    const scope = new Set(visibleDetections.map((d) => d.settingType))
    setDetections((prev) =>
      prev.map((d) => (d.enabled && scope.has(d.settingType) ? { ...d, cameraAllocation: next } : d))
    )
  }

  // Drives the header button's direction: once everything in view is on, it
  // flips to "Disable all".
  const allEnabled =
    visibleDetections.length > 0 && visibleEnabledCount === visibleDetections.length

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

  // Kept in an effect, not assigned during render (refs must not be written
  // while rendering). It lands well before any in-flight save reads it.
  useEffect(() => {
    latestRef.current = { totalCameras, detections }
  }, [totalCameras, detections])

  // Persist whatever differs from the baseline. Not bound to a button: it runs
  // automatically once edits settle (see the debounce below).
  //
  // Still diff-and-flush rather than one request per control. A stepper fires on
  // every click and "Enable all" changes 21 rows at once, so per-control saves
  // would be a burst of requests racing each other — and the camera licence has
  // to land BEFORE any allocation that depends on it, since the server rejects
  // an allocation above the purchased count.
  const flushChanges = async () => {
    if (savingRef.current) return
    if (!camerasDirty && dirtyDetections.length === 0) return

    // What this flush is about to persist. Compared afterwards so a save cannot
    // clobber an edit made while it was in flight: React gives a NEW array
    // reference on every change, so an unchanged reference means the user has
    // not touched anything since.
    const sentDetections = detections
    const sentTotalCameras = totalCameras

    savingRef.current = true
    setSaving(true)
    try {
      if (camerasDirty) {
        await updatePurchasedCameras(adminId, totalCameras)
      }
      // Sequential so a failure points at a specific detection.
      for (const d of dirtyDetections) {
        await updateDetection(adminId, d.settingType, {
          cameraAllocation: Number(d.cameraAllocation) || 0,
          enabled: d.enabled,
        })
      }
      // Re-sync stats + baseline from the server so the meters, the usage
      // counts and the dirty state all reflect what was actually stored.
      const fresh = await getClientConfig(adminId)
      if (latestRef.current.detections === sentDetections &&
          latestRef.current.totalCameras === sentTotalCameras) {
        applyData(fresh)
        setSaved(true)
      } else {
        // Edited mid-save. Keep those edits on screen — the effect will fire
        // again and persist them — and take only the server-owned stats.
        setStats(fresh?.body?.data?.stats ?? fresh?.data?.stats ?? null)
      }
    } catch (err) {
      // No success toast — auto-save fires constantly and would be noise. A
      // FAILURE still needs saying, and carries the API's own message (e.g.
      // "purchasedCameras exceeds available cameras…").
      notifyApiError(err, 'Failed to save configuration')
      // Re-read so the screen shows what the server actually has, rather than
      // leaving a rejected edit on screen looking as though it applied.
      try {
        applyData(await getClientConfig(adminId))
      } catch {
        // Nothing useful to do; the toast above already reported the problem.
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // Auto-save. Waits for edits to settle so holding "+" on a stepper produces
  // one save, not one per click, and a bulk action produces one flush for all
  // the rows it touched.
  useEffect(() => {
    if (!isDirty || loading || error) return undefined
    const timer = setTimeout(() => { flushChanges() }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
    // flushChanges is intentionally omitted: it is recreated every render, so
    // depending on it would reset the debounce on each keystroke and never fire.
    // The values it reads are all listed here instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, totalCameras, detections, loading, error])

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

          {/* License tab: changes save themselves; this only reports state, so
              the admin can tell a stored change from one still in flight. */}
          {tab === 'license' && (
            <div className="flex items-center gap-2 text-sm">
              {saving ? (
                <>
                  <Loader2 size={15} strokeWidth={2.2} className="animate-spin text-gray-400" />
                  <span className="font-medium text-gray-500 dark:text-gray-400">Saving…</span>
                </>
              ) : isDirty ? (
                <span className="font-medium text-gray-400 dark:text-gray-500">Unsaved changes</span>
              ) : saved ? (
                <>
                  <Check size={15} strokeWidth={2.6} className="text-green-600 dark:text-green-400" />
                  <span className="font-medium text-green-600 dark:text-green-400">All changes saved</span>
                </>
              ) : null}
            </div>
          )}

          {/* Cameras tab: same — toggles persist themselves. */}
          {tab === 'cameras' && (
            <div className="flex items-center gap-2 text-sm">
              {savingCameras ? (
                <>
                  <Loader2 size={15} strokeWidth={2.2} className="animate-spin text-gray-400" />
                  <span className="font-medium text-gray-500 dark:text-gray-400">Saving…</span>
                </>
              ) : camerasTabDirty ? (
                <span className="font-medium text-gray-400 dark:text-gray-500">Unsaved changes</span>
              ) : null}
            </div>
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
                licenseInUse={stats?.licenseInUse ?? 0}
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
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search
                      size={14}
                      strokeWidth={2}
                      className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                    />
                    <input
                      type="text"
                      value={detectionSearch}
                      onChange={(e) => setDetectionSearch(e.target.value)}
                      placeholder="Search detections…"
                      aria-label="Search detections"
                      className="h-9 w-56 rounded-lg border border-gray-200 bg-white pr-8 pl-8 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 dark:border-white/10 dark:bg-white/4 dark:text-white dark:placeholder:text-gray-500"
                    />
                    {detectionSearch && (
                      <button
                        type="button"
                        onClick={() => setDetectionSearch('')}
                        aria-label="Clear detection search"
                        className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                      >
                        <X size={13} strokeWidth={2.4} />
                      </button>
                    )}
                  </div>

                  {/* Acts on the rows currently in view — the label says which,
                      so a filtered "Enable all" is never a surprise. */}
                  <button
                    type="button"
                    onClick={() => setAllEnabled(!allEnabled)}
                    disabled={visibleDetections.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/4 dark:text-gray-300 dark:hover:bg-white/8"
                  >
                    {allEnabled ? (
                      <>
                        <ToggleLeft size={15} strokeWidth={2} />
                        {isFiltered ? `Disable ${visibleDetections.length} shown` : 'Disable all'}
                      </>
                    ) : (
                      <>
                        <ToggleRight size={15} strokeWidth={2} />
                        {isFiltered ? `Enable ${visibleDetections.length} shown` : 'Enable all'}
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleSyncDetections}
                    disabled={syncing}
                    title="Re-read the platform detection list published by the client backend"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/4 dark:text-gray-300 dark:hover:bg-white/8"
                  >
                    <RefreshCw
                      size={14}
                      strokeWidth={2.2}
                      className={syncing ? 'animate-spin' : undefined}
                    />
                    {syncing ? 'Syncing…' : 'Sync detections'}
                  </button>

                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    {isFiltered && `${visibleDetections.length} of ${detections.length} shown · `}
                    {enabledCount} enabled · {assigned} cam-assignments
                  </p>
                </div>
              </div>

              {/* Column header */}
              <div className="grid grid-cols-[minmax(0,1fr)_120px_290px] gap-4 border-y border-gray-200 px-6 py-3 dark:border-white/8">
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

              {stats?.detectionsStale && (
                <p className="border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                  Showing a local fallback list — the client backend has not published its
                  detection catalog yet. Restart it, then press Sync detections.
                </p>
              )}

              {detections.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                  No detections available for this client.
                </p>
              ) : visibleDetections.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                  No detections match “{detectionSearch}”.
                </p>
              ) : (
                visibleDetections.map((d) => (
                  <DetectionRow
                    key={d.settingType}
                    detection={d}
                    index={d.index}
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
                    onApplyToAll={() => applyAllocationToAll(d.cameraAllocation)}
                    applyToAllCount={visibleEnabledCount}
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
