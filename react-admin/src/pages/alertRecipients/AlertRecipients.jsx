import { useEffect, useRef, useState } from 'react'
import { Check, Copy, RefreshCw, Search } from 'lucide-react'
import { toast } from 'react-toastify'
import Topbar from '../../layout/Topbar'
import LoadingState from '../../components/UI/LoadingState'
import CustomSelect from '../../components/UI/CustomSelect'
import Pagination from '../clients/components/Pagination'
import { getApiMessage } from '../../utils/apiError'
import { getTelegramSettings, selectTelegramChannel, unlinkTelegramChannel } from './api'
import MonitoringToggle from '../streamMonitoring/MonitoringToggle'

const panel = 'rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/8 dark:bg-[#0b0d13]'
const button = 'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50'
const primary = `${button} bg-linear-to-r from-blue-600 to-purple-600 text-white`
const date = value => value ? new Date(value).toLocaleString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
}) : '—'

function DisconnectDialog({ channel, busy, onClose, onConfirm }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} aria-labelledby="disconnect-heading" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} className={`${panel} m-auto w-[calc(100%-2rem)] max-w-md p-6 text-gray-900 backdrop:bg-black/50 dark:text-white`}>
    <h3 id="disconnect-heading" className="mb-3 text-base font-semibold">Disconnect Telegram channel</h3>
    <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">Stop superadmin stream alerts to {channel.channelName}? Its existing stagingv2 alerts will continue.</p>
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" autoFocus disabled={busy} onClick={onClose} className={`${button} border border-gray-200 dark:border-white/8`}>Cancel</button>
      <button type="button" disabled={busy} onClick={onConfirm} className={`${button} bg-red-600 text-white`}>{busy ? 'Disconnecting…' : 'Disconnect'}</button>
    </div>
  </dialog>
}

