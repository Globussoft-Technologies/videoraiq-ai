// src/components/ui/number-input.jsx
import React from 'react';
import { Input } from './input';
import { Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

const NumberInput = React.forwardRef(
  (
    {
      value,
      onChange,
      min = 0,
      max = undefined,
      step = 1,
      className,
      showButtons = true,
      disabled = false,
      ...props
    },
    ref
  ) => {
    const numValue = Number(value) || 0;

    const handleIncrement = () => {
      const newValue = numValue + step;
      if (max === undefined || newValue <= max) {
        onChange({ target: { value: newValue.toString() } });
      }
    };

    const handleDecrement = () => {
      const newValue = numValue - step;
      if (newValue >= min) {
        onChange({ target: { value: newValue.toString() } });
      }
    };

    const handleChange = (e) => {
      const inputValue = e.target.value;
      if (inputValue === '' || /^\d+$/.test(inputValue)) {
        onChange(e);
      }
    };

    return (
      <div className={cn('flex items-center gap-0', className)}>
        {showButtons && (
          <button
            type="button"
            onClick={handleDecrement}
            disabled={disabled || numValue <= min}
            className="h-10 w-10 flex items-center justify-center border border-r-0 border-[#E6E6E6] rounded-l-[12px] bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Minus className="h-4 w-4 text-gray-600" />
          </button>
        )}
        <Input
          ref={ref}
          type="number"
          value={value}
          onChange={handleChange}
          min={min}
          max={max}
          disabled={disabled}
          className={cn(
            'text-center h-10 w-fit px-3 py-2 shadow-none ',
            showButtons && 'rounded-none border-y'
          )}
          {...props} 
        />
        {showButtons && (
          <button
            type="button"
            onClick={handleIncrement}
            disabled={disabled || (max !== undefined && numValue >= max)}
            className="h-10 w-10 flex items-center justify-center border border-l-0 border-[#E6E6E6] rounded-r-[12px] bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4 text-gray-600" />
          </button>
        )}
      </div>
    );
  }
);

NumberInput.displayName = 'NumberInput';

export { NumberInput };