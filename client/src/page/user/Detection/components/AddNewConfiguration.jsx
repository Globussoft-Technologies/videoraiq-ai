import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Select from 'react-select';
import DetectionSettingsForm from './ManageSettings';
import { getAllDetectionTypes } from '../Api/get';

const selectStyles = {
  control: (base) => ({
    ...base,
    height: '48px',
    borderRadius: '10px',
    border: '1px solid #80808059',
    backgroundColor: '#FAFAFA',
    fontSize: '14px',
    fontWeight: '400',
    cursor: 'pointer',
    outline: 'none',
    boxShadow: 'none',
    '&:hover': {
      outline: 'none',
      boxShadow: 'none',
      border: '1px solid #80808059',
    },
    '&:focus': {
      outline: 'none',
      boxShadow: 'none',
    },
    '&:focus-within': {
      outline: 'none',
      boxShadow: 'none',
    },
    '&:focus-visible': {
      outline: 'none',
      boxShadow: 'none',
    },
  }),
  indicatorSeparator: () => ({
    display: 'none',
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: '#FAFAFA',
    fontSize: '14px',
    fontWeight: '400',
    color: '#333333',
    borderRadius: '10px',
    overflow: 'hidden',
    border: '1px solid #80808059',
  }),
  menuList: (base) => ({
    ...base,
    maxHeight: '280px',
    '&::-webkit-scrollbar': {
      width: '0px',
      display: 'none',
    },
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? '#f1f1f1' : '#FAFAFA',
    color: '#333333',
    cursor: 'pointer',
    padding: '8px 12px',
    '&:hover': {
      backgroundColor: '#f1f1f1',
    },
  }),
  placeholder: (base) => ({
    ...base,
    color: '#333333',
    fontSize: '14px',
    fontWeight: '400',
  }),
};

const AddNewConfiguration = ({ isEdit, setAddedDetection }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [detectionTypes, setDetectionTypes] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const fetchDetectionTypes = async () => {
    try {
      const res = await getAllDetectionTypes();
      const typesObj = res?.data?.body?.data?.detectionTypes || {};
      // Convert object to array of { key, label }
      const typesArr = Object.entries(typesObj).map(([key, label]) => ({
        key,
        label,
      }));
      setDetectionTypes(typesArr);
    } catch (err) {
      setDetectionTypes([]);
    }
  };
  useEffect(() => {
    fetchDetectionTypes();
  }, []);

  return (
    <div className="bg-[#FFFFFF] rounded-[10px]">
      <div
        className="flex items-center justify-between px-4 py-6 rounded-[10px] bg-[#FAFAFA] cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="md:text-[20px] text-sm font-medium text-[#333333]">
          {isEdit
            ? 'Edit Configurations Settings'
            : 'Add New Configure Settings'}
        </h2>
        {isExpanded ? (
          <ChevronUp className="w-8 h-8 text-[#333333]" />
        ) : (
          <ChevronDown className="w-8 h-8 text-[#333333]" />
        )}
      </div>

      {isExpanded && (
        <div className="py-4">
          <div className="bg-[#F9F9F9] pt-6 pb-0 px-6 rounded-[10px] flex flex-col md:flex-row sm:items-end justify-between gap-4 w-full">
            {/* Left Section: Label + Select (should stretch full width) */}
            <div className="flex-1 w-full pb-5">
              <label className="block text-sm text-[#7A7A7A] mb-3 ml-2 font-[400]">
                Select Detection Type
              </label>
              <Select
                className="w-full"
                value={detectionTypes.find(
                  (option) => option.key === selectedType
                )}
                onChange={(selected) => setSelectedType(selected?.key || '')}
                options={detectionTypes}
                getOptionLabel={(option) => option.label}
                getOptionValue={(option) => option.key}
                placeholder="Select Detection Type"
                isSearchable={true}
                isClearable={true}
                noOptionsMessage={() => 'No detection types found'}
                styles={selectStyles}
              />
            </div>
          </div>

          {/* Manage Settings Form: show when selectedType is set */}
          {selectedType && (
            <div>
              <DetectionSettingsForm
                selectedType={selectedType}
                setIsExpanded={setIsExpanded}
                isExpanded={isExpanded}
                setSelectedType={setSelectedType}
                setAddedDetection={setAddedDetection}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AddNewConfiguration;
