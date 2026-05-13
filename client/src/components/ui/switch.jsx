import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

function Switch({ className, ...props }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // Full switch background and sizing
        'peer inline-flex h-[26px] cursor-pointer w-[45px] shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500',
        // State-based background
        'data-[state=checked]:bg-[#07486a] data-[state=unchecked]:bg-gray-300',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          // White circle
          'pointer-events-none block h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform',
          // Move thumb when checked
          'data-[state=checked]:translate-x-[19px] data-[state=unchecked]:translate-x-[2px]'
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
