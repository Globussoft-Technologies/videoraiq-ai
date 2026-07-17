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

// Conveyor status filter — ON/OFF map to Loaded / Not-Loaded.
const STATUS_OPTIONS = [
  { value: 'ON', label: 'Loaded' },
  { value: 'OFF', label: 'Not-Loaded' },
];

/**
 * Incident filter popover: NVR / Camera (MultiSelect) + Severity, plus an
 * optional Status select (conveyor). Matches the ANPR popover styling.
 */
const IncidentFilterPopover = ({
  nvrOptions,
  nvrIds,
  setNvrIds,
  setChannelIds,
  cameraOptions,
  channelIds,
  severity,
  setSeverity,
  showStatus = false,
  status,
  setStatus,
}) => {
  const activeFiltersCount = useMemo(
    () =>
      [nvrIds.length > 0, channelIds.length > 0, !!severity, showStatus && !!status].filter(Boolean)
        .length,
    [nvrIds, channelIds, severity, showStatus, status]
  );

  const resetFilters = () => {
    setNvrIds([]);
    setChannelIds([]);
    setSeverity('');
    if (showStatus) setStatus('');
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
            <InlineSelect
              value={severity}
              onChange={setSeverity}
              options={SEVERITY_OPTIONS}
              placeholder="Severity"
              allLabel="All Severities"
            />
            {showStatus && (
              <InlineSelect
                value={status}
                onChange={setStatus}
                options={STATUS_OPTIONS}
                placeholder="Status"
                allLabel="All Statuses"
              />
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/**
 * Single-select inline dropdown (severity / status).
 *
 * Rendered inline (absolute-positioned) rather than via the shared Popover on
 * purpose: PopoverContent portals to <body>, so nesting one inside the filter
 * popover put the option list outside the filter's contentRef — clicking an
 * option then registered as a click-outside that closed the filter on
 * `mousedown` before the option's `onClick` fired. Keeping it inline keeps it
 * within the filter's contentRef so selecting actually dispatches.
 */
const InlineSelect = ({ value, onChange, options, placeholder, allLabel }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const choose = (v) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div className="relative w-full" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full h-9 px-3 border border-[var(--bd)] rounded-lg text-sm bg-[var(--bg1solid)] text-[var(--tx2)] cursor-pointer flex items-center justify-between gap-2"
      >
        <span className={selected ? 'text-[var(--tx)]' : 'text-[var(--tx3)]'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[var(--tx3)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-[95] mt-1 w-full rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] shadow-lg p-1">
          <button
            type="button"
            onClick={() => choose('')}
            className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer hover:bg-[var(--bg2)] rounded ${
              !value ? 'bg-[var(--bg2)] font-medium text-[var(--brand)]' : 'text-[var(--tx)]'
            }`}
          >
            {allLabel}
          </button>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => choose(opt.value)}
              className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer hover:bg-[var(--bg2)] rounded flex items-center justify-between ${
                value === opt.value ? 'bg-[var(--bg2)] font-medium text-[var(--brand)]' : 'text-[var(--tx)]'
              }`}
            >
              {opt.label}
              {value === opt.value && <Check className="w-3.5 h-3.5 text-[var(--brand)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default IncidentFilterPopover;
