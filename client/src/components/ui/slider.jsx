'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '@/lib/utils';

const DualRangeSlider = React.memo(React.forwardRef(
  ({ className, ...props }, ref) => {
    return (
      <SliderPrimitive.Root
        ref={ref}
        className={cn('relative flex w-full touch-none select-none items-center', className)}
        {...props}
      >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-gray-300">
          <SliderPrimitive.Range className="absolute h-full bg-[#07486A] rounded-full" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-5.5 w-[1px] rounded-sm bg-[#07486A] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#07486A] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer shadow-sm" />
        <SliderPrimitive.Thumb className="block h-5.5 w-[1px] rounded-sm bg-[#07486A] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#07486A] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer shadow-sm" />
      </SliderPrimitive.Root>
    );
  }
), (prevProps, nextProps) => {
  // Custom comparison function - only re-render if value actually changed
  return (
    prevProps.value?.[0] === nextProps.value?.[0] &&
    prevProps.value?.[1] === nextProps.value?.[1] &&
    prevProps.min === nextProps.min &&
    prevProps.max === nextProps.max &&
    prevProps.step === nextProps.step
  );
});

DualRangeSlider.displayName = 'DualRangeSlider';

export { DualRangeSlider };