const Button = ({
  children,
  loading = false,
  className = '',
  variant = 'solid',
  disabled,
  ...props
}) => {
  const isGradient = variant === 'gradient'

  return (
    <button
      disabled={disabled || loading}
      className={`relative w-full overflow-hidden rounded-lg py-3 text-[14.5px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        isGradient
          ? 'bg-linear-to-r from-blue-600 via-blue-500 to-purple-600 hover:from-blue-500 hover:via-blue-400 hover:to-purple-500'
          : 'bg-blue-600 hover:bg-blue-700'
      } ${className}`}
      {...props}
    >
      {isGradient && !disabled && !loading && (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-white/25"
          style={{ animation: 'vq-sheen 2.6s ease-in-out infinite' }}
        />
      )}
      <span className="relative">{loading ? 'Please wait…' : children}</span>
    </button>
  )
}

export default Button
