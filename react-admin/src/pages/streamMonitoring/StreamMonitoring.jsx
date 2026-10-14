import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Activity, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import Topbar from '../../layout/Topbar'
import CustomSelect from '../../components/UI/CustomSelect'
import LoadingState from '../../components/UI/LoadingState'
import Pagination from '../clients/components/Pagination'
import { getApiMessage } from '../../utils/apiError'
import { getMonitoringCameras } from './api'
import AdminPicker from './AdminPicker'
import MonitoringDetails from './MonitoringDetails'
import MonitoringToggle from './MonitoringToggle'

const panel = 'rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/8 dark:bg-[#0b0d13]'
const formatTime = value => value ? new Date(value).toLocaleString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata', timeZoneName: 'short',
}) : '—'

function StreamBadge({ alive, camera }) {
  if (camera.monitoringPaused) return <span className="text-xs text-gray-400">Monitoring paused</span>
  if (camera.alertsMuted) return <span className="text-xs text-gray-400">Muted</span>
  if (camera.state === 'RECOVERING' && camera.availability !== 'STARTING') return <span className="text-xs text-amber-600 dark:text-amber-300">Confirming recovery</span>
  if (camera.state === 'UNKNOWN' && camera.availability === 'REPORTED_RUNNING') return <span className="text-xs text-amber-600 dark:text-amber-300">Confirming availability</span>
  if (camera.availability === 'REPORTED_RUNNING') return <span title="The streaming service reports running; direct HLS availability has not been verified" className="text-xs text-emerald-600 dark:text-emerald-300">{camera.downSince ? 'Reported running · outage unverified' : 'Alive · status reported'}</span>
  if (camera.availability === 'IDLE') return <span title="RTSP is online; HLS playback is intentionally idle and was not requested" className="text-xs text-emerald-600 dark:text-emerald-300">{camera.downSince ? 'Idle · outage unverified' : 'Available / Idle'}</span>
  if (camera.availability === 'STARTING') return <span className="text-xs text-amber-600 dark:text-amber-300">Starting / Queued</span>
  if (camera.state === 'SUSPECTED_DOWN') return <span className="text-xs text-amber-600 dark:text-amber-300">Confirming failure</span>
  if (camera.state === 'RECOVERING') return <span className="text-xs text-amber-600 dark:text-amber-300">Confirming recovery</span>
  if (alive === null) return <span title="Stream status is unavailable" className="text-xs text-gray-400">—</span>
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${alive
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20'
    : 'bg-gray-100 text-gray-500 ring-gray-200 dark:bg-white/8 dark:text-gray-400 dark:ring-white/10'}`}>
    <span className={`h-2 w-2 rounded-full ${alive ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-500'}`} />
    {alive ? 'Alive' : 'Down'}
  </span>
}

function StreamCount({ label, value, alive, active, onClick }) {
  const Icon = alive ? Wifi : WifiOff
  return <button type="button" onClick={onClick} aria-pressed={active} className={`${panel} flex items-center justify-between p-4 text-left ${active ? 'ring-2 ring-purple-400/30' : ''}`}>
    <div><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">{label}</p><p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p></div>
    <span className={`rounded-xl p-3 ${alive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-white/8 dark:text-gray-300'}`}><Icon size={19} /></span>
  </button>
}

function ClientStreams({ adminId, onAdminChange, monitoringEnabled }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [nvrId, setNvrId] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [reload, setReload] = useState(0)
  const [details, setDetails] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    let stopped = false
    let timer
    async function load() {
      if (document.hidden) { timer = setTimeout(load, 20_000); return }
      setLoading(true)
      try {
        const result = await getMonitoringCameras(adminId, { nvrId: nvrId || undefined, status: status || undefined, skip: page * pageSize, limit: pageSize }, controller.signal)
        if (stopped) return
        setData(result)
        setError('')
        if (page > 0 && page * pageSize >= result.totalCount) setPage(Math.max(0, Math.ceil(result.totalCount / pageSize) - 1))
      } catch (err) { if (!stopped) setError(getApiMessage(err, 'Unable to load stream status')) }
      finally { if (!stopped) { setLoading(false); timer = setTimeout(load, 20_000) } }
    }
    load()
    return () => { stopped = true; clearTimeout(timer); controller.abort() }
  }, [adminId, nvrId, status, page, pageSize, reload, monitoringEnabled])

  const selectStatus = value => { setStatus(value === status ? '' : value); setPage(0) }
  return <>
    <AdminPicker adminId={adminId} admin={data?.admin} onChange={onAdminChange} />
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-bold text-gray-900 dark:text-white">{data?.admin?.name || 'Admin streams'}</h2><p className="text-xs text-gray-400 dark:text-gray-500">{data?.admin?.email}</p></div>
      <div className="flex items-center gap-3"><CustomSelect value={nvrId} options={[{ value: '', label: 'All NVRs' }, ...(data?.nvrs || []).map(nvr => ({ value: nvr.nvrId, label: nvr.name }))]} onChange={value => { setNvrId(value); setPage(0) }} className="min-w-40" /><button type="button" disabled={loading} onClick={() => setReload(value => value + 1)} aria-label="Refresh stream status" className="rounded-xl border border-gray-200 bg-white p-2.5 text-gray-500 disabled:opacity-50 dark:border-white/8 dark:bg-white/5 dark:text-gray-300"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button></div>
    </div>
    {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-300">{error} <button type="button" onClick={() => setReload(value => value + 1)} className="underline">Retry</button></p>}
    {loading && !data ? <LoadingState message="Loading streams…" /> : data && <>
      <div className="mb-5 grid grid-cols-2 gap-4">
        <StreamCount label="Streaming alive" value={error || monitoringEnabled === false || !data.enabled ? '—' : data.counts.alive} alive active={status === 'alive'} onClick={() => selectStatus('alive')} />
        <StreamCount label="Streaming down" value={error || monitoringEnabled === false || !data.enabled ? '—' : data.counts.down} alive={false} active={status === 'down'} onClick={() => selectStatus('down')} />
      </div>
      <p className="mb-3 text-xs text-gray-400">The alive count includes available idle and status-reported feeds. These do not establish verified video playback.</p>
      {status && <button type="button" onClick={() => selectStatus('')} className="mb-3 text-xs font-semibold text-purple-600 dark:text-purple-300">Show all streams</button>}
      {(!data.enabled || monitoringEnabled === false || data.statusUnavailable) && <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">{!data.enabled || monitoringEnabled === false ? 'Stream monitoring and Telegram alerts are paused.' : 'Some stream statuses are unavailable and are excluded from the counts.'}</p>}
      <div className={`${panel} overflow-hidden`} aria-busy={loading}>
        <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left">
          <thead><tr className="border-b border-gray-200 dark:border-white/8">{['Camera', 'NVR', 'Streaming', 'Down since'].map(heading => <th key={heading} scope="col" className="px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">{heading}</th>)}</tr></thead>
          <tbody>{!data.cameras.length ? <tr><td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-400">No streams match this selection.</td></tr> : data.cameras.map(camera => <tr key={camera.cameraId} className="border-b border-gray-100 last:border-b-0 dark:border-white/5">
            <td className="px-5 py-4"><p className="text-sm font-semibold text-gray-900 dark:text-white">{camera.name}</p><p className="mt-1 font-mono text-[10px] text-gray-400">{camera.channelId || '—'}</p></td>
            <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{camera.nvrName}</td>
            <td className="px-5 py-4"><StreamBadge alive={error ? null : camera.alive} camera={monitoringEnabled === false ? { monitoringPaused: true } : error ? {} : camera} /><button onClick={() => setDetails(camera)} className="mt-1 block text-[10px] text-purple-600 dark:text-purple-300">Details</button>{camera.remindersPaused && <span className="mt-1 block text-[10px] text-gray-400">Reminders paused</span>}</td>
            <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400" title="First detected failure in this outage">{formatTime(!error ? camera.downSince : null)}</td>
          </tr>)}</tbody>
        </table></div>
      </div>
      <Pagination page={page} pageSize={pageSize} total={data.totalCount} onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(0) }} />
    </>}
    {details && <MonitoringDetails adminId={adminId} camera={details} onClose={() => setDetails(null)} onChanged={() => setReload(value => value + 1)} />}
  </>
}

export default function StreamMonitoring() {
  const [monitoringEnabled, setMonitoringEnabled] = useState(null)
  const { adminId } = useParams()
  const navigate = useNavigate()
  const chooseAdmin = value => navigate(value ? `/stream-monitoring/${value}` : '/stream-monitoring')
  return <>
    <Topbar eyebrow="PLATFORM · OPERATIONS" title="Stream Monitoring" showRegionStatus={false} />
    <div className="px-4 py-6 sm:px-8"><MonitoringToggle onChanged={setMonitoringEnabled} />{adminId ? <ClientStreams key={adminId} adminId={adminId} onAdminChange={chooseAdmin} monitoringEnabled={monitoringEnabled} /> : <>
      <AdminPicker onChange={chooseAdmin} />
      <div className={`${panel} px-6 py-14 text-center`}><Activity size={28} className="mx-auto mb-3 text-purple-500" /><p className="text-sm text-gray-500 dark:text-gray-400">Select an admin to view streaming alive, streaming down, and down times.</p></div>
    </>}</div>
  </>
}
