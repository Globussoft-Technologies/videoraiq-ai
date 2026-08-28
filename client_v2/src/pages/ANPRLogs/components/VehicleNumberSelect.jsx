import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

/**
 * Searchable vehicle-number dropdown. Matches the V1 ANPRLogs control exactly
 * (light theme, hardcoded colors).
 */
const VehicleNumberSelect = ({
  vehicleNumber,
  setVehicleNumber,
  vehicleNumberList,
  vehicleNumberSearch,
  setVehicleNumberSearch,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selectVehicleNumber = (value) => {
    setVehicleNumber(value);
    setOpen(false);
  };

  return (
    <div className="relative w-full md:w-[200px]" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="h-10 w-full px-3 border border-[var(--bd)] rounded-lg text-sm bg-[var(--bg2)] text-[var(--tx2)] cursor-pointer flex items-center justify-between gap-2 hover:border-[var(--violet)] transition-colors"
      >
        <span className="truncate">{vehicleNumber || 'Vehicle Number'}</span>
        <ChevronDown className={`w-4 h-4 text-[var(--tx3)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 z-[95] mt-1 w-full min-w-[220px] overflow-hidden rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] text-[var(--tx)] shadow-lg">
          <div className="p-2 border-b border-[var(--bd)]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--tx3)]" />
              <Input
                type="text"
                placeholder="Search vehicle number"
                value={vehicleNumberSearch}
                onChange={(e) => setVehicleNumberSearch(e.target.value)}
                className="h-8 pl-8 pr-2 text-xs border border-[var(--bd)] bg-[var(--bg1solid)] text-[var(--tx)] shadow-none rounded-lg"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            <VehicleOption
              active={!vehicleNumber}
              label="All Vehicles"
              onClick={() => selectVehicleNumber('')}
            />
            {vehicleNumberList.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--tx3)]">No vehicle numbers</div>
            ) : (
              vehicleNumberList.map((vn) => (
                <VehicleOption
                  key={vn}
                  active={vehicleNumber === vn}
                  label={vn}
                  onClick={() => selectVehicleNumber(vn)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const VehicleOption = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer hover:bg-[var(--bg2)] ${
      active ? 'bg-[var(--bg2)] font-medium text-[var(--brand)]' : 'text-[var(--tx)]'
    }`}
  >
    {label}
  </button>
);

export default VehicleNumberSelect;
