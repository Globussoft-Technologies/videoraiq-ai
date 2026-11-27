import { STOCK_MODES } from '@/page/user/Configure/DetectionZoneMarking/constants';

export default function StockModeFilter({ value, onChange }) {
  return (
    <select
      aria-label="Stock mode"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 cursor-pointer rounded-[8px] border border-[var(--bd)] bg-[var(--bg2)] px-3 text-xs font-medium text-[var(--tx)]"
    >
      <option value="">All Modes</option>
      {STOCK_MODES.map((mode) => (
        <option key={mode.value} value={mode.value}>{mode.label}</option>
      ))}
    </select>
  );
}
