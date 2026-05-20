import React from 'react';
import { Switch } from '@/components/ui/switch';
import clsx from 'clsx';

const DetectionToggle = ({ item, onChange, isExpanded, disabled = false }) => {
  const handleToggleChange = (checked) => {
    if (disabled) return;
    onChange(item.id, checked);
  };

  return (
    <div className="flex items-center justify-between rounded-lg transition-colors duration-200 hover:bg-gray-100 py-2 px-3 relative overflow-hidden">
      <div
        className={clsx(
          "min-w-[44px] min-h-[44px] 2xl:w-11 2xl:h-11 xl:w-9 xl:h-9 flex items-center justify-center bg-[#F3F3F3] rounded-lg transition-all duration-200",
          item.enabled && 'border-t-4 border-[#07486a]'
        )}
      >
        <img
          src={item.src}
          alt={item.label}
          className="object-contain transition-all duration-150"
        />
      </div>

      {/* Text with improved transitions - REMOVED text-center */}
      <div className="overflow-hidden flex items-start justify-start w-full ml-3"> {/* Added ml-3 for spacing */}
        <span
          className={clsx(
            "text-gray-700 block transition-all duration-300 ease-out text-[10px] 2xl:text-sm", // Removed text-center
            isExpanded
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 -translate-x-2',
            "will-change-transform"
          )}
          style={{
            transition:
              'opacity 300ms ease-out, transform 300ms ease-out, clip-path 300ms ease-out',
            clipPath: isExpanded ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
          }}
        >
          {item.label}
        </span>
      </div>

      {/* Switch with improved animation */}
      <div
        className={clsx(
          "transition-all duration-200 ease-in-out w-[36px]",
          isExpanded ? 'opacity-100 visible' : 'opacity-0 invisible'
        )}
      >
        <Switch
          className={clsx(
            "bg-[#EBEBEB] border border-[#B9B9B9] data-[state=checked]:bg-[#07486a]",
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          checked={item.enabled}
          onCheckedChange={handleToggleChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
};

export default React.memo(DetectionToggle);