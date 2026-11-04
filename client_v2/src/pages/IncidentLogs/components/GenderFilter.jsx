import { Mars, Users, Venus } from 'lucide-react';

const OPTIONS = [
  { value: '', label: 'All', Icon: Users },
  { value: 'Male', label: 'Male', Icon: Mars },
  { value: 'Female', label: 'Female', Icon: Venus },
];

export default function GenderFilter({ value = '', onChange }) {
  return <div role="group" aria-label="Filter by gender" className="flex h-10 items-center gap-1 rounded-[10px] border border-[var(--bd)] bg-[var(--bg2)] p-1">
    {OPTIONS.map(({ value: option, label, Icon }) => <button
      key={label} type="button" aria-pressed={value === option} onClick={() => onChange(option)}
      className={`flex h-full cursor-pointer items-center gap-1.5 rounded-[7px] px-3 text-xs font-semibold transition-colors ${value === option ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white shadow-sm' : 'text-[var(--tx2)] hover:text-[var(--tx)]'}`}>
      <Icon size={14} aria-hidden="true" />{label}
    </button>)}
  </div>;
}
