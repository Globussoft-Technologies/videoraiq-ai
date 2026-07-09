const DetectionCard = ({ detection }) => {
  const { name, description, Icon, tint, clientCount = 0 } = detection

  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-purple-300/60 dark:border-white/8 dark:bg-[#0b0d13] dark:hover:border-purple-400/30">
      {/* Header: icon + name */}
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}>
          <Icon size={20} strokeWidth={2} />
        </span>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{name}</h3>
      </div>

      {/* Description */}
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{description}</p>

      {/* Footer: client count (from API) */}
      <div className="mt-4 flex items-center justify-end">
        <span className="font-mono text-[11px] text-gray-400 dark:text-gray-600">
          on {clientCount} {clientCount === 1 ? 'client' : 'clients'}
        </span>
      </div>
    </div>
  )
}

export default DetectionCard
