// src/components/ui/nested-select.jsx
import React, { useState } from 'react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ChevronRight } from 'lucide-react';

const NESTED_OPTIONS = {
  person: [
    { id: 'person_adult', label: 'Adult' },
    { id: 'person_child', label: 'Child' },
    { id: 'person_senior', label: 'Senior' },
  ],
  vehicle: [
    { id: 'vehicle_bike', label: 'Bike' },
    { id: 'vehicle_car', label: 'Car' },
    { id: 'vehicle_cycle', label: 'Cycle' },
    { id: 'vehicle_truck', label: 'Truck' },
    { id: 'vehicle_bus', label: 'Bus' },
  ],
  bag: [
    { id: 'bag_backpack', label: 'Backpack' },
    { id: 'bag_handbag', label: 'Handbag' },
    { id: 'bag_suitcase', label: 'Suitcase' },
    { id: 'bag_briefcase', label: 'Briefcase' },
  ],
};

const NestedSelect = ({ 
  value, 
  onValueChange, 
  disabled = false,
  placeholder = "Select objects"
}) => {
  // Extract category from value (e.g., "person_adult" -> "person")
  const selectedCategory = value ? value.split('_')[0] : '';

  const handleCategoryChange = (category) => {
    // When category changes, reset the nested value
    onValueChange('');
  };

  const handleNestedChange = (nestedValue) => {
    // Set the complete nested value
    onValueChange(nestedValue);
  };

  return (
    <div className="space-y-3">
      {/* Step 1: Category Select */}
      <div>
        <label className="text-xs text-gray-500 mb-2 ml-2 block">Category *</label>
        <Select 
          value={selectedCategory || ''} 
          onValueChange={handleCategoryChange} 
          disabled={disabled}
        >
          <SelectTrigger className="w-full border-gray-300 text-[#686868] rounded-lg text-sm h-11">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="person">👤 Person</SelectItem>
            <SelectItem value="vehicle">🚗 Vehicle</SelectItem>
            <SelectItem value="bag">👜 Bag</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Step 2: Nested Options Select - Only show if category is selected */}
      {selectedCategory && NESTED_OPTIONS[selectedCategory] && (
        <div>
          <label className="text-xs text-gray-500 mb-2 ml-2 block">
            {selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)} Type *
          </label>
          <Select 
            value={value || ''} 
            onValueChange={handleNestedChange} 
            disabled={disabled || !selectedCategory}
          >
            <SelectTrigger className="w-full border-gray-300 text-[#686868] rounded-lg text-sm h-11">
              <SelectValue placeholder={`Select ${selectedCategory} type`} />
            </SelectTrigger>
            <SelectContent>
              {NESTED_OPTIONS[selectedCategory].map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  <span className="flex items-center gap-2">
                    <ChevronRight className="h-3 w-3 text-gray-400" />
                    {item.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};

export { NestedSelect };