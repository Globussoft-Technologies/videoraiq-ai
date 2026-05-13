import React, { useEffect, useState, useRef } from 'react';
import useOnClickOutside from '../hooks/useOnClickOutside';

import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { authorizedUsers } from '@/page/user/Dashboard/Api/get';
import { Tooltip, TooltipContent, TooltipTrigger, } from '@/components/ui/Tooltip';
import {
  Info,
  ChevronDownIcon,
  CheckIcon,
  TrashIcon,
  X
} from 'lucide-react';

const SelectAuthorisedUsers = ({ value = [], onChange, limit = 10, skip = 0 }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useOnClickOutside(dropdownRef, () => {
    if (dropdownOpen) setDropdownOpen(false);
  });

  useEffect(() => {
    let mounted = true;
    async function fetchUsers() {
      setLoading(true);
      try {
        const res = await authorizedUsers(skip, limit);
        if (res?.body?.status === 'success') {
          const fetchedUsers = res.body.data.users || [];
          if (mounted) {
            setUsers(fetchedUsers);
          }
        }
      } catch {
        setUsers([]);
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
    return () => { mounted = false; };
  }, [skip, limit]);

  const handleSelect = (userId) => {
    if (value.includes(userId)) {
      onChange(value.filter((id) => id !== userId));
    } else {
      onChange([...value, userId]);
    }
  };

  const handleSelectAll = (e) => {
    e.stopPropagation();
    const allIds = users.map((u) => u._id);
    onChange(allIds);
  };

  const handleClearAll = (e) => {
    e.stopPropagation();
    onChange([]);
  };

  // Close dropdown on Escape key
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dropdownOpen]);

  return (
    <div ref={dropdownRef} className="bg-[#F5F5F5] px-6 py-5 rounded-[10px] space-y-3 text-xs md:text-sm">
      <div className="flex justify-between items-center">
        <label className="2xl:text-[16px] xl:text-sm text-[#7A7A7A] font-[400] ml-2 text-[11px] md:text-sm flex items-center">
          Select Authorised Users
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="2xl:h-4 2xl:w-4 w-3 h-3 ml-1 text-gray-400" />
            </TooltipTrigger>
            <TooltipContent
              className="bg-white text-black max-w-[150px] whitespace-normal break-words text-center"
              arrowClassName="bg-white fill-white"
            >
              <p className="text-[#333333] font-[400] 2xl:text-xs text-[10px]">
                Select users who are authorized for this setting
              </p>
            </TooltipContent>
          </Tooltip>
        </label>
      </div>
      <div className="relative mb-5">
        <div className="relative">
          <div
            className="min-h-[42px] w-full overflow-hidden px-3 py-2 text-xs md:text-sm bg-[#F5F5F5] text-[#686868] font-[400] border border-[#80808059] rounded-[10px] shadow-none cursor-pointer flex flex-wrap items-center gap-2"
            onClick={() => setDropdownOpen((prev) => !prev)}
          >
            {value.length > 0 ? (
              users.filter((u) => value.includes(u._id)).map((u) => (
                <Badge
                  key={u._id}
                  className="bg-gray-800 text-white px-1.5 md:px-2 flex items-center gap-0.5 md:gap-1 rounded-[4px] md:rounded-[5px] text-[10px] md:text-xs"
                >
                  <span className="truncate max-w-[150px] md:max-w-none">
                    {u.firstName} {u.lastName}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent dropdown toggle
                      handleSelect(u._id); // Remove this user
                    }}
                    className="ml-0.5 md:ml-1 hover:bg-[#07486A] text-[#07486A] hover:text-white rounded-full p-0.5"
                  >
                    <X className="h-2.5 w-2.5 md:h-3 md:w-3 cursor-pointer text-white" />
                  </button>
                </Badge>
              ))
            ) : (
              <span className="text-[#686868] text-xs md:text-sm">
                Choose Authorised Users
              </span>
            )}
          </div>

          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
            <ChevronDownIcon className="h-4 w-4 opacity-50" />
          </div>
        </div>
        <div
          className={`authorised-users-dropdown absolute top-full left-0 w-full mt-1 bg-[#FAFAFA] select-none border border-[#80808059] rounded-[10px] shadow-md z-1 ${dropdownOpen ? '' : 'hidden'}`}
        >
          {/* Dropdown heading on top left */}
          <div className="flex justify-start items-center px-2 pt-2 pb-0">
            <span className="text-xs md:text-sm text-[#7A7A7A] font-medium px-2 py-1 rounded-md">
              Authorised Users
            </span>
          </div>
          <div className="flex justify-between items-center p-2 border-b border-[#80808059]">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectAll(e);
              }}
              className="text-[#07486A] cursor-pointer text-xs md:text-sm font-medium hover:underline flex items-center gap-1"
            >
              <CheckIcon className="h-3 w-3" />
              Select All
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClearAll(e);
              }}
              className="text-[#C41717] cursor-pointer text-xs md:text-sm font-medium hover:underline flex items-center gap-1"
            >
              <TrashIcon className="h-3 w-3" />
              Clear All
            </button>
          </div>
          <div className="p-2 max-h-48 md:max-h-92 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100 text-xs md:text-sm">
            {loading ? (
              <div className="p-2 text-center text-[#999999]">Loading...</div>
            ) : users.length === 0 ? (
              <div className="p-2 text-center text-[#999999]">No users found</div>
            ) : (
              users.map((user) => (
                <div
                  key={user._id}
                  className="flex flex-col justify-start md:justify-center md:flex-row md:items-center gap-2 p-2 hover:bg-[#E5E5E5] rounded-md cursor-pointer text-xs md:text-sm"
                >
                  <div
                    className="flex flex-row items-center gap-2 w-full text-xs md:text-sm cursor-pointer"
                    onClick={(e) => {
                      if (e.target.type !== 'checkbox') {
                        handleSelect(user._id);
                      }
                    }}
                  >
                    <Checkbox
                      id={user._id}
                      checked={value.includes(user._id)}
                      onCheckedChange={() => handleSelect(user._id)}
                      className="data-[state=checked]:bg-[#07486A] data-[state=checked]:text-white cursor-pointer"
                    />
                    <div className="flex flex-col flex-1 min-w-0">
                      <p className="text-xs md:text-sm text-[#333333] font-[400] flex items-center gap-1">
                        {user.firstName} {user.lastName}
                      </p>
                      <span className="text-[10px] md:text-xs text-[#999999] font-[400]">
                        {user.email}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectAuthorisedUsers;
