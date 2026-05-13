import React from 'react';
import { X, Pencil, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import SelectMulti from 'react-select';

const EditCameraInfo = ({
  aliasInput,
  setAliasInput,
  selectedDepartments,
  setSelectedDepartments,
  departmentOptions,
  isSaving,
  onSave,
  onCancel,
}) => {
  return (
    <div 
      className="absolute top-20 right-4 z-50 w-full max-w-[320px] bg-neutral-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl animate-in slide-in-from-right duration-300"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-white font-medium flex items-center gap-2 text-sm">
          <Pencil size={16} className="text-blue-400" />
          Camera Settings
        </h4>
        <button
          onClick={onCancel}
          className="text-neutral-400 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest px-1">
            Alias Name
          </label>
          <Input
            value={aliasInput}
            onChange={(e) => setAliasInput(e.target.value)}
            placeholder="Enter camera alias"
            className="h-9 bg-black/20 border-white/10 text-white focus:ring-[#07486A] text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest px-1">
            Assigned Departments
          </label>
          <SelectMulti
            isMulti
            value={selectedDepartments}
            onChange={setSelectedDepartments}
            options={departmentOptions}
            placeholder="Select..."
            className="text-xs"
            classNamePrefix="Select"
            menuPortalTarget={document.body}
            styles={{
              control: (base) => ({
                ...base,
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                minHeight: '36px',
              }),
              menu: (base) => ({
                ...base,
                backgroundColor: '#171717',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }),
              option: (base, state) => ({
                ...base,
                backgroundColor: state.isFocused ? '#262626' : 'transparent',
                color: 'white',
                fontSize: '12px',
              }),
              multiValue: (base) => ({
                ...base,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '4px',
              }),
              multiValueLabel: (base) => ({
                ...base,
                color: 'white',
                fontSize: '11px',
              }),
              multiValueRemove: (base) => ({
                ...base,
                color: 'white',
                ':hover': {
                  backgroundColor: '#ef4444',
                  color: 'white',
                },
              }),
              input: (base) => ({
                ...base,
                color: 'white',
              }),
              singleValue: (base) => ({
                ...base,
                color: 'white',
              }),
              menuPortal: (base) => ({
                ...base,
                zIndex: 9999,
              }),
            }}
          />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            className="flex-1 h-9 text-xs text-neutral-400 hover:text-white hover:bg-white/5"
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={isSaving}
            className="flex-1 h-9 bg-[#07486A] hover:bg-[#063b57] text-white text-xs font-semibold"
          >
            {isSaving ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              'Save Details'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EditCameraInfo;
