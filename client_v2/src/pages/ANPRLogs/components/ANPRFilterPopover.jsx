import React, { useMemo } from 'react';
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
        <Button className="flex bg-[linear-gradient(94.16deg,#FFFFFF_0.77%,#AAE2FF_99.4%)] rounded-lg text-[#333333] cursor-pointer items-center gap-2 relative h-9 md:h-10">
          <Filter className="w-4 h-4" />
          Filters
          {activeFiltersCount > 0 && (
            <span className="bg-[var(--brand)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] h-5 flex items-center justify-center">
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

/** Single-select severity dropdown built on the shared Popover (no ui/select in v2). */
const SeveritySelect = ({ severity, setSeverity }) => {
  const selected = SEVERITY_OPTIONS.find((o) => o.value === severity);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-9 px-3 border border-[var(--bd)] rounded-lg text-sm bg-[var(--bg1solid)] text-[var(--tx2)] cursor-pointer flex items-center justify-between gap-2"
        >
          <span className={selected ? 'text-[var(--tx)] capitalize' : 'text-[var(--tx3)]'}>
            {selected ? selected.label : 'Severity'}
          </span>
          <ChevronDown className="w-4 h-4 text-[var(--tx3)] shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-1 rounded-lg" align="start">
        <button
          type="button"
          onClick={() => setSeverity('')}
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
            onClick={() => setSeverity(opt.value)}
            className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer hover:bg-[var(--bg2)] rounded flex items-center justify-between ${
              severity === opt.value ? 'bg-[var(--bg2)] font-medium text-[var(--brand)]' : 'text-[var(--tx)]'
            }`}
          >
            {opt.label}
            {severity === opt.value && <Check className="w-3.5 h-3.5 text-[var(--brand)]" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};

export default ANPRFilterPopover;
