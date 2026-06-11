import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ChevronDown, Circle } from 'lucide-react';
import { useState } from 'react';
import { updateBulkCameraSettings } from './Api/patch';
import { toast } from 'sonner';

export default function OperationSelect({ selectedIds = [], onBulkUpdate }) {
  const [selected, setSelected] = useState(null);

  const options = [
    { key: 'start', label: 'Start All' },
    // { key: 'pause', label: 'Pause All' },
    { key: 'stop', label: 'Stop All' },
    // { key: 'review', label: 'Apply To Review' },
  ];

  const controlValueMap = {
    start: 1,
    pause: 2,
    stop: 0,
  };

  const handleBulkOperation = async (key) => {
    setSelected(key);
    if (!selectedIds.length) {
      toast.error('No cameras selected');
      return;
    }
    if (key === 'review') {
      // Only set inReview for review
      try {
        await updateBulkCameraSettings({ ids: selectedIds, inReview: true });
        toast.success('Review applied to selected cameras');
        onBulkUpdate && onBulkUpdate();
      } catch (e) {
        toast.error('Bulk review failed');
      }
      return;
    }
    try {
      await updateBulkCameraSettings({
        ids: selectedIds,
        control: controlValueMap[key],
      });
      toast.success('Bulk operation successful');
      onBulkUpdate && onBulkUpdate();
    } catch (e) {
      toast.error('Bulk operation failed');
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 w-52 justify-between bg-[#F5F5F5] border-[#8080804D] text-sm font-normal flex items-center gap-2 cursor-pointer"
        >
          <span>
            {selected
              ? options.find((o) => o.key === selected)?.label
              : 'Perform Operation'}
          </span>
          <ChevronDown className="h-4 w-4 text-[#5D5D5D]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 rounded-[10px] shadow-none bg-[#F5F5F5] border border-[#8080804D] p-2 mb-1">
        <div className="space-y-1">
          {options.map(({ key, label }) => (
            <label
              key={key}
              className={`flex items-center space-x-2 px-2 py-1 cursor-pointer rounded-md text-[14px] ${
                selected === key ? 'bg-[#E6ECFF]' : ''
              }`}
              onClick={() => handleBulkOperation(key)}
            >
              <div className="h-4 w-4 flex items-center justify-center border border-[#80808059] rounded-full">
                {selected === key && (
                  <div className="h-2 w-2 bg-[#0B1A6A] rounded-full" />
                )}
              </div>
              <span className="text-[#333333]">{label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
