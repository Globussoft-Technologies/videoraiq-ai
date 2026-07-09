const Input = ({
  label,
  id,
  error,
  className = '',
  variant = 'light',
  icon,
  trailing,
  ...props
}) => {
  const isGlass = variant === 'glass'

  return (
    <div className="flex flex-col">
      {label && (
        <label
          htmlFor={id}
          className={`mb-1.5 text-[13px] font-semibold ${
            isGlass ? 'text-slate-300' : 'text-gray-900'
          }`}
        >
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {icon && (
          <span
            className={`pointer-events-none absolute left-3.25 flex items-center ${
              isGlass ? 'text-slate-500' : 'text-gray-400'
            }`}
          >
            {icon}
          </span>
        )}
        <input
          id={id}
          className={`w-full rounded-lg border text-sm outline-none transition-colors ${
            icon ? 'pl-9.5' : 'px-3.25'
          } py-2.75 ${trailing ? 'pr-9.5' : icon ? 'pr-3.25' : ''} ${
            isGlass
              ? `border-blue-400/15 bg-slate-950/40 text-slate-100 placeholder:text-slate-500 focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/40 ${
                  error ? 'border-red-500/60!' : ''
                }`
              : `text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 ${
                  error ? 'border-red-500' : 'border-gray-300'
                }`
          } ${className}`}
          {...props}
        />
        {trailing && <span className="absolute right-3.25 flex items-center">{trailing}</span>}
      </div>
      {error && (
        <span className={`mt-1.5 text-xs ${isGlass ? 'text-red-400' : 'text-red-500'}`}>
          {error}
        </span>
      )}
    </div>
  )
}

export default Input
