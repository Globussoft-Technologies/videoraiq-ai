import React, { useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { USER_AVTAR_INITIALS } from '@/components/Avatars';


const ProfileDropdown = ({
  user,
  handleLogout,
  profileDrop,
  setProfileDrop,
}) => {
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);
  const { VITE_FRONTEND } = import.meta.env;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setProfileDrop(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setProfileDrop]);

  return (
    <div className="relative">
      <div
        ref={buttonRef}
        className="xl:w-[44px] xl:h-[44px] 2xl:w-[61px] 2xl:h-[61px] lg:w-[42px] lg:h-[42px] md:w-[38px] md:h-[38px] sm:w-[42px] sm:h-[42px] w-[36px] h-[36px] flex items-center justify-center cursor-pointer"
        onClick={() => setProfileDrop((prev) => !prev)}
      >
        <img
          src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
            (user?.name_f ?? '') + (user?.name_l ?? user?.user_email)
          )}&backgroundColor=07486A&textColor=FFFFFF&fontSize=31`}
          alt="User Avatar"
          className="h-full w-full rounded-[9px] 2xl:rounded-[10px]"
        />
      </div>

      {profileDrop && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-[52px] 2xl:top-[72px] lg:top-[58px] md:top-[56px] bg-white shadow-custom-light py-[10px] 2xl:py-[18px] lg:py-[12px] md:py-[10px] rounded-[18px] 2xl:rounded-[20px] w-max"
        >
          <div className="flex items-center gap-[5px] 2xl:gap-[9px] lg:gap-[6px] md:gap-[5px] px-[12px] 2xl:px-[20px] lg:px-[14px] md:px-[12px] border-b-[1px] border-[#e4e4e4] pb-[6px] 2xl:pb-[12px] lg:pb-[8px] md:pb-[6px]">
            <div className="w-[40px] h-[40px] 2xl:w-[61px] 2xl:h-[61px] lg:w-[42px] lg:h-[42px] md:w-[38px] md:h-[38px] rounded-[9px] 2xl:rounded-[10px] flex items-center justify-center cursor-pointer">
              <img
                src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                  (user?.name_f ?? '') + (user?.name_l ?? user?.user_email)
                )}&backgroundColor=07486A&textColor=FFFFFF&fontSize=31`}
                alt="User Avatar"
                className="h-full w-full rounded-[9px] 2xl:rounded-[10px]"
              />
            </div>
            <div className="flex flex-col">
              <p className="text-[9px] 2xl:text-[12px] lg:text-[10px] md:text-[9px] text-[#696969] font-[400]">
                {user?.name_f ?? ''} {user?.name_l ?? ''}
              </p>
              <p className="text-[9px] 2xl:text-[12px] lg:text-[10px] md:text-[9px] text-[#696969] font-[400] truncate max-w-[130px]">
                {user?.user_email ?? ''}
              </p>
            </div>
          </div>
          <div className="px-[12px] 2xl:px-[20px] lg:px-[14px] md:px-[12px] pt-[6px] 2xl:pt-[12px] lg:pt-[8px] md:pt-[6px] flex flex-col gap-[8px] 2xl:gap-[16px] lg:gap-[10px] md:gap-[8px]">
            {!user.memberId&&(<NavLink
              to={`${VITE_FRONTEND}/profile`}
              className="text-[10.5px] 2xl:text-[14px] lg:text-[11.5px] md:text-[10.5px] font-[400] text-[#696969]"
            >
              Profile
            </NavLink>
         )}
            <button
              onClick={handleLogout}
              className="text-[10.5px] 2xl:text-[14px] cursor-pointer lg:text-[11.5px] md:text-[10.5px] font-[400] text-[#696969] text-left"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileDropdown;
