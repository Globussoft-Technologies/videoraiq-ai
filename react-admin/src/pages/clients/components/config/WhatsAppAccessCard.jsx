import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react'
import { toast } from 'react-toastify'
import { getSharedKeyAccess, setSharedKeyAccess } from '../../../whatsappKeys/api'

export default function WhatsAppAccessCard({ adminId }) {
  const [shared, setShared] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [readiness, setReadiness] = useState(null)
  const savingRef = useRef(false)
  const refreshVersion = useRef(0)
  useEffect(() => {
    let active = true
    setShared(null)
    setReadiness(null)
    setError('')
    const refresh = async () => {
      if (savingRef.current) return
      const version = ++refreshVersion.current
      try {
        const value = await getSharedKeyAccess(adminId)
        if (active && version === refreshVersion.current) { setShared(value.shared); setReadiness(value.readiness); setError('') }
      } catch (failure) { if (active && version === refreshVersion.current) setError(failure.response?.data?.message || 'Could not load WhatsApp access.') }
    }
    refresh()
    const timer = setInterval(refresh, 15000)
    return () => { active = false; clearInterval(timer) }
  }, [adminId, reload])
  const toggle = async () => {
    if (savingRef.current) return
    savingRef.current = true
    ++refreshVersion.current
    setBusy(true)
    setError('')
    try {
      const value = await setSharedKeyAccess(adminId, !shared)
      setShared(value.shared)
      setReadiness(null)
      toast.success(value.shared ? 'Shared WhatsApp access enabled.' : 'Shared WhatsApp access disabled. The account must verify its own keys to resume alerts.')
      window.dispatchEvent(new Event('whatsapp-key-requests-updated'))
      try {
        const updated = await getSharedKeyAccess(adminId)
        setShared(updated.shared)
        setReadiness(updated.readiness)
      } catch { setError('Access was saved, but the latest status could not be loaded. Retry to refresh it.') }
    } catch (failure) { setError(failure.response?.data?.message || 'Could not update WhatsApp access.') }
    finally { savingRef.current = false; setBusy(false) }
  }
  const checks = readiness ? [
    { label: 'Sender verified', done: readiness.senderReady, detail: shared ? 'Verify the shared sender in Super Admin.' : 'The account must configure and verify its own keys.' },
    { label: 'Image template approved', done: readiness.imageApproved, detail: 'Submit the image template and sync its approval status.' },
    { label: 'Text fallback approved', done: readiness.textApproved, detail: 'Needed to send alerts when a snapshot is unavailable.' },
    { label: `${readiness.recipientCount} opted-in recipient${readiness.recipientCount === 1 ? '' : 's'}`, done: readiness.recipientCount > 0, detail: 'Add recipients with their consent on the account WhatsApp page.' },
    { label: 'Alerts enabled', done: readiness.alertsEnabled, detail: readiness.alertsPaused ? 'Alerts are paused. Resume them on the account WhatsApp page after setup.' : 'Complete sender and template setup to enable alerts.' },
  ] : []
  return <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#0b0d13]">
    <div className="flex items-center justify-between gap-4">
      <div><h2 className="font-semibold text-gray-900 dark:text-white">WhatsApp shared keys</h2>
        {shared !== null && <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${shared ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>{shared ? 'Using Super Admin keys' : readiness?.senderReady ? 'Using own keys' : 'Setup required'}</span>}
        <p className="mt-1 text-sm text-gray-500">Allow this account to use the Super Admin WhatsApp sender without submitting a request. Its own-key configuration is disabled while enabled.</p></div>
      <button type="button" role="switch" aria-label="Use shared WhatsApp keys" aria-checked={shared === true}
        disabled={shared === null || busy} onClick={toggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${shared ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${shared ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
    <p role="status" className="mt-3 text-xs text-gray-500">{busy ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Saving...</span> : shared === null ? 'Loading access...' : shared ? 'This account uses the Super Admin WhatsApp keys. Turning this off will pause alerts until the account verifies its own keys.' : 'Shared access is off. This account must configure and verify its own WhatsApp keys to send alerts. Turn this on to let it use the Super Admin keys instead.'}</p>
    {readiness && <div className="mt-5 border-t border-gray-200 pt-4 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-gray-900 dark:text-white">Alert readiness</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${readiness.ready ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'}`}>{readiness.ready ? 'Ready for configured zones' : readiness.alertsPaused ? 'Alerts paused' : 'Action needed'}</span></div>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">{checks.map(check => <li key={check.label} className="flex items-start gap-2 text-sm">
        {check.done ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" /> : <CircleAlert size={16} className="mt-0.5 shrink-0 text-amber-500" />}
        <div><span className="text-gray-700 dark:text-gray-200">{check.label}</span>{!check.done && <p className="mt-0.5 text-xs text-gray-500">{check.detail}</p>}</div>
      </li>)}</ul>
      <p className="mt-3 text-xs text-gray-500">Select recipients and the alert schedule for each detection zone on the account. Zone selections are checked separately. Status refreshes every 15 seconds; this does not confirm message delivery.</p>
    </div>}
    {error && <div role="alert" className="mt-3 text-sm text-red-500">{error} <button type="button" className="underline" onClick={() => setReload(value => value + 1)}>Retry</button></div>}
  </section>
}
