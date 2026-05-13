import React from 'react';
import { RadioGroupItem } from "./radio-group";
import { cn } from "@/lib/utils";

const RadioOption = ({
  img,
  title,
  description,
  value,
  className,
  ...props
}) => {
  return (
    <div className={cn("flex items-start bg-[#FAFAFA] gap-3 p-5 rounded-[10px] hover:bg-gray-50 transition-colors", className)}>
      <div className="flex-shrink-0 mt-0.5">
        <RadioGroupItem value={value} className="border-[#0B1A6A]  mt-3 text-[#0B1A6A]" id={value} {...props} />
      </div>
      <label className="flex-1 min-w-0 cursor-pointer" htmlFor={value}>
        <div className="flex items-center gap-2 mb-1">
          {img}
          <span className="font-medium text-gray-900 text-sm">{title}</span>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
      </label>
    </div>
  );
};

export default RadioOption;
// This component is a reusable radio option with an icon, title, and description.