import { useRef, useState } from 'react';
import { CheckCircle2, ChevronDown } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '../../../../../pages/AttendanceLogs/components/Popover';
import NoDetectionLicense from '../../../../../components/NoDetectionLicense';

export default function DetectionTypeDropdown({ types, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [triggerWidth, setTriggerWidth] = useState(null);
  const triggerRef = useRef(null);
  const activeLabel = types.find(t => t.settingType === value)?.label || 'Select Detection Type';

  return (
    <Popover
      open={open}
      onOpenChange={(v) => { if (v) setTriggerWidth(triggerRef.current?.offsetWidth); setOpen(v); }}
      className="block w-full"
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          style={{
            width: '100%', height: 42, padding: '0 34px 0 13px', borderRadius: 10,
            background: 'var(--bg2)', border: '1px solid var(--blue)', fontSize: 13,
            outline: 'none', cursor: 'pointer', color: 'var(--tx)',
            boxShadow: '0 0 0 3px rgba(59,130,246,.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left',
          }}
        >
          {activeLabel}
          <ChevronDown size={15} style={{ color: 'var(--blue)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6}>
        <div style={{ width: triggerWidth || 320, maxHeight: 176, overflowY: 'auto', background: 'var(--bg1solid)', border: '1px solid var(--bd2)', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,.35)', padding: 5 }}>
          {types.length === 0 && (
            <NoDetectionLicense compact fallback="No detection types available." />
          )}
          {types.map(t => {
            const selected = t.settingType === value;
            return (
              <div
                key={t.settingType}
                onClick={() => { onChange(t.settingType); setOpen(false); }}
                style={{
                  padding: '8px 10px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer',
                  background: selected ? 'var(--blue)' : 'transparent',
                  color: selected ? '#fff' : 'var(--tx)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}
              >
                <span>{t.label}</span>
                {t.configured && <CheckCircle2 size={13} style={{ color: selected ? '#fff' : 'var(--ok)', flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
