import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import CustomSelect from '../../components/UI/CustomSelect'
import { getClients } from '../clients/apis/get'
import { getApiMessage } from '../../utils/apiError'

export default function AdminPicker({ adminId, admin, onChange }) {
  const [search, setSearch] = useState('')
  const [admins, setAdmins] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const response = await getClients(0, 50, search.trim())
        if (!cancelled) { setAdmins((response?.body?.data ?? response?.data ?? {}).admins || []); setError('') }
      } catch (err) { if (!cancelled) setError(getApiMessage(err, 'Unable to load admins')) }
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [search])
  const options = [{ value: '', label: 'Select an admin' },
    ...(adminId && !admins.some(row => row.adminId === adminId) ? [{ value: adminId, label: admin?.name || 'Selected admin' }] : []),
    ...admins.map(row => ({ value: row.adminId, label: `${row.name} · ${row.email}` }))]
  return <div className="mb-5 grid gap-3 md:grid-cols-2">
    <label className="relative"><span className="sr-only">Find admin by name or email</span><Search size={16} className="absolute left-3.5 top-3 text-gray-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find admin by name or email…" className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-purple-400 dark:border-white/8 dark:bg-[#0b0d13] dark:text-white" /></label>
    <div><CustomSelect value={adminId || ''} onChange={onChange} options={options} />{error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p>}</div>
  </div>
}
