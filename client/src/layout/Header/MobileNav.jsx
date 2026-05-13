import React from 'react';
import { NavLink } from 'react-router-dom';
import DetectionToggle from '@/components/DetectionToggle';
import { X } from 'lucide-react';
import { usePermissions } from '@/context/Permission/PermissionContext';

const MobileNav = ({ isOpen, setIsOpen, detectionItems, detectionStates, handleToggleChange, navLinks }) => {
  const { permissions } = usePermissions();
  const canView = permissions?.dashboard?.view;
  const canEdit = permissions?.dashboard?.edit;

  if (!canView) {
    return;
  }
  return (
    <div
      className={`fixed top-0 right-0 h-full w-full min-[400px]:w-[298px] overflow-y-auto bg-white shadow-lg transform transition-all duration-300 ease-in-out z-50 p-4 flex-col gap-6 ${isOpen ? 'translate-x-0 opacity-100 pointer-events-auto' : 'translate-x-full opacity-0 pointer-events-none'}`}
    >
      {/* Close button: only visible at <=375px */}
      <button
        aria-label="Close menu"
        onClick={() => setIsOpen(false)}
        className="absolute top-4 right-4 z-50 min-[500px]:hidden p-2 rounded-full hover:bg-gray-100 focus:outline-none"
      >
        <X className="w-6 h-6 text-[#07486A]" strokeWidth={2} />
      </button>
      <div className="flex flex-col gap-5 border-b pb-4 border-[#D8D8D8]">
        <p className="text-[#07486A] text-[21px] font-[600]">Menu</p>
        <nav className="flex flex-col space-y-4">
          {navLinks.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setIsOpen(false)}
              className={({ isActive }) =>
                `text-[16px] font-[500] h-[42px] px-4 sm:px-6 rounded-full flex justify-start items-center transition-colors whitespace-nowrap ${isActive
                    ? 'text-[#fff] bg-[#07486a]'
                    : 'text-[#333333] hover:text-[#07486a]'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex flex-col gap-5 mt-5">
        <span className="text-[#07486A] text-[21px] font-[600]">Settings</span>
        <div className="flex flex-col gap-3">
          {detectionItems.map((item) => (
            <DetectionToggle
              key={item.id}
              item={{
                ...item,
                enabled: detectionStates[item.id],
              }}
              onChange={handleToggleChange}
              isExpanded={true}
              disabled={!canEdit}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default MobileNav;

