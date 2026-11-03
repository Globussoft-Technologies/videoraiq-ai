import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import Topbar from '../../layout/Topbar'
import { getKeyRequests, reviewKeyRequest } from './api'

const button = 'rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-white/10'
export default function WhatsAppKeyRequests() {
  const [status, setStatus] = useState('pending')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const load = async () => { const value = await getKeyRequests(status, page); setData(value); setError('') }
  useEffect(() => {
    let active = true
    const refresh = () => getKeyRequests(status, page).then(value => { if (active) { setData(value); setError('') } }).catch(() => { if (active) setError('Could not load WhatsApp key requests.') })
    setData(null); refresh()
    const timer = setInterval(refresh, 30000)
    return () => { active = false; clearInterval(timer) }
  }, [status, page])
  const review = async (row, decision) => {
    setBusy(String(row._id))
    try {
      await reviewKeyRequest(row.adminId, row.sharedKeyRequest.requestId, decision)
      toast.success(`Request ${decision === 'approve' ? 'approved' : 'rejected'}`)
      window.dispatchEvent(new Event('whatsapp-key-requests-updated'))
      await load()
    } catch (failure) { setError(failure.response?.data?.message || 'Could not review request. Refresh and try again.') }
    finally { setBusy('') }
  }
  return <>
    <Topbar title="WhatsApp key requests" eyebrow="ACCOUNT REQUESTS" />
    <div className="space-y-5 p-6">
      <p className="text-sm text-gray-500">Approve account access to the backend’s shared WhatsApp sender, or approve cancellation so the account returns to its own keys. Sender secrets are never displayed here.</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">Status <select className={`${button} ml-2 bg-white dark:bg-gray-900`} value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}>{['pending', 'approved', 'rejected', 'all'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <button className={button} onClick={() => load().catch(() => setError('Could not refresh requests.'))}>Refresh</button>
        <span className="text-xs text-gray-500">{data?.pendingCount ?? '—'} pending</span>
      </div>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      {!data ? <p className="text-sm text-gray-500">Loading requests…</p> : <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
        <table className="w-full text-left text-sm"><thead className="bg-gray-100 text-xs dark:bg-white/5"><tr>{['Account', 'Request', 'Requested', 'Status', 'Action'].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead>
          <tbody>{data.requests.map(row => <tr key={row.sharedKeyRequest.requestId} className="border-t border-gray-200 dark:border-white/10">
            <td className="p-4"><strong>{row.sharedKeyRequest.adminName || row.account?.login || 'Deleted account'}</strong><div className="text-xs text-gray-500">{row.account?.email}</div></td>
            <td className="p-4">{row.sharedKeyRequest.type === 'cancel' ? 'Cancel shared keys; return to own keys' : 'Use Admin ENV keys'}</td>
            <td className="p-4 text-xs">{new Date(row.sharedKeyRequest.requestedAt).toLocaleString()}</td>
            <td className="p-4">{row.sharedKeyRequest.status}</td>
            <td className="p-4">{row.sharedKeyRequest.status === 'pending' && row.account && <div className="flex gap-2">
              <button disabled={!!busy} className={`${button} bg-green-600 text-white`} onClick={() => review(row, 'approve')}>{busy === String(row._id) ? 'Saving…' : 'Approve'}</button>
              <button disabled={!!busy} className={button} onClick={() => review(row, 'reject')}>Reject</button>
            </div>}</td>
          </tr>)}{!data.requests.length && <tr><td colSpan={5} className="p-8 text-center text-gray-500">No requests found.</td></tr>}</tbody>
        </table>
      </div>}
      {data && <div className="flex items-center justify-end gap-3 text-xs"><button className={button} disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page}</span><button className={button} disabled={page * 25 >= data.total} onClick={() => setPage(value => value + 1)}>Next</button></div>}
    </div>
  </>
}
