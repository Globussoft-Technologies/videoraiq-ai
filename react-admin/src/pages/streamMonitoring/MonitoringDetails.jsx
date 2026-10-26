import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { getMonitoringDetails, setMonitoringMuted } from './api'
import { getApiMessage } from '../../utils/apiError'

const time = value => value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' }) + ' IST' : '—'
const boolean = value => typeof value === 'boolean' ? String(value) : 'Unknown'

export default function MonitoringDetails({ adminId, camera, onClose, onChanged }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(0)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    getMonitoringDetails(adminId, camera.cameraId, { notificationSkip: page * 20 }, abort.signal)
      .then(result => { setData(result); setError('') })
      .catch(err => { if (!abort.signal.aborted) setError(getApiMessage(err, 'Unable to load details')) })
    return () => abort.abort()
  }, [adminId, camera.cameraId, page, reload])
  async function toggleMuted() {
    setBusy(true)
    try {
      await setMonitoringMuted(adminId, camera.cameraId, !data.alertsMuted)
      setReload(value => value + 1)
      onChanged()
    } catch (err) { setError(getApiMessage(err, 'Unable to update monitoring')) }
    finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="stream-details-title">
    <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#0b0d13]">
      <div className="mb-4 flex items-center justify-between"><h2 id="stream-details-title" className="font-semibold">{camera.name} · {camera.nvrName}</h2><button onClick={onClose} aria-label="Close stream details"><X size={20} /></button></div>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {!data ? <p className="text-sm text-gray-500">Loading monitoring details…</p> : <>
        <dl className="grid grid-cols-2 gap-3 text-xs">
          {[['Current status', data.state], ['RTSP online', boolean(data.latestResult?.rtspOnline)],
            ['Stream status', data.latestResult?.streamStatus || 'Unknown'],
            ['Source checked', time(data.checkedAt)], ['Status received', time(data.statusReceivedAt)],
            ['Next status check', time(data.nextCheckAt)], ['First detected down', time(data.downSince)],
            ['Check interval', Math.round(data.checkIntervalMs / 60000) + ' minutes'],
            ['Down report interval', Math.round(data.reportIntervalMs / 60000) + ' minutes'],
            ['Down alerts', data.remindersPaused ? 'Paused' : 'Enabled'],
            ['Last notification', time(data.lastNotificationAt)]]
            .map(([label, value]) => <div key={label}><dt className="text-gray-500">{label}</dt><dd className="mt-1">{value}</dd></div>)}
        </dl>
        <p className="mt-4 text-xs text-gray-500">Only current Down cameras are included in each 10-minute report. Muted cameras are excluded; unmuted cameras return on the next check.</p>
        <button disabled={busy} onClick={toggleMuted} className="my-3 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-white/10">{data.alertsMuted ? 'Unmute monitoring' : 'Mute monitoring'}</button>
        <h3 className="mt-4 text-sm font-semibold">Down notifications</h3>
        {data.notifications.map(event => <p key={event._id} className="mt-2 text-xs text-gray-500">{event.status} · {time(event.sentAt || event.createdAt)}</p>)}
        {!data.notifications.length && <p className="mt-2 text-xs text-gray-500">No notifications recorded by this monitor.</p>}
        <div className="mt-3 flex items-center justify-between text-xs"><button disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><span>{data.notificationTotal} notifications</span><button disabled={(page + 1) * 20 >= data.notificationTotal} onClick={() => setPage(value => value + 1)}>Next</button></div>
      </>}
    </div>
  </div>
}
