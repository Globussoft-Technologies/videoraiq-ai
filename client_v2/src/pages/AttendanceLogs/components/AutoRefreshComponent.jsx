import React from 'react';
import { RefreshCw, ChevronDown, Plus, Minus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { Switch } from './Switch';
import { cn } from '@/lib/utils';

/**
 * Manual + auto-refresh control. Theme-aware (dark/light) via CSS vars.
 */
const AutoRefreshComponent = ({
  isActive,
  onActiveChange,
  refreshInterval,
  onIntervalChange,
  onManualRefresh,
}) => {
  const handleIncrement = () => {
    const next = refreshInterval < 60 ? refreshInterval + 1 : refreshInterval + 60;
    onIntervalChange(next);
  };

  const handleDecrement = () => {
    if (refreshInterval <= 0) return;
    let next = refreshInterval <= 60 ? refreshInterval - 1 : refreshInterval - 60;
    if (next <= 0) {
      next = 0;
      onActiveChange(false);
    }
    onIntervalChange(next);
  };

  return (
    <div className="flex items-center">
      <div className="flex items-stretch border border-[var(--bd)] rounded-lg bg-[var(--bg2)] overflow-hidden h-10">
        <button
          type="button"
          onClick={onManualRefresh}
          className="px-3 hover:bg-[var(--bg3)] border-r border-[var(--bd)] flex items-center justify-center transition-colors group cursor-pointer"
          title="Refresh now"
        >
          <RefreshCw
            className={cn('w-4 h-4 text-[var(--tx2)] group-hover:text-[var(--tx)]', isActive && 'text-[var(--blue)]')}
          />
        </button>

        <Popover className="self-stretch flex">
          <PopoverTrigger asChild>
            <button className="px-2 h-full hover:bg-[var(--bg3)] flex items-center justify-center transition-colors group cursor-pointer">
              <ChevronDown className="w-4 h-4 text-[var(--tx2)] group-hover:text-[var(--tx)]" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-3" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--tx)]">On</span>
                <Switch
                  checked={isActive}
                  onCheckedChange={onActiveChange}
                  disabled={refreshInterval === 0}
                />
              </div>

              <div className="pt-2 border-t border-[var(--bd)] flex flex-col gap-2">
                <div className="flex items-center border border-[var(--bd)] rounded-lg overflow-hidden h-9">
                  <button
                    onClick={handleDecrement}
                    className="flex-1 flex items-center justify-center hover:bg-[var(--bg3)] border-r border-[var(--bd)] transition-colors cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5 text-[var(--tx2)]" />
                  </button>
                  <div className="px-3 flex items-center justify-center bg-[var(--bg2)] min-w-[70px]">
                    <span className="text-sm font-semibold text-[var(--blue)]">
                      {refreshInterval === 0
                        ? '0'
                        : refreshInterval < 60
                          ? `${refreshInterval} sec`
                          : `${refreshInterval / 60} min`}
                    </span>
                  </div>
                  <button
                    onClick={handleIncrement}
                    className="flex-1 flex items-center justify-center hover:bg-[var(--bg3)] border-l border-[var(--bd)] transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[var(--tx2)]" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {[30, 60, 120].map((val) => (
                    <button
                      key={val}
                      onClick={() => {
                        onIntervalChange(val);
                        if (val > 0) onActiveChange(true);
                      }}
                      className={cn(
                        'text-[10px] font-medium py-1 rounded border transition-all cursor-pointer',
                        refreshInterval === val
                          ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                          : 'bg-[var(--bg2)] text-[var(--tx2)] border-[var(--bd)] hover:border-[var(--brand)]'
                      )}
                    >
                      {val < 60 ? `${val}s` : `${val / 60}m`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export default AutoRefreshComponent;
