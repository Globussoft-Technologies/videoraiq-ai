import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Filter, RotateCcw, ChevronDown, Check } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/pages/AttendanceLogs/components/Popover';
import MultiSelect from '@/pages/AttendanceLogs/components/MultiSelect';
import { Button } from '@/components/ui/button';

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
];

/**
 * ANPR filter popover: NVR / Camera (MultiSelect) + Severity (single select).
 * Uses hardcoded light-theme colors to match the V1 UI exactly.
 */
const ANPRFilterPopover = ({
  nvrOptions,
  nvrIds,
  setNvrIds,
  setChannelIds,
  cameraOptions,
  channelIds,
  severity,
  setSeverity,
}) => {
  const activeFiltersCount = useMemo(
    () => [nvrIds.length > 0, channelIds.length > 0, !!severity].filter(Boolean).length,
    [nvrIds, channelIds, severity]
  );

  const resetFilters = () => {
    setNvrIds([]);
    setChannelIds([]);
    setSeverity('');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="flex bg-[var(--violet)]/10 border border-[var(--violet)]/30 rounded-lg text-[var(--violet)] font-semibold hover:bg-[var(--violet)]/15 cursor-pointer items-center gap-2 relative h-10">
          <Filter className="w-4 h-4" />
          Filters
          {activeFiltersCount > 0 && (
            <span className="bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] h-5 flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] rounded-xl p-4" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--bd)] pb-2">
            <h4 className="font-semibold text-base text-[var(--tx)]">Filters</h4>
            {activeFiltersCount > 0 && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 cursor-pointer text-xs text-[var(--brand)] hover:underline"
              >
                <RotateCcw className="w-3 h-3 cursor-pointer" /> Reset all
              </button>
            )}
          </div>
          <div className="space-y-3">
            <MultiSelect
              options={nvrOptions}
              value={nvrIds}
              onChange={(value) => {
                setNvrIds(value);
                if (value.length === 0) setChannelIds([]);
              }}
              placeholder="Select NVR"
              searchable
              className="w-full"
              maxHeight="max-h-40"
              msg="No NVR Found"
            />
            <MultiSelect
              options={cameraOptions}
              value={channelIds}
              onChange={setChannelIds}
              placeholder="Select Camera"
              searchable
              className="w-full"
              maxHeight="max-h-40"
              msg="No Camera Found"
            />
            <SeveritySelect severity={severity} setSeverity={setSeverity} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/**
 * Single-select severity dropdown.
 *
 * Rendered as an INLINE (absolute-positioned) dropdown — NOT the shared
 * Popover — on purpose. The shared PopoverContent portals to <body>, so nesting
 * one inside the filter popover put the option list outside the filter's
 * contentRef. Clicking an option then registered as a click-outside on the
 * filter popover, which closed (and unmounted) this control on `mousedown`
 * before the option's `onClick` could fire — so severity never updated and the
 * logs request never refetched. Keeping the list inline (same approach as the
 * NVR/Camera MultiSelect) keeps it within the filter's contentRef so selecting
 * a severity actually dispatches. */
const SeveritySelect = ({ severity, setSeverity }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = SEVERITY_OPTIONS.find((o) => o.value === severity);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const choose = (value) => {
    setSeverity(value);
    setOpen(false);
  };

  return (
    <div className="relative w-full" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full h-9 px-3 border border-[var(--bd)] rounded-lg text-sm bg-[var(--bg1solid)] text-[var(--tx2)] cursor-pointer flex items-center justify-between gap-2"
      >
        <span className={selected ? 'text-[var(--tx)] capitalize' : 'text-[var(--tx3)]'}>
          {selected ? selected.label : 'Severity'}
        </span>
        <ChevronDown className={`w-4 h-4 text-[var(--tx3)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-[95] mt-1 w-full rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] shadow-lg p-1">
          <button
            type="button"
            onClick={() => choose('')}
            className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer hover:bg-[var(--bg2)] rounded ${
              !severity ? 'bg-[var(--bg2)] font-medium text-[var(--brand)]' : 'text-[var(--tx)]'
            }`}
          >
            All Severities
          </button>
          {SEVERITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => choose(opt.value)}
              className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer hover:bg-[var(--bg2)] rounded flex items-center justify-between ${
                severity === opt.value ? 'bg-[var(--bg2)] font-medium text-[var(--brand)]' : 'text-[var(--tx)]'
              }`}
            >
              {opt.label}
              {severity === opt.value && <Check className="w-3.5 h-3.5 text-[var(--brand)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ANPRFilterPopover;
