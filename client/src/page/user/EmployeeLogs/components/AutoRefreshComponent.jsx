import React from 'react';
import { RefreshCw, ChevronDown, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const AutoRefreshComponent = ({
  isActive,
  onActiveChange,
  refreshInterval,
  onIntervalChange,
  onManualRefresh,
}) => {
const handleIncrement = () => {
  let next;
  if (refreshInterval < 60) {
    next = refreshInterval + 1;
  } else {
    next = refreshInterval + 60;
  }

  onIntervalChange(next);
};

const handleDecrement = () => {
  if (refreshInterval <= 0) return;
  let next;
  if (refreshInterval <= 60) { 
    next = refreshInterval - 1;
  } else {
    
    next = refreshInterval - 60;
  }
  if (next <= 0) {
    next = 0;
    onActiveChange(false); 
  }
  onIntervalChange(next);
};


  return (
    <div className="flex items-center">
      <div className="flex items-stretch border border-[#C7C7C7] rounded-lg bg-white overflow-hidden h-9 md:h-10">
        <button
          type="button"
          onClick={onManualRefresh}
          className="px-3 hover:bg-gray-50 border-r border-[#C7C7C7] flex items-center justify-center transition-colors group"
          title="Refresh now"
        >
          <RefreshCw
            className={cn(
              'w-4 h-4 text-[#777777] group-hover:text-[#333333]',
              isActive && 'text-[#07486A]'
            )}
          />
        </button>

        <Popover>
          <PopoverTrigger asChild>
            <button className="px-2 hover:bg-gray-50 flex items-center justify-center transition-colors group">
              <ChevronDown className="w-4 h-4 text-[#777777] group-hover:text-[#333333]" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-48 p-3 rounded-xl shadow-lg border-[#E6E6E6]"
            align="end"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span  >On</span>
                <Switch checked={isActive} onCheckedChange={onActiveChange} disabled={refreshInterval === 0}  className={cn(
    refreshInterval === 0 &&
      "opacity-40 cursor-not-allowed data-[state=checked]:bg-gray-300 data-[state=unchecked]:bg-gray-300"
  )} />
              </div>

              <div className="pt-2 border-t border-gray-100 flex flex-col gap-2">
                <div className="flex items-center border border-[#E6E6E6] rounded-lg overflow-hidden h-9">
                  <button
                    onClick={handleDecrement}
                    className="flex-1 flex items-center justify-center hover:bg-gray-50 border-r border-[#E6E6E6] transition-colors"
                    // disabled={refreshInterval <= 0.5}
                  >
                    <Minus className="w-3.5 h-3.5 text-[#777777]" />
                  </button>
                  <div className="px-3 flex items-center justify-center bg-white min-w-[70px]">
                   <span className="text-sm font-semibold text-[#07486A]">
  {refreshInterval === 0
    ? '0'
    : refreshInterval < 60
    ? `${refreshInterval} sec`
    : `${refreshInterval / 60} min`}
</span>


                  </div>
                  <button
                    onClick={handleIncrement}
                    className="flex-1 flex items-center justify-center hover:bg-gray-50 border-l border-[#E6E6E6] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#777777]" />
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
        'text-[10px] font-medium py-1 rounded border transition-all',
        refreshInterval === val
          ? 'bg-[#07486A] text-white border-[#07486A]'
          : 'bg-white text-[#777777] border-[#E6E6E6] hover:border-[#07486A]'
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
