import { Loader2 } from 'lucide-react';

export default function FloButton({
  children,
  icon: Icon,
  shortcut,
  variant = 'primary',
  className = '',
  disabled = false,
  loading = false,
  ...props
}) {
  const variants = {
    primary:
      'border-transparent bg-emerald-500 text-white shadow-[0_18px_38px_rgba(16,185,129,0.24)] hover:bg-emerald-600 disabled:bg-[var(--bg3)] disabled:text-[var(--tx3)] disabled:shadow-none',
    soft:
      'border-[var(--bd)] bg-[var(--bg1)] text-[var(--tx)] hover:bg-[var(--bg2)] disabled:text-[var(--tx3)]',
    ghost:
      'border-[var(--bd)] bg-transparent text-[var(--tx2)] hover:bg-[var(--bg2)] disabled:text-[var(--tx3)]',
  };

  const RenderIcon = loading ? Loader2 : Icon;

  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {RenderIcon && <RenderIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2.2} />}
      <span>{children}</span>
      {shortcut && (
        <span className="ml-1 inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-white/30 bg-white/15 px-1.5 font-mono text-[11px]">
          {shortcut}
        </span>
      )}
    </button>
  );
}
