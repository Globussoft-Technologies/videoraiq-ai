import React from 'react';
import { Input } from '@/components/ui/input';
import { TriangleAlert } from 'lucide-react';

const FormField = ({ label, id, type, value, onChange, showAlert = false }) => {
  return (
    <div className="flex flex-col">
      <label
        htmlFor={id}
        className="text-sm font-normal ml-2 text-[#7A7A7A] mb-2"
      >
        {label}
      </label>
      <div className="relative">
        <Input
          type={type}
          id={id}
          value={value}
          onChange={onChange}
          readOnly={!onChange}
          className={`md:text-[16px] border border-[#80808059] text-[#333333] text-sm px-3 py-1.5 shadow-none bg-[#FAFAFA] ${showAlert ? 'pr-1' : ''}`}
        />
        {showAlert && (
          <TriangleAlert className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#CE241C]" />
        )}
      </div>
    </div>
  );
};

export default FormField;
