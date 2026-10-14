import { useEffect, useId, useRef, useState } from 'react'
import { getApiMessage } from '../../utils/apiError'
import { getMonitoringControl, setMonitoringEnabled } from './api'

export default function MonitoringToggle({ onChanged }) {
  const [control, setControl] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const headingId = useId()
  const descriptionId = useId()
  const mounted = useRef(false)
  const saving = useRef(false)
  const revision = useRef(-1)
  const version = useRef(0)
  const onChangedRef = useRef(onChanged)
  useEffect(() => { onChangedRef.current = onChanged }, [onChanged])

  function accept(next) {
    if (!mounted.current || typeof next?.enabled !== 'boolean' || next.revision < revision.current) return
    revision.current = next.revision
    setControl(next)
    setError('')
    onChangedRef.current?.(next.enabled)
  }

  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    let timer
    let stopped = false
    async function load() {
      const currentVersion = version.current
      try {
        if (!saving.current) {
          const next = await getMonitoringControl(controller.signal)
          if (!stopped && currentVersion === version.current) accept(next)
        }
      } catch (err) {
        if (!stopped && currentVersion === version.current)
          setError(getApiMessage(err, 'Unable to load monitoring control'))
      } finally {
        if (!stopped) timer = setTimeout(load, 5000)
      }
    }
    load()
    return () => { stopped = true; mounted.current = false; controller.abort(); clearTimeout(timer) }
  }, [])

  async function toggle() {
    if (!control || saving.current) return
    saving.current = true
    version.current++
    setBusy(true)
    try { accept(await setMonitoringEnabled(!control.enabled)) }
    catch (err) { if (mounted.current) setError(getApiMessage(err, 'Unable to update monitoring control')) }
    finally { saving.current = false; version.current++; if (mounted.current) setBusy(false) }
  }

  return <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
    <div className="flex items-center justify-between gap-4">
      <div>
        <h2 id={headingId} className="text-sm font-semibold text-gray-900 dark:text-white">Stream monitoring and Telegram alerts</h2>
        <p id={descriptionId} className="mt-1 max-w-2xl text-xs leading-5 text-gray-500 dark:text-gray-400">Controls all Superadmin stream checks and alerts. On resumes monitoring and delivery to selected Telegram channels. Off pauses both and preserves outage history.</p>
      </div>
      <button type="button" role="switch" aria-checked={control?.enabled === true} aria-labelledby={headingId} aria-describedby={descriptionId}
        disabled={!control || busy} onClick={toggle}
        className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${control?.enabled ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300'}`}>
        <span aria-hidden="true" className={`flex h-5 w-9 items-center rounded-full p-0.5 ${control?.enabled ? 'bg-white/25' : 'bg-gray-400/30'}`}>
          <span className={`h-4 w-4 rounded-full bg-white transition-transform ${control?.enabled ? 'translate-x-4' : ''}`} />
        </span>
        {busy ? 'Saving…' : !control ? 'Loading…' : control.enabled ? 'On' : 'Off'}
      </button>
    </div>
    {error && <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-300">{error}</p>}
  </section>
}
