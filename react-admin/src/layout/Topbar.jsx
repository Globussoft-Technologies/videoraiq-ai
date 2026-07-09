const Topbar = ({ eyebrow, title }) => {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white/70 px-8 py-4 backdrop-blur-sm dark:border-white/8 dark:bg-transparent">
      <div>
        {eyebrow && (
          <p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-gray-400 dark:text-gray-600">
            {eyebrow}
          </p>
        )}
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-white/8 dark:bg-white/4">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          <span className="font-mono text-[11px] font-medium text-gray-500 dark:text-gray-400">
            All Regions Online
          </span>
        </div>

        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-500 text-sm font-semibold text-white">
          SA
        </span>
      </div>
    </header>
  )
}

export default Topbar
