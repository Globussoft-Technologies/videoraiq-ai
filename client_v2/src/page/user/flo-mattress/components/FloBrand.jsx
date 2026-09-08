import logo from '@/assets/logo.svg';

export default function FloBrand({ compact = false }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={logo}
        alt="VideoraIQ"
        className={compact ? 'h-9 w-auto object-contain' : 'h-11 w-auto object-contain'}
      />
      {!compact && <div className="hidden h-9 w-px bg-[var(--bd)] sm:block" />}
    </div>
  );
}
