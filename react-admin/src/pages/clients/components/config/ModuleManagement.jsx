import { useState } from 'react'
import { ChevronDown, Loader2, Move3d } from 'lucide-react'

const PAGES = [
  ['measurementLogs', 'Measurement Logs'],
  ['raspberryPiDevices', 'Raspberry Pi Devices'],
  ['measurementCalibration', 'Measurement Calibration'],
]

export default function ModuleManagement({ permissions, saving, onChange }) {
  const [expanded, setExpanded] = useState(true)
  const granted = PAGES.filter(([key]) => permissions[key] === true).length
  const allGranted = granted === PAGES.length

  return (
    <section className="max-w-3xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
      <div className="border-b border-gray-200 px-6 py-5 dark:border-white/8">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Module Management</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Choose which mattress measurement pages this client can see. Existing role permissions still apply.
        </p>
      </div>
      <div className="flex items-center gap-3 px-6 py-4">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls="mattress-module-pages"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Move3d size={19} className="shrink-0 text-purple-500" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-gray-900 dark:text-white">Mattress Measurement</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">{granted} of {PAGES.length} pages allowed</span>
          </span>
          <ChevronDown size={17} className={`shrink-0 text-gray-400 transition-transform ${expanded ? '' : '-rotate-90'}`} />
        </button>
        {saving && <Loader2 size={16} className="animate-spin text-purple-500" aria-label="Saving module permissions" />}
        <label className="flex shrink-0 items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={allGranted}
            disabled={saving}
            onChange={(event) => onChange(Object.fromEntries(PAGES.map(([key]) => [key, event.target.checked])))}
            aria-label="Allow complete Mattress Measurement module"
            className="h-4 w-4 accent-purple-600"
          />
          Allow complete module
        </label>
      </div>
      {expanded && (
        <div id="mattress-module-pages" className="border-t border-gray-200 px-6 py-3 dark:border-white/8">
          {PAGES.map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-3 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={permissions[key] === true}
                disabled={saving}
                onChange={(event) => onChange({ ...permissions, [key]: event.target.checked })}
                aria-label={`Allow ${label}`}
                className="h-4 w-4 accent-purple-600"
              />
            </label>
          ))}
        </div>
      )}
    </section>
  )
}
