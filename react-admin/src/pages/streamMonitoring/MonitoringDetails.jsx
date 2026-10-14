import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { getMonitoringDetails, setMonitoringMuted } from './api'
import { getApiMessage } from '../../utils/apiError'

const time = value => value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' }) + ' IST' : '?'
const verificationLabels = { BATCH_RECHECK: 'Waiting for second batch check', INDIVIDUAL: 'Individual failure verification', READY: 'Waiting for report boundary', FINAL: 'Final delivery checks' }

export default function MonitoringDetails({ adminId, camera, onClose, onChanged }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(0)
  const [notificationPage, setNotificationPage] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    getMonitoringDetails(adminId, camera.cameraId, { skip: page * 10, limit: 10, notificationSkip: notificationPage * 20 }, abort.signal)
      .then(setData).catch(err => { if (!abort.signal.aborted) setError(getApiMessage(err, 'Unable to load details')) })
    return () => abort.abort()
  }, [adminId, camera.cameraId, page, notificationPage])
  async function toggleMuted() {
    setBusy(true)
    try {
      await setMonitoringMuted(adminId, camera.cameraId, !data.alertsMuted)
      setData(previous => ({ ...previous, alertsMuted: !previous.alertsMuted }))
      onChanged()
    } catch (err) { setError(getApiMessage(err, 'Unable to update monitoring')) }
    finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="stream-details-title">
    <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#0b0d13]">
      <div className="mb-4 flex items-center justify-between"><h2 id="stream-details-title" className="font-semibold">{camera.name} ? {camera.nvrName}</h2><button onClick={onClose} aria-label="Close stream details"><X size={20} /></button></div>
      {error && <p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
      {!data ? <p className="text-sm text-gray-500">Loading monitoring details?</p> : <>
        <dl className="grid grid-cols-2 gap-3 text-xs">
          {[['Last confirmed state', data.state], ['Latest result', data.latestResult?.reason || '?'],
            ['Last healthy status report', time(data.lastSuccessfulCheckAt)],
            ['Status received', time(data.statusReceivedAt)], ['Next status check', time(data.nextCheckAt)],
            ['Verification phase', verificationLabels[data.verification?.phase] || 'Routine batch / healthy cooldown'],
            ['Report boundary', time(data.verification?.reportAt)],
            ['Source report age', typeof data.latestResult?.sourceStatusAgeMs === 'number' ? Math.round(data.latestResult.sourceStatusAgeMs / 1000) + ' seconds' : 'Not supplied'],
            ['Source observed', data.latestResult?.sourceObserved === true ? 'Yes' : data.latestResult?.sourceObserved === false ? 'No' : 'Not supplied'],
            ['Fresh output reported', data.latestResult?.outputFresh === true ? 'Yes' : data.latestResult?.outputFresh === false ? 'No' : 'Not supplied'],
            ['Last conclusive check', time(data.lastConclusiveAt)], ['Reminders', data.remindersPaused ? 'Paused' : 'Enabled'],
            ['Last notification', time(data.lastNotificationAt)], ['Next reminder', time(data.nextReminderAt)]]
            .map(([label, value]) => <div key={label}><dt className="text-gray-500">{label}</dt><dd className="mt-1">{value}</dd></div>)}
        </dl>
        <p className="mt-4 text-xs text-gray-500">Muting closes the current outage and cancels its pending alerts. Unmuting starts fresh confirmation.</p>
        <button disabled={busy} onClick={toggleMuted} className="my-3 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-white/10">{data.alertsMuted ? 'Unmute monitoring' : 'Mute monitoring'}</button>
        <h3 className="mt-4 text-sm font-semibold">Outage history</h3>
        {data.outages.map(outage => <div key={outage._id} className="mt-2 rounded-xl border border-gray-200 p-3 text-xs dark:border-white/10">
          <p>{outage.reason} ? {outage.closeReason || 'Open'}</p>
          <p className="mt-1 text-gray-500">First detected: {time(outage.startedAt)} ? Closed: {time(outage.closedAt)}</p>
          <p className="mt-1 font-mono text-[10px] text-gray-500">{outage._id}</p>
          {data.notifications.filter(event => event.outageId === outage._id).map(event => <p key={event._id} className="mt-1 text-gray-500">{event.type} ? {event.status} ? {time(event.sentAt || event.createdAt)}{event.errorCode ? ' ? ' + event.errorCode : ''}</p>)}
        </div>)}
        {!data.outages.length && <p className="mt-2 text-xs text-gray-500">No outage history recorded.</p>}
        <div className="mt-4 flex items-center justify-between text-xs"><button disabled={page === 0} onClick={() => { setPage(value => value - 1); setNotificationPage(0) }}>Previous</button><span>Outages page {page + 1}</span><button disabled={(page + 1) * 10 >= data.totalCount} onClick={() => { setPage(value => value + 1); setNotificationPage(0) }}>Next</button></div>
        <div className="mt-3 flex items-center justify-between text-xs"><button disabled={notificationPage === 0} onClick={() => setNotificationPage(value => value - 1)}>Previous notifications</button><span>{data.notificationTotal} notifications</span><button disabled={(notificationPage + 1) * 20 >= data.notificationTotal} onClick={() => setNotificationPage(value => value + 1)}>Next notifications</button></div>
      </>}
    </div>
  </div>
}
