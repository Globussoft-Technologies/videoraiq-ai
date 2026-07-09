import { Building2 } from 'lucide-react'

const EmptyState = ({ searching }) => {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500">
        <Building2 size={26} strokeWidth={1.8} />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-white">
        {searching ? 'No clients match your search' : 'No clients yet'}
      </h3>
      <p className="mt-1 max-w-xs text-sm text-gray-400 dark:text-gray-500">
        {searching
          ? 'Try a different name or email.'
          : 'Onboard your first client to start provisioning cameras and detections.'}
      </p>
    </div>
  )
}

export default EmptyState
