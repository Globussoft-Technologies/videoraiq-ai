import ClientBreakdownRow from './ClientBreakdownRow'

const STAGES = [
  { key: 'no-cameras', label: 'No provisioned cameras', color: 'bg-amber-500' },
  { key: 'no-detections', label: 'Cameras without enabled detections', color: 'bg-purple-500' },
  { key: 'enabled', label: 'At least one detection enabled', color: 'bg-green-500' },
]

const DetectionSetup = ({ counts, search }) => {
  const max = Math.max(1, ...STAGES.map(({ key }) => counts?.[key] ?? 0))
  return (
  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
    <h2 className="text-base font-semibold text-gray-900 dark:text-white">Detection Setup</h2>
    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
      {search ? 'Matching active clients' : 'Active clients'}
    </p>
    <ul className="mt-4 flex flex-col gap-3.5">
      {STAGES.map(({ key, label, color }) => {
        const params = new URLSearchParams({ setup: key })
        if (search) params.set('search', search)
        return (
          <li key={key}>
            <ClientBreakdownRow
              to={`/fleet/detection-setup?${params}`}
              label={label}
              count={counts?.[key] ?? 0}
              max={max}
              color={color}
            />
          </li>
        )
      })}
    </ul>
  </section>
  )
}

export default DetectionSetup
