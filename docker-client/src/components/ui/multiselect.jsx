import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDownIcon, Search } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/Tooltip';

/*
 * Usage Example:
 * const options = [
 *   { id: '1', label: 'Option 1' },
 *   { id: '2', label: 'Option 2', disabled: true, tooltip: 'Not available' }
 * ];
 * const [value, setValue] = useState([]);
 *
 * <MultiSelect
 *   options={options}
 *   value={value}
 *   onChange={setValue}
 *   placeholder="Select options"
 * />
 */
const MultiSelect = ({
  msg,
  options = [],
  value = [],
  onChange,
  placeholder = 'Select options',
  disabled = false,
  showSelectAll = true,
  selectAllText = 'Select All',
  clearAllText = 'Clear All',
  searchable = true,
  searchPlaceholder = 'Search...',
  className = '',
  maxHeight = 'max-h-60',
  renderOption,
  onSelectAll,
  onClearAll,
  ...props
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Filter options based on search
  const filteredOptions = options.filter((option) =>
    option?.label?.toLowerCase?.().includes(searchTerm.toLowerCase())
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
        setFocusedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Toggle option selection
  const toggleOption = useCallback(
    (optionId) => {
      const option = options.find((opt) => opt.id === optionId);
      // Prevent toggling disabled or header options
      if (option?.disabled || option?.isNvrHeader) return;

      const isLocationType = props.type === 'location';
      const optionValue = isLocationType ? option.label : option.id;
      const newValue = value.includes(optionValue)
        ? value.filter((val) => val !== optionValue)
        : [...value, optionValue];

      onChange(newValue);
    },
    [value, onChange, options, props.type]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev < filteredOptions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredOptions.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
            const option = filteredOptions[focusedIndex];
            if (!option.disabled) {
              toggleOption(option.id);
            }
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setSearchTerm('');
          setFocusedIndex(-1);
          break;
      }
    },
    [isOpen, focusedIndex, filteredOptions, toggleOption]
  );

  // Select all non-disabled options
  const handleSelectAll = () => {
    const isLocationType = props.type === 'location';
    const selectableValues = filteredOptions
      .filter((option) => !option.disabled && !option.isNvrHeader)
      .map((option) => (isLocationType ? option.label : option.id));

    const newValue = [...new Set([...value, ...selectableValues])];
    onChange(newValue);
    if (onSelectAll) onSelectAll(newValue);
  };

  // Clear all
  const handleClearAll = () => {
    onChange([]);
    if (onClearAll) onClearAll([]);
  };

  // Get selected options - maintain order from value array
  const selectedOptions =
    props.type === 'location'
      ? options.filter((opt) => value.includes(opt.label))
      : value
          .map((id) => options.find((option) => option.id === id))
          .filter(Boolean);

  // Default render functions
  const defaultRenderOption = (option, isSelected, isFocused) => {
    if (option.isNvrHeader) {
      return (
        <div className="px-4 py-2 font-semibold text-[#333333] text-xs bg-[#F3F4F6] border-b border-[#E5E7EB]">
          {option.label}
        </div>
      );
    }

    return (
      <div
        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
          isFocused ? 'bg-[#F5F5F5]' : 'hover:bg-[#F5F5F5]'
        } ${option.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            toggleOption(option.id);
          }}
          className="h-4 w-4 rounded border-2 border-gray-300 text-[#07486A] focus:ring-2 focus:ring-[#07486A] focus:ring-offset-0 cursor-pointer accent-[#07486A]"
          disabled={option.disabled}
        />
        <label className="text-xs text-[#333333] font-normal cursor-pointer flex-1 select-none">
          {option.label}
        </label>
      </div>
    );
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef} {...props}>
      {/* Trigger */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`min-h-[40px] w-full px-4 py-2.5 text-xs bg-white text-[#333333] font-medium border border-[#D1D5DB] rounded-lg shadow-none flex items-center gap-2 cursor-pointer transition-all hover:border-[#9CA3AF] ${
          disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''
        } ${isOpen ? 'border-[#07486A] ring-1 ring-[#07486A]' : ''}`}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
          <span className="text-[#333333] text-xs font-medium truncate">
            {selectedOptions.length > 0
              ? selectedOptions[0].label
              : placeholder}
          </span>
          {selectedOptions.length > 1 && (
            <span className="bg-[#07486A] text-white text-xs select-none font-medium px-2 py-0.5 rounded-full flex-shrink-0">
              +{selectedOptions.length - 1} more
            </span>
          )}
        </div>
        <ChevronDownIcon
          className={`h-5 w-5 text-[#6B7280] transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 w-full mt-2 bg-white border border-[#D1D5DB] rounded-lg shadow-lg z-50">
          {/* Select All / Clear All */}
          {showSelectAll && (
            <div className="flex justify-between items-center px-4 py-3 border-b border-[#E5E7EB]">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[#333333] select-none cursor-pointer text-xs font-normal hover:underline flex items-center gap-1"
              >
                {selectAllText}
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[#EF4444] select-none cursor-pointer text-xs font-normal hover:underline flex items-center gap-1"
              >
                {clearAllText}
              </button>
            </div>
          )}

          {/* Search */}
          {searchable && (
            <div className="px-4 py-2 border-b border-[#E5E7EB]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-[#D1D5DB] rounded-md focus:outline-none focus:ring-1 focus:ring-[#07486A] focus:border-[#07486A]"
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>
          )}

          {/* Options List */}
          <div
            className={`overflow-y-auto ${maxHeight} py-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent`}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => {
                const isSelected =
                  props.type === 'location'
                    ? value.includes(option.label)
                    : value.includes(option.id);
                const isFocused = index === focusedIndex;
                const optionElement = renderOption
                  ? renderOption(option, isSelected, isFocused, toggleOption)
                  : defaultRenderOption(option, isSelected, isFocused);

                if (option.disabled || option.isNvrHeader) {
                  return <div key={option.id}>{optionElement}</div>;
                }

                return (
                  <div key={option.id} onClick={() => toggleOption(option.id)}>
                    {optionElement}
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-gray-500 text-xs">
                {msg || ' No options found'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiSelect;
