import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const DesktopNav = ({ navLinks }) => {
  const location = useLocation();

  return (
    <nav className="hidden md:flex items-center justify-center lg:space-x-0.5 md:space-x-0">
      {navLinks.map(({ to, label, activePaths }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => {
            const isPathActive = activePaths
              ? activePaths.some(path => location.pathname.startsWith(path))
              : isActive;
            return ` 2xl:text-[16px] lg:text-[12px] md:text-[10px] font-[500] h-[28px] 2xl:h-[42px] lg:h-[30px] md:h-[28px] xl:px-[14px] 2xl:px-[24px] lg:px-[10px] md:px-[8px] rounded-[5px] flex justify-center items-center transition-colors whitespace-nowrap ${
              isPathActive
                ? 'text-[#fff] bg-[#07486a]'
                : 'text-[#333333] hover:text-[#07486a]'
            }`;
          }}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
};

export default DesktopNav;

