import { Inbox } from 'lucide-react'
import Topbar from '../../layout/Topbar'

// Generic empty screen for sections that have no data / API yet
// (Fleet Overview, Feature Roadmap).
const ComingSoon = ({ title, eyebrow = 'PLATFORM' }) => {
  return (
    <>
      <Topbar eyebrow={eyebrow} title={title} />

      <div className="px-8 py-6">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-24 text-center shadow-sm dark:border-white/8 dark:bg-[#0b0d13]">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-white/6 dark:text-gray-500">
            <Inbox size={26} strokeWidth={1.8} />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">No data</h2>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            There&apos;s nothing to show here yet.
          </p>
        </div>
      </div>
    </>
  )
}

export default ComingSoon
