import { useEffect, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, CircleCheck, ListChecks, ScanEye, Video, VideoOff, X } from 'lucide-react'
import Topbar from '../../layout/Topbar'
import LoadingState from '../../components/UI/LoadingState'
import CustomSelect from '../../components/UI/CustomSelect'
import Pagination from '../clients/components/Pagination'
import { getApiMessage } from '../../utils/apiError'
import { CLIENT_AVATAR_COLORS, getInitials } from '../../utils/authUser'
import { getFleetMetricDetails } from './apis/get'

const CAMERA_COLUMNS = { licensed: 'Licensed cameras', provisioned: 'Provisioned cameras' }

const METRICS = {
  licensed: { title: 'Cameras Licensed', unit: 'licensed cameras', icon: Video, columns: CAMERA_COLUMNS },
  provisioned: {
    title: 'Cameras Provisioned',
    unit: 'provisioned cameras',
    icon: Video,
    columns: CAMERA_COLUMNS,
  },
  detections: { title: 'Detections Enabled', unit: 'enabled detections', icon: ScanEye, columns: { camera: 'Camera', detection: 'Detection' } },
  'detection-setup': {
    title: 'Detection Setup',
    unit: 'active clients',
    icon: ListChecks,
    columns: { provisioned: 'Provisioned cameras', detections: 'Enabled detections', setup: 'Setup status' },
  },
}

const SETUP_LABELS = {
  all: 'All setup statuses',
  'no-cameras': 'No cameras',
  'no-detections': 'No detections',
  enabled: 'Detections enabled',
}

const SETUP_OPTIONS = [
  { value: 'all', icon: ListChecks, iconClassName: 'text-gray-500 dark:text-gray-400' },
  { value: 'no-cameras', icon: VideoOff, iconClassName: 'text-amber-700 dark:text-amber-300' },
  { value: 'no-detections', icon: ScanEye, iconClassName: 'text-violet-700 dark:text-violet-300' },
  { value: 'enabled', icon: CircleCheck, iconClassName: 'text-green-700 dark:text-green-400' },
].map((option) => ({ ...option, label: SETUP_LABELS[option.value] }))

const STATUS_COLORS = {
  'no-cameras': 'text-amber-700 dark:text-amber-300',
  'no-detections': 'text-violet-700 dark:text-violet-300',
  enabled: 'text-green-600 dark:text-green-400',
  Online: 'text-green-600 dark:text-green-400',
  Offline: 'text-gray-500 dark:text-gray-400',
}

const detailLink = (metric, search, setup) => {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  if (setup) params.set('setup', setup)
  return params.size ? `/fleet/${metric}?${params}` : `/fleet/${metric}`
}

