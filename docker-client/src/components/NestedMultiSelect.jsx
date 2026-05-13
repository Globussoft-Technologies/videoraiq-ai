import React, { useState, useMemo, useEffect } from 'react';
import { X, Bell } from 'lucide-react';
import MultiSelect from '@/components/ui/multiselect';
import { detectionOptions } from '@/data/detectionOptions';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

// Helper to format options for the MultiSelect component
const formatOptions = (options) => {
  return options.map((opt) => ({ id: opt, label: opt }));
};

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';

const NestedMultiSelect = ({ value, onChange, options }) => {
  const [error, setError] = useState('');
  // Accept two shapes for `value`:
  // - Nested shape: { parent: { enabled, subscribed, notified, subcategories: { child: { enabled, subscribed, notified }}}}
  // - Backend shape: { parent: [ { name, enable, notify } ] }
  // Normalize backend shape into nested UI shape so defaults from props display correctly.
  const selectedDetections = useMemo(() => {
    if (!value || typeof value !== 'object') return {};

    // Heuristic: backend format has arrays as values
    const looksLikeBackend = Object.values(value).some((v) => Array.isArray(v));
    if (!looksLikeBackend) return value;

    const normalized = {};
    Object.entries(value).forEach(([parent, items]) => {
      if (!Array.isArray(items) || items.length === 0) return;

      normalized[parent] = {
        enabled: true,
        subscribed: false,
        notified: false,
        subcategories: {},
      };

      items.forEach((item) => {
        if (!item || !item.name) return;
        const originalName = item.name || '';
        const key = originalName.toLowerCase();

        normalized[parent].subcategories[key] = {
          enabled: Boolean(item.enable || item.enabled),
          subscribed: Boolean(originalName && originalName.length > 0),
          notified: Boolean(item.notify || item.notified),
          __originalName: originalName,
        };

        if (item.notify) normalized[parent].notified = true;
        if (originalName) normalized[parent].subscribed = true;
      });
    });

    return normalized;
  }, [value]);

  console.log(selectedDetections, 'selectedDetections');

  const detectionOptions = useMemo(() => {
    const map = {};

    options.forEach((parent) => {
      if (parent?.value && Array.isArray(parent.objects)) {
        map[parent.value] = parent.objects.map((obj) => obj.name);
      }
    });

    return map;
  }, [options]);

  // Flatten options for the MultiSelect component
  const flattenedOptions = useMemo(() => {
    const flatOptions = [];

    // Header for the checkboxes
    flatOptions.push({ id: 'header-labels', isLabelsHeader: true });

    Object.entries(detectionOptions).forEach(([parent, children]) => {
      // Add parent as a selectable category
      flatOptions.push({ id: parent, label: parent, isParent: true });

      // Add sub-categories
      children.forEach((child) => {
        flatOptions.push({ id: `${parent}:${child}`, label: child, parent });
      });
    });

    return flatOptions;
  }, [detectionOptions]);

  // Map incoming value (object structure) to flat selected IDs for MultiSelect
  // We use suffixes :subscribed and :notified for the other checkboxes
  const selectedIds = useMemo(() => {
    const ids = [];
    Object.entries(selectedDetections).forEach(([parent, data]) => {
      if (data.enabled) ids.push(parent);
      if (data.subscribed) ids.push(`${parent}:subscribed`);
      if (data.notified) ids.push(`${parent}:notified`);

      Object.entries(data.subcategories || {}).forEach(([child, flags]) => {
        if (flags.enabled) ids.push(`${parent}:${child}`);
        if (flags.subscribed) ids.push(`${parent}:${child}:subscribed`);
        if (flags.notified) ids.push(`${parent}:${child}:notified`);
      });
    });
    return ids;
  }, [selectedDetections]);

  // Handle change from MultiSelect or custom checkboxes
const handleToggle = (idToToggle, currentSelection) => {
  let prevIds = currentSelection;
  const isAdding = !prevIds.includes(idToToggle);

  let updatedIds = isAdding
    ? [...prevIds, idToToggle]
    : prevIds.filter((id) => id !== idToToggle);
 
  const parts = idToToggle.split(':');
  const parentName = parts[0];
  const childrenNames = detectionOptions[parentName] || [];
  const flagSuffix = parts[1] ? `:${parts[1]}` : '';

  const isParentToggle =
    parts.length === 1 ||
    (parts.length === 2 &&
      (parts[1] === 'subscribed' || parts[1] === 'notified'));

  /* -------------------------
     PARENT SELECT → AUTO SELECT FIRST CHILD
  ------------------------- */
  if (isParentToggle && isAdding && flagSuffix === '') {
    if (childrenNames.length > 0) {
      const firstChild = childrenNames[0];
      const childEnableId = `${parentName}:${firstChild}`;
      const childSubscribeId = `${parentName}:${firstChild}:subscribed`;

      if (!updatedIds.includes(childEnableId)) updatedIds.push(childEnableId);
      if (!updatedIds.includes(childSubscribeId)) updatedIds.push(childSubscribeId);
    }
  }

  /* -------------------------
     PARENT DESELECT → REMOVE ALL CHILDREN & FLAGS
  ------------------------- */
  if (isParentToggle && !isAdding) {
    if (flagSuffix === '') {
      updatedIds = updatedIds.filter((id) => !id.startsWith(parentName));
    } else {
      // Remove corresponding flags under children
      childrenNames.forEach((child) => {
        const childFlagId = `${parentName}:${child}${flagSuffix}`;
        updatedIds = updatedIds.filter((id) => id !== childFlagId);
      });
    }
  }

  /* -------------------------
     CHILD DESELECT → REMOVE ITS SUBSCRIBE & NOTIFY
  ------------------------- */
  const isChildDeselection =
    !isAdding &&
    parts.length === 2 &&
    parts[1] !== 'subscribed' &&
    parts[1] !== 'notified';

  if (isChildDeselection) {
    updatedIds = updatedIds.filter(
      (id) =>
        id !== `${idToToggle}:subscribed` &&
        id !== `${idToToggle}:notified`
    );
  }

  /* -------------------------
     ENSURE PARENT ENABLED WHEN CHILD/FLAGS SELECTED
  ------------------------- */
  if (isAdding && parts.length > 1 && !updatedIds.includes(parentName)) {
    updatedIds.push(parentName);
  }

  /* -------------------------
     AUTO UNCHECK PARENT IF ALL CHILDREN DESELECTED
  ------------------------- */
  childrenNames.forEach((child) => {
    const childId = `${parentName}:${child}`;
    const childSelected = updatedIds.includes(childId);
    if (!childSelected) {
      // if all children are unchecked, remove parent
      const anyChildSelected = childrenNames.some((c) =>
        updatedIds.includes(`${parentName}:${c}`)
      );
      if (!anyChildSelected) {
        updatedIds = updatedIds.filter((id) => id !== parentName);
      }
    }
  });

  /* -------------------------
     REBUILD OBJECT STATE
  ------------------------- */
  const newSelectedDetections = {};

  updatedIds.forEach((id) => {
    const p = id.split(':');
    const parent = p[0];

    if (!newSelectedDetections[parent]) {
      newSelectedDetections[parent] = {
        enabled: false,
        subscribed: false,
        notified: false,
        subcategories: {},
      };
    }

    if (p.length === 1) {
      newSelectedDetections[parent].enabled = true;
    } else if (p.length === 2) {
      if (p[1] === 'subscribed') {
        newSelectedDetections[parent].subscribed = true;
      } else if (p[1] === 'notified') {
        newSelectedDetections[parent].notified = true;
      } else {
        const child = p[1];
        newSelectedDetections[parent].subcategories[child] ??= {
          enabled: false,
          subscribed: false,
          notified: false,
        };
        newSelectedDetections[parent].subcategories[child].enabled = true;
      }
    } else if (p.length === 3) {
      const child = p[1];
      newSelectedDetections[parent].subcategories[child] ??= {
        enabled: false,
        subscribed: false,
        notified: false,
      };
      newSelectedDetections[parent].subcategories[child][p[2]] = true;
    }
  });

  onChange(newSelectedDetections);
};



const handleMultiSelectChange = (newIds) => {
  const prevIds = selectedIds;

  const added = newIds.filter((id) => !prevIds.includes(id));
  const removed = prevIds.filter((id) => !newIds.includes(id));

  // ✅ CLEAR ALL
  if (newIds.length === 0) {
    onChange({});
    return;
  }

  // ✅ BULK SELECT / DESELECT (Select All)
  if (added.length > 1 || removed.length > 1) {
    const newState = {};

    Object.entries(detectionOptions).forEach(([parent, children]) => {
      newState[parent] = {
        enabled: true,
        subscribed: true,
        notified: true,
        subcategories: {},
      };

      children.forEach((child) => {
        const key = child.toLowerCase();

        newState[parent].subcategories[key] = {
          enabled: true,
          subscribed: true,
          notified: true,
        };
      });
    });

    onChange(newState);
    return;
  }

  // ✅ SINGLE TOGGLE (delegate to existing logic)
  const toggledId = added[0] || removed[0];
  if (toggledId) {
    handleToggle(toggledId, prevIds);
  }
};


  // Custom render for grouped/indented look with three checkboxes
  const renderGroupedOption = (option, isSelected, isFocused) => {
    if (option.isLabelsHeader) {
      return (
        <div className="flex items-center px-4 py-1 pb-2 border-b border-gray-100 bg-white sticky top-0 z-10 font-sans">
          <div className="flex-1" />
          <div className="flex items-center gap-6 w-[120px] justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[10px] text-gray-400 font-medium uppercase text-center w-10 leading-tight cursor-help">
                  Subscribe
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">Subscribe to alerts</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[10px] text-gray-400 font-medium uppercase text-center w-10 leading-tight cursor-help">
                  Notif
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">Receive notifications</TooltipContent>
            </Tooltip>
          </div>
        </div>
      );
    }

    const isSubscribed = selectedIds.includes(`${option.id}:subscribed`);
    const isNotified = selectedIds.includes(`${option.id}:notified`);

    const Checkbox = ({ checked, onToggle, tooltip, className = '' }) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={`flex items-center justify-center w-10 h-10 cursor-pointer ${className}`}
          >
            <div
              className={`w-3.5 h-3.5 rounded border-2 transition-colors flex items-center justify-center ${checked ? 'bg-[#07486A] border-[#07486A]' : 'bg-white border-gray-300'}`}
            >
              {checked && (
                <div className="w-1.5 h-1.5 bg-white rounded-[1px]" />
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltip}</TooltipContent>
      </Tooltip>
    );

if (option.isParent) {
  return (
    <div
      onClick={(e) => e.stopPropagation()} // 🚫 block row click
      className={`flex items-center px-4 py-0 transition-colors border-y border-gray-100 ${
        isFocused ? 'bg-gray-100' : 'bg-gray-50'
      }`}
    >
      <div className="flex items-center p-1 gap-3 flex-1">
        {/* ✅ ONLY this toggles */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => handleToggle(option.id, selectedIds)}
          className="h-3.5 w-3.5 rounded border-2 border-gray-300 accent-[#07486A]"
        />

        {/* 🚫 label does NOTHING */}
        <span
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] font-bold text-[#07486A] uppercase tracking-tight select-none cursor-default"
        >
          {option.label}
        </span>
      </div>

      <div className="flex items-center gap-6 w-[140px] justify-end" />
    </div>
  );
}

    return (
      <div
        className={`flex items-center px-4 py-0 transition-colors ${
          isFocused ? 'bg-[#F5F5F5]' : ''
        }`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className="ml-2 flex items-center gap-3 flex-1">
          {/* Changed ml-4 to ml-2 */}

          {/* Spacer to keep alignment */}
          <span className="text-xs text-[#333333] font-normal">
            {option.label}
          </span>
        </div>
        <div className="flex items-center gap-6 w-[120px] justify-end">
            <Tooltip>
            <TooltipTrigger asChild>
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center w-10 h-10"
              >
                <Switch
                  checked={isSubscribed}
                  onCheckedChange={() => {
                  handleToggle(`${option.id}:subscribed`, selectedIds);
                  }}
                  className="scale-75"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              {`Subscribe to ${option.label} alerts`}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                onClick={(e) => {
                  const notifyId = `${option.id}:notified`;
                  const subscribeId = `${option.id}:subscribed`;

                  const isTurningOn = !selectedIds.includes(notifyId);

                  // 🚫 Only block when TURNING ON notify
                  if (isTurningOn && !selectedIds.includes(subscribeId)) {
                    setError(
                      `Please subscribe to "${option.label}" before enabling notifications`
                    );
                    setTimeout(() => setError(''), 3000);
                    return;
                  }

                  setError('');
                  handleToggle(notifyId, selectedIds);
                }}
                className="flex items-center justify-center w-10 h-10 cursor-pointer"
              >
                <Bell
                  className={cn(
                    'w-4 h-4 transition-colors',
                    isNotified
                      ? 'fill-[#07486A] text-[#07486A]'
                      : 'text-gray-400'
                  )}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              {`Get notified for ${option.label}`}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {error && (
        <div className="text-red-500 text-xs ml-2 p-2 bg-red-50 rounded border border-red-200">
          ⚠️ {error}
        </div>
      )}
      {/* <label className="text-xs text-gray-500 ml-2 block">Select Objects</label> */}
      <MultiSelect
        options={flattenedOptions}
        value={selectedIds.filter(
          (id) => !id.endsWith(':subscribed') && !id.endsWith(':notified')
        )}
        onChange={handleMultiSelectChange}
        placeholder="Select objects..."
        searchable={true}
        searchPlaceholder="Search objects..."
        className="w-full"
        renderOption={renderGroupedOption}
        msg="No objects found"
      />
    </div>
  );
};

export default NestedMultiSelect;
