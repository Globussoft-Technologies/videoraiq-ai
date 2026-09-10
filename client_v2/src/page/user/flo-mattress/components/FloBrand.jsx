import logo from '@/assets/videoraiq-logo-color.png';

export default function FloBrand({ compact = false }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={logo}
        alt="VideoraIQ"
        className={compact ? 'h-8 w-auto object-contain' : 'h-11 w-auto object-contain'}
      />
      <div className="hidden h-9 w-px bg-[var(--bd)] sm:block" />
    </div>
  );
}
