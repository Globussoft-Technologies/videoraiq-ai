export default function KeyboardHint({ value, children }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-3 text-sm font-medium text-[var(--tx2)]">
      <span className="inline-grid min-w-[52px] place-items-center rounded-md border border-[#cfd5df] bg-white px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-normal text-[#1f2937] shadow-[0_1px_2px_rgba(15,23,42,0.12)] dark:border-[var(--bd2)] dark:bg-[var(--bg2)] dark:text-white">
        {value}
      </span>
      <span>{children}</span>
    </span>
  );
}
