import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

/**
 * Custom dropdown replacing native <select> — mirrors client_v2's
 * SearchableSelect.jsx (same open/close/outside-click/option pattern), adapted
 * for {value, label} option pairs and this app's Tailwind styling instead of
 * CSS-variable theming.
 *
 * A native <select>'s open dropdown highlight is browser-controlled and can
 * fall out of sync with React state (confirmed bug: switching the option set
 * out from under an already-rendered <select> left the wrong row highlighted,
 * since the browser tracks the popup's focus position rather than re-reading
 * `value`). Being fully React-rendered, this always highlights the option
 * whose value matches the current `value` prop, and every option gets an
 * explicit `cursor-pointer`.
 */
export default function CustomSelect({
  value,
  options,
  onChange,
  className = '',
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  const selectedOption = options.find((option) => option.value === value)

  const selectOption = (option) => {
    setOpen(false)
    onChange(option.value)
  }

  return (
    <div ref={wrapperRef} className={`relative ${open ? 'z-20' : 'z-0'}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border bg-white px-3 text-sm font-medium text-gray-700 outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#0b0d13] dark:text-gray-200 ${
          open
            ? 'border-purple-400 ring-2 ring-purple-400/20'
            : 'border-gray-200 dark:border-white/8'
        } ${className}`}
      >
        <span className="truncate">{selectedOption?.label ?? '—'}</span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-gray-400 transition-transform dark:text-gray-500 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+6px)] max-h-64 min-w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1.5 shadow-xl dark:border-white/10 dark:bg-[#12151d]"
        >
          {options.map((option) => {
            const selected = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => selectOption(option)}
                className={`flex w-full cursor-pointer items-center justify-between gap-3 whitespace-nowrap px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? 'bg-purple-50 font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/6'
                }`}
              >
                <span className="truncate">{option.label}</span>
                {selected && <Check size={14} className="shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