export default function AlertRecipients() {
  const [data, setData] = useState(null)
  const [monitoringEnabled, setMonitoringEnabled] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef(null)
  const [busy, setBusy] = useState(false)
  const [disconnect, setDisconnect] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const mounted = useRef(true)
  const mutationVersion = useRef(0)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; clearTimeout(copyTimer.current) }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let stopped = false
    let timer
    const stopAt = Date.now() + 60_000
    async function load() {
      const version = mutationVersion.current
      try {
        const result = await getTelegramSettings(controller.signal)
        if (stopped || version !== mutationVersion.current) return
        setData(result)
        setError('')
      } catch (err) {
        if (!stopped && version === mutationVersion.current)
          setError(getApiMessage(err, 'Unable to load Telegram channels'))
      } finally {
        if (!stopped) {
          setLoading(false)
          if (Date.now() < stopAt) timer = setTimeout(load, 3000)
        }
      }
    }
    load()
    return () => { stopped = true; clearTimeout(timer); controller.abort() }
  }, [reload])

  function refreshChannels() {
    setLoading(true)
    setReload(value => value + 1)
  }

  async function updateChannel(action, message) {
    mutationVersion.current++
    setBusy(true)
    try {
      const result = await action()
      if (!mounted.current) return
      setData(result)
      setError('')
      toast.success(message)
      return true
    } catch (err) {
      if (mounted.current) toast.error(getApiMessage(err, 'Unable to update Telegram channel'))
    } finally {
      mutationVersion.current++
      if (mounted.current) setBusy(false)
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(data.code)
      if (!mounted.current) return
      setCopied(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch { toast.error('Could not copy the code') }
  }

  function selectChannel(chatId) {
    if (chatId !== data.selectedChatId)
      updateChannel(() => selectTelegramChannel(chatId), 'Stream alert delivery channel selected')
  }

  async function disconnectChannel() {
    if (await updateChannel(() => unlinkTelegramChannel(disconnect.chatId), 'Telegram channel disconnected'))
      refreshChannels()
    if (mounted.current) setDisconnect(null)
  }

  const channels = data?.channels || []
  const filtered = channels.filter(channel => `${channel.channelName} ${channel.chatId}`.toLowerCase().includes(search.toLowerCase()))
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1))
  const botName = String(data?.botUsername || '').replace(/^@/, '')
  return <>
    <Topbar eyebrow="PLATFORM · SETTINGS" title="Alert Recipients" showRegionStatus={false} />
    <div className="px-4 py-6 sm:px-8">
      <MonitoringToggle onChanged={setMonitoringEnabled} />
      {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-300">{error} <button type="button" onClick={refreshChannels} className="underline">Retry</button></p>}
      {loading && !data ? <LoadingState message="Loading Telegram alerts…" /> : data && <>
        <div className="mb-5 inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-white/8 dark:bg-white/5"><span className="rounded-lg bg-linear-to-r from-blue-600 to-purple-600 px-5 py-2 text-xs font-semibold text-white">Telegram</span></div>
        <section className={`${panel} mb-5 overflow-hidden`} aria-labelledby="telegram-heading">
          <h2 id="telegram-heading" className="border-b border-gray-200 px-5 py-4 text-sm font-semibold dark:border-white/8">Telegram Alerts</h2>
          <div className="p-5">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-white/8 dark:bg-white/3">
              {channels.length > 0 && <p className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">{channels.length} Telegram {channels.length === 1 ? 'channel' : 'channels'} connected.</p>}
              <ol className="list-decimal space-y-2 pl-5 text-xs leading-6 text-gray-600 dark:text-gray-400">
                <li>Create a Telegram channel.</li>
                <li>Add our bot as an admin: <a href={`https://t.me/${encodeURIComponent(botName)}`} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400">@{botName}</a> (grant permission to post messages).</li>
                <li>Copy the code below, paste it in your channel, and press Enter.</li>
              </ol>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <code className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm tracking-wider dark:border-white/8 dark:bg-[#0b0d13]">{data.code || 'Refresh to get a code'}</code>
                <button type="button" disabled={!data.code || busy || loading || !!error || !data.botConfigured} onClick={copyCode} className={`${button} border border-gray-200 text-gray-600 dark:border-white/8 dark:text-gray-300`}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</button>
              </div>
              <button type="button" disabled={loading || busy} onClick={refreshChannels} className={`${primary} mt-3`}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />I’ve posted the code - Refresh</button>
              {channels.length > 0 && <div className="mt-5 max-w-xl">
                <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">Send stream alerts to</p>
                <CustomSelect value={data.selectedChatId} options={channels.map(channel => ({ value: channel.chatId, label: channel.channelName }))} onChange={selectChannel} disabled={busy || loading || !!error} />
              </div>}
              <p className="mt-4 text-xs leading-5 text-gray-500 dark:text-gray-400">Connecting a channel selects it for alerts when monitoring is On. Due cameras are checked in batches, with a second check after {Math.round((data.checkIntervalMs || 300000) / 60000)} minutes. Suspects are then checked individually every {Math.round((data.individualIntervalMs || 30000) / 1000)} seconds for {Math.round((data.verificationWindowMs || 300000) / 60000)} minutes. Down alerts require a final individual check before delivery. Healthy cameras are not checked again for {Math.round((data.aliveIntervalMs || 900000) / 60000)} minutes. Down and recovery reports are released at {Math.round((data.cycleMs || 900000) / 60000)}-minute cycle boundaries, grouped by admin and NVR. Reminders remain at least {Math.round((data.reminderMs || 900000) / 60000)} minutes apart after successful delivery. Idle and queued feeds do not trigger Down alerts.</p>
              {(monitoringEnabled ?? data.collectorEnabled) === false && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Monitoring and Telegram alerts are paused.</p>}
              {!data.botConfigured && <p className="mt-3 text-xs text-red-600 dark:text-red-300">The Telegram bot is not configured in the superadmin backend.</p>}
            </div>
          </div>
        </section>
        <label className="relative mb-4 block max-w-xs"><span className="sr-only">Search Telegram channels</span><Search size={14} className="absolute left-3 top-3 text-gray-400" /><input value={search} onChange={event => { setSearch(event.target.value); setPage(0) }} placeholder="Search by channel name…" className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-purple-400 dark:border-white/8 dark:bg-[#0b0d13]" /></label>
        <section className={`${panel} overflow-hidden`} aria-labelledby="channels-heading">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-5 py-4 dark:border-white/8"><h2 id="channels-heading" className="text-sm font-semibold">Connected Telegram Channels</h2><div className="flex items-center gap-3"><span className="font-mono text-[10px] text-gray-400">{filtered.length} shown · {channels.length} connected</span><button type="button" disabled={loading || busy} onClick={refreshChannels} className={`${button} border border-gray-200 dark:border-white/8`}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh</button></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left">
            <thead><tr className="border-b border-gray-200 dark:border-white/8">{['Channel name', 'Channel ID', 'Status', 'Connected at', 'Action'].map(heading => <th key={heading} scope="col" className="px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-gray-400">{heading}</th>)}</tr></thead>
            <tbody>{filtered.length ? filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(channel => <tr key={channel.chatId} className="border-b border-gray-100 last:border-b-0 dark:border-white/5">
              <td className="px-5 py-4 text-xs font-semibold">{channel.channelName}</td>
              <td className="px-5 py-4 font-mono text-[11px] text-gray-500 dark:text-gray-400">{channel.chatId}</td>
              <td className="px-5 py-4"><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300">{channel.chatId === data.selectedChatId ? ((monitoringEnabled ?? data.collectorEnabled) ? 'Receiving alerts' : 'Alerts paused') : 'Connected'}</span></td>
              <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400">{date(channel.linkedAt)}</td>
              <td className="px-5 py-4"><button type="button" disabled={busy || !!error} onClick={() => setDisconnect(channel)} className={`${button} border border-red-500/30 text-red-600 dark:text-red-400`}>Disconnect</button></td>
            </tr>) : <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">{search ? 'No channels match this search.' : 'No Telegram channels connected yet.'}</td></tr>}</tbody>
          </table></div>
        </section>
        {filtered.length > 10 && <Pagination page={currentPage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(0) }} />}
        {disconnect && <DisconnectDialog channel={disconnect} busy={busy} onClose={() => setDisconnect(null)} onConfirm={disconnectChannel} />}
      </>}
    </div>
  </>
}