const MetricValue = ({ field, value }) => {
  if (field === 'setup' || field === 'status') {
    return (
      <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium ${STATUS_COLORS[value] || STATUS_COLORS.Offline}`}>
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
        {(field === 'setup' ? SETUP_LABELS[value] : value) ?? '—'}
      </span>
    )
  }
  if (typeof value === 'number') {
    return <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{value.toLocaleString()}</span>
  }
  if (field === 'camera' && value) {
    return <span className="inline-flex items-center gap-2"><Video size={15} className="shrink-0 text-gray-400" aria-hidden="true" />{value}</span>
  }
  return value ?? '—'
}

const MetricTable = ({ metric, search, setup, onSetupChange }) => {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const { columns, title, unit, icon: Icon } = METRICS[metric]
  const highlightedColumn = metric === 'licensed' || metric === 'provisioned' ? metric : ''
  const highlightBand = 'bg-linear-to-r bg-size-[11rem_100%] bg-no-repeat'
  const pageStart = page * pageSize

  useEffect(() => {
    let cancelled = false
    getFleetMetricDetails(metric, { skip: pageStart, limit: pageSize, search, setup })
      .then((response) => {
        if (!cancelled) setData(response?.body?.data ?? response?.data)
      })
      .catch((err) => {
        if (!cancelled) setError(getApiMessage(err, 'Failed to load fleet details'))
      })
    return () => {
      cancelled = true
    }
  }, [metric, pageStart, pageSize, search, setup, retry])

  return (
    <>
      <Topbar eyebrow="PLATFORM" title={title} />
      <div className="w-full px-4 py-5 sm:px-8 sm:py-7">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Link to="/fleet" className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-purple-300 hover:bg-purple-50 hover:text-purple-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500 dark:border-white/8 dark:bg-[#0b0d13] dark:text-gray-200 dark:hover:border-purple-400/40 dark:hover:bg-purple-400/10">
            <ArrowLeft size={16} aria-hidden="true" />
            Fleet Overview
          </Link>

          {setup && (
            <div role="group" aria-label="Detection setup filter" className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Filter by setup status</span>
              <div className="w-48">
                <CustomSelect value={setup} options={SETUP_OPTIONS} onChange={onSetupChange} className="shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500" />
              </div>
            </div>
          )}
          {search && (
            <Link to={detailLink(metric, '', setup)} aria-label={`Clear client search: ${search}`} className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              <span className="truncate">Client search: {search}</span>
              <X size={14} className="shrink-0" aria-hidden="true" />
            </Link>
          )}
          {data && <p className="ml-auto text-sm text-gray-400 tabular-nums dark:text-gray-500" aria-live="polite">{data.total.toLocaleString()} {unit}</p>}
        </div>

        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            <p role="alert">{error}</p>
            <button type="button" className="rounded-lg border border-current px-3 py-1.5 font-medium hover:opacity-75" onClick={() => {
              setError('')
              setRetry((attempt) => attempt + 1)
            }}>Try again</button>
          </div>
        ) : !data ? (
          <LoadingState message="Loading fleet details…" />
        ) : (
          <>
            {data.rows.length ? <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${title} records`}>
              <table className="w-full min-w-132 border-separate border-spacing-0 text-left text-sm text-gray-500 dark:text-gray-400">
                <thead className="font-mono text-[10px] font-semibold tracking-[0.12em] text-gray-400 uppercase dark:text-gray-500 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-white/8">
                  <tr>
                    <th scope="col" className="px-6 py-3">Client</th>
                    {Object.entries(columns).map(([key, label]) => (
                      <th scope="col" className={`px-6 py-3 ${key === highlightedColumn ? `${highlightBand} from-purple-100 to-purple-100 text-purple-800 dark:from-purple-500/20 dark:to-purple-500/20 dark:text-purple-200` : ''}`} key={key}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="[&_tr:not(:last-child)>td]:border-b [&_td]:border-gray-200 dark:[&_td]:border-white/8">
                  {data.rows.map((row, index) => (
                    <tr key={row.id} className="group transition-colors hover:bg-gray-100 focus-within:bg-gray-100 dark:hover:bg-white/7 dark:focus-within:bg-white/7">
                      <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                        <div className="flex items-center gap-2.5">
                          <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br text-xs font-semibold text-white ${CLIENT_AVATAR_COLORS[(pageStart + index) % CLIENT_AVATAR_COLORS.length]}`}>{getInitials(row.clientName)}</span>
                        {row.adminId ? (
                          <Link to={`/clients/${row.adminId}`} state={{ name: row.clientName, tab: metric === 'provisioned' ? 'cameras' : undefined }} aria-label={`Open ${metric === 'provisioned' ? 'cameras' : 'configuration'} for ${row.clientName}`} className="inline-flex items-center gap-1.5 rounded-sm hover:text-purple-700 focus-visible:outline-2 focus-visible:outline-purple-500 dark:hover:text-purple-300">
                            {row.clientName}
                            <ArrowUpRight size={13} className="shrink-0" aria-hidden="true" />
                          </Link>
                        ) : row.clientName}
                        </div>
                      </td>
                      {Object.keys(columns).map((key) => (
                        <td key={key} className={`px-6 py-4 ${key === highlightedColumn ? `${highlightBand} from-purple-50 to-purple-50 group-hover:from-purple-100 group-hover:to-purple-100 group-focus-within:from-purple-100 group-focus-within:to-purple-100 dark:from-purple-500/10 dark:to-purple-500/10 dark:group-hover:from-purple-500/20 dark:group-hover:to-purple-500/20 dark:group-focus-within:from-purple-500/20 dark:group-focus-within:to-purple-500/20` : ''}`}>
                          <MetricValue field={key} value={row[key]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500 dark:border-white/8 dark:text-gray-400">
                Showing {pageStart + 1}–{pageStart + data.rows.length} of {data.totalCount.toLocaleString()} {metric === 'licensed' || metric === 'provisioned' ? 'clients' : unit}
              </p>
            </div> : (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center dark:border-white/15 dark:bg-[#0b0d13]">
                <Icon size={24} className="mx-auto text-violet-500 dark:text-violet-300" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold">{data.totalCount ? 'No records on this page' : 'No matching records'}</p>
              </div>
            )}
            {(setup || data.totalCount > 10 || page > 0) && <Pagination
              page={page}
              pageSize={pageSize}
              total={data.totalCount}
              onPageChange={(nextPage) => {
                if (nextPage === page) return
                setData(null)
                setPage(nextPage)
              }}
              onPageSizeChange={(size) => {
                if (size === pageSize) return
                setData(null)
                setPageSize(size)
                setPage(0)
              }}
            />}
          </>
        )}
      </div>
    </>
  )
}

const FleetMetricDetails = () => {
  const { metric: routeMetric } = useParams()
  const [params, setParams] = useSearchParams()
  const metric = routeMetric === 'cameras'
    ? (params.get('view') === 'provisioned' ? 'provisioned' : 'licensed')
    : routeMetric
  if (!Object.hasOwn(METRICS, metric)) return <Navigate to="/fleet" replace />
  const setupFilter = params.get('setup')
  if (metric === 'detection-setup' && setupFilter === 'pending') {
    const next = new URLSearchParams(params)
    next.delete('setup')
    return <Navigate to={next.size ? `?${next}` : '/fleet/detection-setup'} replace />
  }
  const setup = metric === 'detection-setup'
    ? (Object.hasOwn(SETUP_LABELS, setupFilter) ? setupFilter : 'all')
    : ''

  return (
    <MetricTable
      key={`${metric}?${params}`}
      metric={metric}
      search={params.get('search') || ''}
      setup={setup}
      onSetupChange={(value) => {
        const next = new URLSearchParams(params)
        if (value === 'all') next.delete('setup')
        else next.set('setup', value)
        setParams(next)
      }}
    />
  )
}

export default FleetMetricDetails
